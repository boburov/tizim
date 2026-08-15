import mongoose from "mongoose";
import Notification from "../../../models/notification.model.js";
import NotificationRecipient from "../../../models/notificationRecipient.model.js";
import NotificationTemplate from "../../../models/notificationTemplate.model.js";
import User from "../../../models/user.model.js";
import Group from "../../../models/group.model.js";
import GroupMembership from "../../../models/groupMembership.model.js";
import BotUser from "../../../models/botUser.model.js";
import prisma from "../../../config/prisma.js";
import { withLegacyId, withPopulatedShape } from "../../../utils/serialize.js";
import ApiError from "../../../utils/ApiError.js";
import logger from "../../../config/logger.js";
import { ROLES } from "../../../constants/roles.js";
import {
  fetchBotStatusMap,
  BOT_STATUS,
} from "../../../helpers/botStatus.helper.js";
import {
  personalizeManyForUser,
  personalizeBulk,
} from "./personalizeBody.helper.js";
import { userBranchCondition } from "../../../helpers/branchContext.helper.js";

// OLUVCHILARNI FILIAL BO'YICHA KESISH.
//
// Ilgari `resolveAudience` ichidagi HECH BIR User.find'da filial ko'lami
// yo'q edi: "Barcha o'quvchilar" ni tanlagan filial direktori butun
// markazning o'quvchilariga xabar yuborardi va preview'da ularning
// ism-familiyasi bilan telefon raqamini ko'rardi
// (tests/branchLeak.test.js shu sizishni tutgan edi).
//
// $and ISHLATILADI, $or emas: userBranchCondition() o'zi $or qaytaradi va
// uni to'g'ridan-to'g'ri qo'yish filtrdagi boshqa $or ni jimgina bosib
// ketardi (helper izohida ogohlantirilgan).
//
// FON VAZIFALARI (Agenda job) ta'sirlanmaydi: ular request konteksti
// tashqarisida ishlaydi, u yerda helper `null` qaytaradi va filtr
// o'zgarishsiz qoladi.
const withBranchScope = (filter) => {
  const condition = userBranchCondition();
  return condition ? { ...filter, $and: [condition] } : filter;
};

// Bir vaqtning o'zida nechta bot xabari yuborilsin (Telegram ~30/sek global limit)
const DELIVERY_CONCURRENCY = 20;

const SENDER_PROJECTION = { firstName: 1, lastName: 1, role: 1 };

const runWithSession = async (fn) => {
  let session;
  try {
    session = await mongoose.startSession();
    session.startTransaction();
    const result = await fn(session);
    await session.commitTransaction();
    session.endSession();
    return result;
  } catch (err) {
    if (session) {
      try {
        await session.abortTransaction();
      } catch {
        /* noop */
      }
      session.endSession();
    }
    if (
      err?.code === 20 ||
      err?.codeName === "IllegalOperation" ||
      err?.message?.includes("Transaction") ||
      err?.message?.includes("replica set")
    ) {
      return fn(null);
    }
    throw err;
  }
};

// Teacher uchun ruxsat etilgan audience type'lar
const TEACHER_ALLOWED_AUDIENCE = new Set(["groups", "users", "individual"]);

// Bitta o'qituvchining barcha guruhlari ID'larini qaytaradi
const getTeacherGroupIds = async (teacherId) => {
  const groups = await Group.find(
    { teachers: teacherId, isActive: true, isDeleted: { $ne: true } },
    { _id: 1 },
  );
  return groups.map((g) => g._id);
};

// Bitta o'qituvchining barcha active o'quvchilari ID'larini qaytaradi
const getTeacherStudentIds = async (teacherId) => {
  const groupIds = await getTeacherGroupIds(teacherId);
  if (!groupIds.length) return [];
  const memberships = await GroupMembership.find(
    { group: { $in: groupIds }, leftAt: null, isDeleted: { $ne: true } },
    { student: 1 },
  );
  const set = new Set(memberships.map((m) => String(m.student)));
  return [...set];
};

// Audience'ni recipient userIds[] ga aylantiradi (deduped, active filtered)
export const resolveAudience = async (audience, currentUser) => {
  const isOwner = currentUser?.role === ROLES.OWNER;
  const isTeacher = currentUser?.role === ROLES.TEACHER;
  const isSystem = !currentUser; // Auto job

  if (isTeacher && !TEACHER_ALLOWED_AUDIENCE.has(audience.type)) {
    throw new ApiError(
      403,
      "O'qituvchi faqat o'z guruhlari yoki o'quvchilariga xabar yubora oladi",
    );
  }

  let recipientIds = [];

  switch (audience.type) {
    case "all_students": {
      if (!isOwner && !isSystem) {
        throw new ApiError(403, "Ruxsat yo'q");
      }
      const users = await User.find(
        withBranchScope({
          role: ROLES.STUDENT,
          isActive: true,
          isDeleted: { $ne: true },
        }),
        { _id: 1 },
      );
      recipientIds = users.map((u) => u._id);
      break;
    }
    case "all_teachers": {
      if (!isOwner && !isSystem) {
        throw new ApiError(403, "Ruxsat yo'q");
      }
      const users = await User.find(
        withBranchScope({
          role: ROLES.TEACHER,
          isActive: true,
          isDeleted: { $ne: true },
        }),
        { _id: 1 },
      );
      recipientIds = users.map((u) => u._id);
      break;
    }
    case "groups": {
      const groupIds = (audience.groupIds || []).map(
        (id) => new mongoose.Types.ObjectId(String(id)),
      );
      if (groupIds.length === 0) {
        throw new ApiError(400, "Kamida bitta guruh tanlanishi kerak");
      }
      if (isTeacher) {
        const myGroupIds = (await getTeacherGroupIds(currentUser._id)).map(
          String,
        );
        const allMine = groupIds.every((id) =>
          myGroupIds.includes(String(id)),
        );
        if (!allMine) {
          throw new ApiError(403, "Faqat o'z guruhlaringizga yubora olasiz");
        }
      }
      const memberships = await GroupMembership.find(
        { group: { $in: groupIds }, leftAt: null, isDeleted: { $ne: true } },
        { student: 1 },
      );
      const studentIds = [...new Set(memberships.map((m) => String(m.student)))];
      // Boshqa branchlar kabi - faqat aktiv, o'chirilmagan o'quvchilar.
      const activeStudents = await User.find(
        withBranchScope({
          _id: { $in: studentIds },
          isActive: true,
          isDeleted: { $ne: true },
        }),
        { _id: 1 },
      );
      recipientIds = activeStudents.map((u) => u._id);
      break;
    }
    case "users":
    case "individual":
    case "feedback_author": {
      const userIds = (audience.userIds || []).map(String);
      if (userIds.length === 0) {
        throw new ApiError(400, "Kamida bitta foydalanuvchi tanlanishi kerak");
      }
      if (isTeacher) {
        // Teacher faqat o'z guruhi o'quvchilari
        const myStudents = new Set(await getTeacherStudentIds(currentUser._id));
        const allMine = userIds.every((id) => myStudents.has(id));
        if (!allMine) {
          throw new ApiError(
            403,
            "Faqat o'z guruh o'quvchilaringizga yubora olasiz",
          );
        }
      }
      // ID'lar OCHIQ berilgani ko'lamdan ozod qilmaydi: aks holda direktor
      // boshqa filial o'quvchisining ID'sini qo'lda kiritib xabar
      // yuborardi (va preview orqali uning telefon raqamini olardi).
      const users = await User.find(
        withBranchScope({
          _id: { $in: userIds },
          isActive: true,
          isDeleted: { $ne: true },
        }),
        { _id: 1 },
      );
      recipientIds = users.map((u) => u._id);
      break;
    }
    case "auto_system": {
      // FILIAL KO'LAMI ATAYLAB QO'LLANMAYDI.
      //
      // Bu tur foydalanuvchi kiritmasidan emas, TIZIM kodidan keladi
      // (jobs/*.job.js, leadNotify.service.js, attendance.service.js) va
      // oluvchilar ro'yxatini server o'zi hisoblaydi. Ular orasida odatda
      // OWNER bo'ladi, owner'ning homeBranchId'si esa joriy filialdan
      // boshqa bo'lishi mumkin - ko'lam qo'yilsa u ro'yxatdan tushib
      // qolardi va lid eslatmasi/davomat ogohlantirishi unga umuman
      // yetmasdi. Ya'ni bu yerda ko'lam sizishni emas, XABARNI to'sardi.
      //
      // Auto job userIds beradi - boshqa branchlar kabi aktiv foydalanuvchilarga filtrlaymiz
      const ids = (audience.userIds || []).map(String);
      if (ids.length === 0) {
        recipientIds = [];
        break;
      }
      const users = await User.find(
        { _id: { $in: ids }, isActive: true, isDeleted: { $ne: true } },
        { _id: 1 },
      );
      recipientIds = users.map((u) => u._id);
      break;
    }
    default:
      throw new ApiError(400, "Noto'g'ri audience turi");
  }

  // Deduplicate
  const uniqueSet = new Set(recipientIds.map(String));
  return [...uniqueSet].map((id) => new mongoose.Types.ObjectId(id));
};

// Jonli preview: tanlangan auditoriya bo'yicha nechta oluvchi chiqishini
// hisoblaydi (xabar yaratmasdan). Wizard'da "N ta foydalanuvchiga boradi".
export const previewAudience = async (audience, currentUser) => {
  const recipientIds = await resolveAudience(audience, currentUser);

  // Telegram yetkazish holati bo'yicha taqsimot.
  //
  // NEGA shu yerda: yuboruvchi "N kishiga boradi" degan raqamga ishonib
  // yuborardi, lekin botni bloklaganlarga xabar UMUMAN yetmasdi va buni
  // faqat keyin, oluvchilar jadvalidan bilib olardi. Endi ogohlantirish
  // yuborishdan OLDIN chiqadi.
  const users = await User.find(
    { _id: { $in: recipientIds } },
    { firstName: 1, lastName: 1, phone: 1 },
  ).lean();
  const botMap = await fetchBotStatusMap(recipientIds);

  const buckets = { linked: [], blocked: [], not_linked: [] };
  for (const u of users) {
    const status = botMap.get(String(u._id))?.status || BOT_STATUS.NOT_LINKED;
    buckets[status].push(u);
  }

  const brief = (list) =>
    list.map((u) => ({
      _id: u._id,
      firstName: u.firstName,
      lastName: u.lastName,
      phone: u.phone,
    }));

  return {
    // `count` eski nom - klient shunga tayanadi, o'zgartirilmaydi.
    count: recipientIds.length,
    total: recipientIds.length,
    deliverable: buckets.linked.length,
    blocked: buckets.blocked.length,
    noBot: buckets.not_linked.length,
    // Raqamdan ko'ra ISM foydaliroq: xodim ularga qo'ng'iroq qila oladi.
    blockedStudents: brief(buckets.blocked),
    noBotStudents: brief(buckets.not_linked),
  };
};

// Cheklangan parallellik bilan ishlovchi pool (tashqi kutubxonasiz)
const runPool = async (items, concurrency, worker) => {
  let idx = 0;
  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (idx < items.length) {
        const cur = idx;
        idx += 1;
        await worker(items[cur]);
      }
    },
  );
  await Promise.all(runners);
};

// Bot push - yetkazilmagan oluvchilarga partiyalab, cheklangan parallellik bilan.
// Idempotent: faqat botDeliveredAt=null bo'lganlarni qayta uradi (job retry xavfsiz).
export const deliverNotification = async (notificationId) => {
  const notif = await Notification.findById(notificationId).lean();
  if (!notif) return;

  // Telegram kanali tanlanmagan bo'lsa - bot push qilinmaydi (faqat in-app).
  const channels = notif.channels?.length ? notif.channels : ["inapp", "telegram"];
  if (!channels.includes("telegram")) return;

  const recipients = await NotificationRecipient.find({
    notification: notificationId,
    botDeliveredAt: null,
  })
    .select("_id user")
    .lean();
  if (recipients.length === 0) return;

  // Barcha BotUser'larni BITTA so'rovda olamiz (N+1 yo'q)
  const userIds = recipients.map((r) => r.user);
  const botUsers = await BotUser.find(
    { user: { $in: userIds } },
    { user: 1, chatId: 1, telegramId: 1, isBlocked: 1 },
  ).lean();
  const buByUser = new Map(botUsers.map((b) => [String(b.user), b]));

  const { deliverToChat } = await import(
    "../../../bot/services/notificationDeliver.service.js"
  );

  // {ism}, {familiya}, {guruh}, {markaz}'ni har bir oluvchi uchun almashtiramiz.
  // Token bo'lmasa - barcha uchun bir xil matn (qo'shimcha so'rovsiz).
  const bodyByUser = await personalizeBulk(notif.body, userIds);

  let delivered = 0;
  const ops = [];
  await runPool(recipients, DELIVERY_CONCURRENCY, async (r) => {
    const bu = buByUser.get(String(r.user));
    if (!bu || bu.isBlocked || !bu.chatId) {
      ops.push({
        updateOne: {
          filter: { _id: r._id },
          update: { $set: { botFailedReason: "no-bot-link" } },
        },
      });
      return;
    }
    const res = await deliverToChat(
      { chatId: bu.chatId, telegramId: bu.telegramId },
      {
        title: notif.title,
        body: bodyByUser.get(String(r.user)) ?? notif.body,
        category: notif.category,
      },
    );
    if (res.ok) {
      delivered += 1;
      ops.push({
        updateOne: {
          filter: { _id: r._id },
          update: { $set: { botDeliveredAt: new Date(), botFailedReason: null } },
        },
      });
    } else if (!res.transient) {
      // transient (bot-not-running / 429) - terminal sifatida saqlamaymiz, keyin retry bo'ladi
      ops.push({
        updateOne: {
          filter: { _id: r._id },
          update: { $set: { botFailedReason: res.reason } },
        },
      });
    }
  });

  if (ops.length) await NotificationRecipient.bulkWrite(ops, { ordered: false });
  if (delivered > 0) {
    await Notification.updateOne(
      { _id: notificationId },
      { $inc: { deliveredViaBot: delivered } },
    );
  }
};

// Yetkazishni so'rov oqimidan ajratamiz: Agenda job'iga qo'yamiz.
// Agenda mavjud bo'lmasa (mas. test) - fonда (detached) bajaramiz.
const scheduleDelivery = async (notificationId) => {
  try {
    const agenda = (await import("../../../config/scheduler.js")).default;
    await agenda.now("notification.deliver", {
      notificationId: String(notificationId),
    });
  } catch (err) {
    logger.warn({ err }, "Yetkazish job'i navbatga qo'yilmadi, inline bajariladi");
    deliverNotification(notificationId).catch((e) =>
      logger.error({ err: e, notificationId }, "Inline yetkazish xato"),
    );
  }
};

// Asosiy send
export const send = async (body, currentUser) => {
  const recipientIds = await resolveAudience(body.audience, currentUser);

  // Template snapshot (ixtiyoriy)
  let templateRef = null;
  let finalBody = String(body.body || "").trim();
  let finalCategory = body.category || "other";

  if (body.templateId) {
    const tpl = await NotificationTemplate.findById(body.templateId);
    if (!tpl) throw new ApiError(400, "Shablon topilmadi");
    templateRef = tpl._id;
    if (!finalBody) finalBody = tpl.body;
    if (finalCategory === "other") finalCategory = "template_based";
  }

  if (!finalBody) {
    throw new ApiError(400, "Xabar matni bo'sh bo'lmasligi kerak");
  }

  // Idempotentlik: dedupeKey berilsa va shunday xabar mavjud bo'lsa - qayta yaratmaymiz
  // (avto job'lar/qayta-urinishlar dublikat bildirishnoma yaratmasligi uchun)
  if (body.dedupeKey) {
    const existing = await Notification.findOne({ dedupeKey: body.dedupeKey });
    if (existing) return existing;
  }

  const senderRole = currentUser
    ? currentUser.role === ROLES.OWNER
      ? "owner"
      : "teacher"
    : "system";

  // Kanallar - kamida bittasi (validator min(1)). Berilmasa eski xulq: ikkalasi.
  const channels =
    body.channels?.length ? [...new Set(body.channels)] : ["inapp", "telegram"];

  // Rejalashtirish: scheduleAt kelajakda bo'lsa - hoziroq yubormaymiz.
  const scheduleAt = body.scheduleAt ? new Date(body.scheduleAt) : null;
  const isScheduled = scheduleAt && scheduleAt.getTime() > Date.now() + 30 * 1000;

  // 1) Notification hujjatini yaratamiz (recipient'larsiz, status'ga qarab).
  const notification = await Notification.create({
    sender: currentUser?._id || null,
    senderRole,
    title: body.title || "",
    body: finalBody,
    category: finalCategory,
    template: templateRef,
    audience: body.audience,
    channels,
    status: isScheduled ? "scheduled" : "sent",
    scheduleAt: isScheduled ? scheduleAt : null,
    recipientsCount: recipientIds.length, // preview snapshot
    deliveredViaBot: 0,
    readCount: 0,
    isAuto: !!body.isAuto,
    dedupeKey: body.dedupeKey || null,
    relatedFeedback: body.relatedFeedback || null,
    sentAt: isScheduled ? scheduleAt : new Date(),
  });

  if (isScheduled) {
    // Recipient'lar va bot push job ishga tushganda materializatsiya qilinadi
    // (shu vaqtga qadar auditoriya o'zgargan bo'lsa - eng so'nggi holat olinadi).
    await scheduleSend(notification._id, scheduleAt);
    return notification;
  }

  // Darhol yuborish - recipient'larni yaratamiz va bot push'ni navbatga qo'yamiz.
  await materializeRecipients(notification._id, recipientIds, channels);
  return Notification.findById(notification._id);
};

// Notification uchun recipient hujjatlarini yaratadi va (telegram tanlangan bo'lsa)
// bot yetkazishni navbatga qo'yadi. Darhol va rejalashtirilgan yuborish - ikkovi ham
// shu funksiyani chaqiradi. Idempotent emas: bir marta chaqirilishi ko'zda tutilgan.
const materializeRecipients = async (notificationId, recipientIds, channels) => {
  const wantsInapp = channels.includes("inapp");
  if (recipientIds.length > 0) {
    const docs = recipientIds.map((uid) => ({
      notification: notificationId,
      user: uid,
      inapp: wantsInapp,
      readAt: null,
    }));
    await NotificationRecipient.insertMany(docs, { ordered: false });
  }

  if (recipientIds.length > 0 && channels.includes("telegram")) {
    await scheduleDelivery(notificationId);
  }
};

// Rejalashtirilgan yuborishni belgilangan vaqtga Agenda job'iga qo'yadi.
const scheduleSend = async (notificationId, when) => {
  try {
    const agenda = (await import("../../../config/scheduler.js")).default;
    await agenda.schedule(when, "notification.send", {
      notificationId: String(notificationId),
    });
  } catch (err) {
    logger.error(
      { err, notificationId, when },
      "Rejalashtirilgan yuborish job'i qo'yilmadi",
    );
    throw new ApiError(500, "Xabarni rejalashtirib bo'lmadi");
  }
};

// Rejalashtirilgan yuborish vaqti kelganda Agenda job tomonidan chaqiriladi:
// auditoriyani QAYTA hisoblaydi (eng so'nggi holat), recipient'larni yaratadi,
// holatni "sent" ga o'tkazadi va bot push'ni navbatga qo'yadi. Idempotent -
// status allaqachon "sent" bo'lsa hech nima qilmaydi.
export const dispatchScheduled = async (notificationId) => {
  const notif = await Notification.findById(notificationId);
  if (!notif || notif.status !== "scheduled") return;

  const sender = notif.sender
    ? { _id: notif.sender, role: notif.senderRole === "owner" ? ROLES.OWNER : ROLES.TEACHER }
    : null;
  const recipientIds = await resolveAudience(notif.audience, sender);

  const channels = notif.channels?.length ? notif.channels : ["inapp", "telegram"];
  await Notification.updateOne(
    { _id: notif._id, status: "scheduled" },
    { $set: { status: "sent", sentAt: new Date(), recipientsCount: recipientIds.length } },
  );
  await materializeRecipients(notif._id, recipientIds, channels);
};

// Rejalashtirilgan xabarni bekor qilish (hali yuborilmagan bo'lsa).
export const cancelScheduled = async (notificationId) => {
  const notif = await Notification.findById(notificationId);
  if (!notif) throw new ApiError(404, "Xabar topilmadi");
  if (notif.status !== "scheduled") {
    throw new ApiError(400, "Faqat rejalashtirilgan xabarni bekor qilish mumkin");
  }
  notif.status = "canceled";
  await notif.save();
  try {
    const agenda = (await import("../../../config/scheduler.js")).default;
    await agenda.cancel({
      name: "notification.send",
      "data.notificationId": String(notificationId),
    });
  } catch (err) {
    logger.warn({ err, notificationId }, "Reja job'ini bekor qilishda xato");
  }
  return notif;
};

export const list = async ({
  senderId,
  category,
  channel,
  status,
  search,
  fromDate,
  toDate,
  page = 1,
  limit = 20,
}) => {
  const filter = {};
  if (senderId) filter.sender = senderId;
  if (category) filter.category = category;
  if (channel) filter.channels = channel;
  if (status) filter.status = status;
  if (search) {
    const rx = new RegExp(search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    filter.$or = [{ title: rx }, { body: rx }];
  }
  if (fromDate || toDate) {
    filter.sentAt = {};
    if (fromDate) filter.sentAt.$gte = new Date(fromDate);
    if (toDate) filter.sentAt.$lte = new Date(toDate);
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    Notification.find(filter)
      .sort({ sentAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("sender", SENDER_PROJECTION)
      .populate("template", { name: 1, category: 1 }),
    Notification.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

export const getById = async (id) => {
  const notif = await Notification.findById(id)
    .populate("sender", SENDER_PROJECTION)
    .populate("template", { name: 1, body: 1, category: 1 })
    .populate("audience.groupIds", { name: 1 })
    .populate("audience.userIds", { firstName: 1, lastName: 1, role: 1 })
    .populate("relatedFeedback", { message: 1, status: 1 });
  if (!notif) throw new ApiError(404, "Xabar topilmadi");
  return notif;
};

export const getRecipientList = async (notifId, { page = 1, limit = 50 }) => {
  const where = { notificationId: String(notifId) };
  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    prisma.notificationRecipient.findMany({
      where,
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      skip,
      take: limit,
      include: {
        user: {
          select: {
            id: true, firstName: true, lastName: true, phone: true, role: true,
          },
        },
      },
    }),
    prisma.notificationRecipient.count({ where }),
  ]);
  return { items: items.map(withLegacyId), total, page, limit };
};

export const getMyInbox = async (
  userId,
  { page = 1, limit = 20, unreadOnly = false } = {},
) => {
  // Faqat in-app kanali tanlangan xabarlar inbox'da ko'rinadi
  // (eski yozuvlarda inapp maydoni yo'q - ularni ham ko'rsatamiz).
  const where = { userId: String(userId), inapp: true };
  if (unreadOnly) where.readAt = null;

  const skip = (page - 1) * limit;
  const [rows, total] = await Promise.all([
    prisma.notificationRecipient.findMany({
      where,
      // Ikkilamchi tartib (id): createdAt teng bo'lgan yozuvlarda
      // sahifalash beqaror bo'lib qolmasligi uchun.
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip,
      take: limit,
      include: {
        notification: {
          include: {
            sender: {
              select: { id: true, firstName: true, lastName: true, role: true },
            },
          },
        },
      },
    }),
    prisma.notificationRecipient.count({ where }),
  ]);

  // Prisma yozuvlari o'zgarmas (frozen) emas, lekin quyida `notification.body`
  // JOYIDA almashtiriladi — shuning uchun avval nusxa olamiz.
  const items = rows.map((r) => withLegacyId(r));

  // O'zgaruvchilarni ({ism}, {familiya}, {guruh}, {markaz}) shu o'quvchi uchun
  // almashtiramiz. Ism/guruh BIR MARTA yechiladi (barcha xabarlar bitta userники).
  const withBody = items.filter((it) => it.notification?.body);
  if (withBody.length) {
    const bodies = withBody.map((it) => it.notification.body);
    const personalized = await personalizeManyForUser(bodies, userId);
    withBody.forEach((it, i) => {
      it.notification.body = personalized[i];
    });
  }

  return { items, total, page, limit };
};

export const getUnreadCount = async (userId) =>
  prisma.notificationRecipient.count({
    where: { userId: String(userId), readAt: null, inapp: true },
  });

export const markRead = async (recipientId, userId) => {
  // Shartli atomik yangilanish: `readAt: null` WHERE ichida, ya'ni ikki
  // marta bosilsa ikkinchisi `count = 0` oladi va readCount IKKI MARTA
  // oshmaydi.
  const res = await prisma.notificationRecipient.updateMany({
    where: { id: String(recipientId), userId: String(userId), readAt: null },
    data: { readAt: new Date() },
  });
  if (!res.count) return null;

  const updated = await prisma.notificationRecipient.findUnique({
    where: { id: String(recipientId) },
  });
  if (updated) {
    await prisma.notification.update({
      where: { id: updated.notificationId },
      data: { readCount: { increment: 1 } },
    });
  }
  return withLegacyId(updated);
};

export const markAllRead = async (userId) => {
  // Faqat in-app kanalidagi xabarlarni "o'qildi" qilamiz - getMyInbox va
  // getUnreadCount bilan bir xil qamrov (telegram-only recipientlar inbox'da
  // ko'rinmaydi, shuning uchun ularning readCount'iga ham tegmaymiz).
  const docs = await prisma.notificationRecipient.findMany({
    where: { userId: String(userId), readAt: null, inapp: true },
    select: { id: true, notificationId: true },
  });
  if (!docs.length) return { updated: 0 };

  // Har bir notification bo'yicha recipient id'larini guruhlaymiz, so'ng
  // ATOMIK updateMany qilib FAQAT shu chaqiruvda haqiqatan o'zgargan sonni
  // (modifiedCount) readCount'ga qo'shamiz - bir vaqtda kelgan markRead bilan
  // ikki marta sanash poygasini oldini oladi.
  const byNotif = new Map();
  for (const d of docs) {
    const k = String(d.notificationId);
    if (!byNotif.has(k)) byNotif.set(k, []);
    byNotif.get(k).push(d.id);
  }

  const now = new Date();
  const results = await Promise.all(
    [...byNotif.entries()].map(async ([nid, ids]) => {
      const res = await prisma.notificationRecipient.updateMany({
        where: { id: { in: ids }, readAt: null },
        data: { readAt: now },
      });
      const n = res.count || 0;
      if (n > 0) {
        await prisma.notification.update({
          where: { id: nid },
          data: { readCount: { increment: n } },
        });
      }
      return n;
    }),
  );

  return { updated: results.reduce((a, b) => a + b, 0) };
};

export const getStats = async ({ fromDate, toDate } = {}) => {
  // Faqat haqiqatan yuborilgan xabarlar statistikaga kiradi.
  // scheduled (hali yuborilmagan, recipientsCount faqat preview) va canceled
  // (umuman yetkazilmagan) yozuvlar totalRecipients va readRate'ni buzadi.
  const range = { status: "sent" };
  if (fromDate || toDate) {
    range.sentAt = {};
    if (fromDate) range.sentAt.$gte = new Date(fromDate);
    if (toDate) range.sentAt.$lte = new Date(toDate);
  }

  const [total, byCategory, totals] = await Promise.all([
    Notification.countDocuments(range),
    Notification.aggregate([
      { $match: range },
      {
        $group: {
          _id: "$category",
          count: { $sum: 1 },
          recipients: { $sum: "$recipientsCount" },
          delivered: { $sum: "$deliveredViaBot" },
          reads: { $sum: "$readCount" },
        },
      },
      { $sort: { count: -1 } },
    ]),
    Notification.aggregate([
      { $match: range },
      {
        $group: {
          _id: null,
          totalRecipients: { $sum: "$recipientsCount" },
          totalDelivered: { $sum: "$deliveredViaBot" },
          totalReads: { $sum: "$readCount" },
        },
      },
    ]),
  ]);

  const t = totals[0] || {
    totalRecipients: 0,
    totalDelivered: 0,
    totalReads: 0,
  };
  const readRate =
    t.totalRecipients > 0
      ? Math.round((t.totalReads / t.totalRecipients) * 100)
      : 0;

  return {
    total,
    totalRecipients: t.totalRecipients,
    totalDelivered: t.totalDelivered,
    totalReads: t.totalReads,
    readRate,
    byCategory,
  };
};

// Feedback statusi o'zgarganda avto-notification (faqat anonim emas bo'lsa)
export const notifyFeedbackStatusChange = async (
  feedback,
  { statusLabel, adminReply, rejectionReason },
  currentUser,
) => {
  if (!feedback?.author || feedback.isAnonymous) return null;

  const lines = [`Sizning feedback'ingiz holati: ${statusLabel}`];
  if (adminReply) lines.push(`Javob: ${adminReply}`);
  if (rejectionReason) lines.push(`Sabab: ${rejectionReason}`);
  const body = lines.join("\n");

  return send(
    {
      title: "Feedback holati o'zgardi",
      body,
      category: "feedback_status",
      audience: {
        type: "feedback_author",
        userIds: [feedback.author],
      },
      relatedFeedback: feedback._id,
      isAuto: true,
    },
    currentUser,
  );
};
