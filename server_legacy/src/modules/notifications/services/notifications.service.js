import prisma from "../../../config/prisma.js";
import { withLegacyId, withLegacyIds } from "../../../utils/serialize.js";
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
// `$and` → `AND`: Prisma'da Mongo'dagi `$and` o'rniga `AND` ishlatiladi.
// Prisma `$and` ni NOMA'LUM KALIT deb jimgina e'tiborsiz qoldiradi —
// ya'ni filtr umuman qo'llanmaydi va filial sizishi bo'ladi.
//
// FON VAZIFALARI (pg-boss job) ta'sirlanmaydi: ular request konteksti
// tashqarisida ishlaydi, u yerda helper `null` qaytaradi va filtr
// o'zgarishsiz qoladi.
const withBranchScope = (filter) => {
  const condition = userBranchCondition();
  return condition ? { AND: [filter, condition] } : filter;
};

// Bir vaqtning o'zida nechta bot xabari yuborilsin (Telegram ~30/sek global limit)
const DELIVERY_CONCURRENCY = 20;

const SENDER_SELECT = { id: true, firstName: true, lastName: true, role: true };

// Teacher uchun ruxsat etilgan audience type'lar
const TEACHER_ALLOWED_AUDIENCE = new Set(["groups", "users", "individual"]);

// Bitta o'qituvchining barcha guruhlari ID'larini qaytaradi
// `teachers` — M2M relation (GroupTeachers), shuning uchun `some` ishlatiladi.
const getTeacherGroupIds = async (teacherId) => {
  const groups = await prisma.group.findMany({
    where: {
      teachers: { some: { id: String(teacherId) } },
      isActive: true,
      isDeleted: false,
    },
    select: { id: true },
  });
  return groups.map((g) => g.id);
};

// Bitta o'qituvchining barcha active o'quvchilari ID'larini qaytaradi
const getTeacherStudentIds = async (teacherId) => {
  const groupIds = await getTeacherGroupIds(teacherId);
  if (!groupIds.length) return [];
  // `group` → `groupId`, `student` → `studentId`: Prisma skalyar FK.
  const memberships = await prisma.groupMembership.findMany({
    where: { groupId: { in: groupIds }, leftAt: null, isDeleted: false },
    select: { studentId: true },
  });
  const set = new Set(memberships.map((m) => String(m.studentId)));
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
      const users = await prisma.user.findMany({
        where: withBranchScope({
          role: ROLES.STUDENT,
          isActive: true,
          isDeleted: false,
        }),
        select: { id: true },
      });
      recipientIds = users.map((u) => u.id);
      break;
    }
    case "all_teachers": {
      if (!isOwner && !isSystem) {
        throw new ApiError(403, "Ruxsat yo'q");
      }
      const users = await prisma.user.findMany({
        where: withBranchScope({
          role: ROLES.TEACHER,
          isActive: true,
          isDeleted: false,
        }),
        select: { id: true },
      });
      recipientIds = users.map((u) => u.id);
      break;
    }
    case "groups": {
      const groupIds = (audience.groupIds || []).map(String);
      if (groupIds.length === 0) {
        throw new ApiError(400, "Kamida bitta guruh tanlanishi kerak");
      }
      if (isTeacher) {
        const myGroupIds = (
          await getTeacherGroupIds(currentUser._id || currentUser.id)
        ).map(String);
        const allMine = groupIds.every((id) => myGroupIds.includes(id));
        if (!allMine) {
          throw new ApiError(403, "Faqat o'z guruhlaringizga yubora olasiz");
        }
      }
      const memberships = await prisma.groupMembership.findMany({
        where: { groupId: { in: groupIds }, leftAt: null, isDeleted: false },
        select: { studentId: true },
      });
      const studentIds = [
        ...new Set(memberships.map((m) => String(m.studentId))),
      ];
      // Boshqa branchlar kabi - faqat aktiv, o'chirilmagan o'quvchilar.
      const activeStudents = await prisma.user.findMany({
        where: withBranchScope({
          id: { in: studentIds },
          isActive: true,
          isDeleted: false,
        }),
        select: { id: true },
      });
      recipientIds = activeStudents.map((u) => u.id);
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
        const myStudents = new Set(
          await getTeacherStudentIds(currentUser._id || currentUser.id),
        );
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
      const users = await prisma.user.findMany({
        where: withBranchScope({
          id: { in: userIds },
          isActive: true,
          isDeleted: false,
        }),
        select: { id: true },
      });
      recipientIds = users.map((u) => u.id);
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
      const users = await prisma.user.findMany({
        where: { id: { in: ids }, isActive: true, isDeleted: false },
        select: { id: true },
      });
      recipientIds = users.map((u) => u.id);
      break;
    }
    default:
      throw new ApiError(400, "Noto'g'ri audience turi");
  }

  // Deduplicate — Prisma oddiy string qaytaradi, ObjectId o'rami kerak emas.
  return [...new Set(recipientIds.map(String))];
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
  const users = await prisma.user.findMany({
    where: { id: { in: recipientIds } },
    select: { id: true, firstName: true, lastName: true, phone: true },
  });
  const botMap = await fetchBotStatusMap(recipientIds);

  const buckets = { linked: [], blocked: [], not_linked: [] };
  for (const u of users) {
    const status = botMap.get(String(u.id))?.status || BOT_STATUS.NOT_LINKED;
    buckets[status].push(u);
  }

  const brief = (list) =>
    list.map((u) => ({
      _id: u.id,
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
  const notif = await prisma.notification.findUnique({
    where: { id: String(notificationId) },
  });
  if (!notif) return;

  // Telegram kanali tanlanmagan bo'lsa - bot push qilinmaydi (faqat in-app).
  const channels = notif.channels?.length ? notif.channels : ["inapp", "telegram"];
  if (!channels.includes("telegram")) return;

  const recipients = await prisma.notificationRecipient.findMany({
    where: {
      notificationId: String(notificationId),
      botDeliveredAt: null,
    },
    select: { id: true, userId: true },
  });
  if (recipients.length === 0) return;

  // Barcha BotUser'larni BITTA so'rovda olamiz (N+1 yo'q)
  // `user` → `userId`: Prisma'da `user` RELATION, `userId` skalyar FK.
  const userIds = recipients.map((r) => r.userId);
  const botUsers = await prisma.botUser.findMany({
    where: { userId: { in: userIds } },
    select: { userId: true, chatId: true, telegramId: true, isBlocked: true },
  });
  const buByUser = new Map(botUsers.map((b) => [String(b.userId), b]));

  const { deliverToChat } = await import(
    "../../../bot/services/notificationDeliver.service.js"
  );

  // {ism}, {familiya}, {guruh}, {markaz}'ni har bir oluvchi uchun almashtiramiz.
  // Token bo'lmasa - barcha uchun bir xil matn (qo'shimcha so'rovsiz).
  const bodyByUser = await personalizeBulk(notif.body, userIds);

  let delivered = 0;
  const updates = [];
  await runPool(recipients, DELIVERY_CONCURRENCY, async (r) => {
    const bu = buByUser.get(String(r.userId));
    if (!bu || bu.isBlocked || !bu.chatId) {
      updates.push(
        prisma.notificationRecipient.update({
          where: { id: r.id },
          data: { botFailedReason: "no-bot-link" },
        }),
      );
      return;
    }
    // BigInt → Number: Telegram API raqam kutadi, Postgres BigInt qaytaradi.
    const res = await deliverToChat(
      { chatId: Number(bu.chatId), telegramId: Number(bu.telegramId) },
      {
        title: notif.title,
        body: bodyByUser.get(String(r.userId)) ?? notif.body,
        category: notif.category,
      },
    );
    if (res.ok) {
      delivered += 1;
      updates.push(
        prisma.notificationRecipient.update({
          where: { id: r.id },
          data: { botDeliveredAt: new Date(), botFailedReason: "" },
        }),
      );
    } else if (!res.transient) {
      // transient (bot-not-running / 429) - terminal sifatida saqlamaymiz, keyin retry bo'ladi
      updates.push(
        prisma.notificationRecipient.update({
          where: { id: r.id },
          data: { botFailedReason: res.reason },
        }),
      );
    }
  });

  // Mongoose bulkWrite o'rniga — individual update'lar.
  // Ordered:false ekvivalenti: allSettled bilan hamma uriniladi.
  if (updates.length) await Promise.allSettled(updates);
  if (delivered > 0) {
    await prisma.notification.update({
      where: { id: String(notificationId) },
      data: { deliveredViaBot: { increment: delivered } },
    });
  }
};

// Yetkazishni so'rov oqimidan ajratamiz: pg-boss job'iga qo'yamiz.
// pg-boss mavjud bo'lmasa (mas. test) - fonda (detached) bajaramiz.
const scheduleDelivery = async (notificationId) => {
  try {
    const scheduler = (await import("../../../config/scheduler.js")).default;
    await scheduler.now("notification.deliver", {
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
    const tpl = await prisma.notificationTemplate.findUnique({
      where: { id: String(body.templateId) },
    });
    if (!tpl) throw new ApiError(400, "Shablon topilmadi");
    templateRef = tpl.id;
    if (!finalBody) finalBody = tpl.body;
    if (finalCategory === "other") finalCategory = "template_based";
  }

  if (!finalBody) {
    throw new ApiError(400, "Xabar matni bo'sh bo'lmasligi kerak");
  }

  // Idempotentlik: dedupeKey berilsa va shunday xabar mavjud bo'lsa - qayta yaratmaymiz
  // (avto job'lar/qayta-urinishlar dublikat bildirishnoma yaratmasligi uchun)
  if (body.dedupeKey) {
    const existing = await prisma.notification.findFirst({
      where: { dedupeKey: body.dedupeKey },
    });
    if (existing) return withLegacyId(existing);
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

  // Audience ma'lumotlari — Prisma'da `audienceType` + `audienceGroups`/`audienceUsers`
  // M2M relation orqali saqlanadi (Mongo'dagi ichki obyekt o'rniga).
  const audienceType = body.audience.type;
  const audienceGroupIds = (body.audience.groupIds || []).map(String);
  const audienceUserIds = (body.audience.userIds || []).map(String);

  const senderId = currentUser?._id || currentUser?.id || null;

  // 1) Notification hujjatini yaratamiz (recipient'larsiz, status'ga qarab).
  // `sender` → `senderId`, `template` → `templateId`: Prisma FK maydon nomlari.
  const notification = await prisma.notification.create({
    data: {
      senderId: senderId ? String(senderId) : null,
      senderRole,
      title: body.title || "",
      body: finalBody,
      category: finalCategory,
      templateId: templateRef,
      audienceType,
      // M2M connect: guruh/user ID'larini bog'laymiz.
      ...(audienceGroupIds.length > 0
        ? { audienceGroups: { connect: audienceGroupIds.map((id) => ({ id })) } }
        : {}),
      ...(audienceUserIds.length > 0
        ? { audienceUsers: { connect: audienceUserIds.map((id) => ({ id })) } }
        : {}),
      channels,
      status: isScheduled ? "scheduled" : "sent",
      scheduleAt: isScheduled ? scheduleAt : null,
      recipientsCount: recipientIds.length,
      deliveredViaBot: 0,
      readCount: 0,
      isAuto: !!body.isAuto,
      dedupeKey: body.dedupeKey || null,
      relatedFeedbackId: body.relatedFeedback ? String(body.relatedFeedback) : null,
      sentAt: isScheduled ? scheduleAt : new Date(),
    },
  });

  if (isScheduled) {
    // Recipient'lar va bot push job ishga tushganda materializatsiya qilinadi
    // (shu vaqtga qadar auditoriya o'zgargan bo'lsa - eng so'nggi holat olinadi).
    await scheduleSend(notification.id, scheduleAt);
    return withLegacyId(notification);
  }

  // Darhol yuborish - recipient'larni yaratamiz va bot push'ni navbatga qo'yamiz.
  await materializeRecipients(notification.id, recipientIds, channels);
  const created = await prisma.notification.findUnique({
    where: { id: notification.id },
  });
  return withLegacyId(created);
};

// Notification uchun recipient hujjatlarini yaratadi va (telegram tanlangan bo'lsa)
// bot yetkazishni navbatga qo'yadi. Darhol va rejalashtirilgan yuborish - ikkovi ham
// shu funksiyani chaqiradi. Idempotent emas: bir marta chaqirilishi ko'zda tutilgan.
const materializeRecipients = async (notificationId, recipientIds, channels) => {
  const wantsInapp = channels.includes("inapp");
  if (recipientIds.length > 0) {
    // `notification` → `notificationId`, `user` → `userId`: Prisma FK.
    await prisma.notificationRecipient.createMany({
      data: recipientIds.map((uid) => ({
        notificationId: String(notificationId),
        userId: String(uid),
        inapp: wantsInapp,
        readAt: null,
      })),
      skipDuplicates: true,
    });
  }

  if (recipientIds.length > 0 && channels.includes("telegram")) {
    await scheduleDelivery(notificationId);
  }
};

// Rejalashtirilgan yuborishni belgilangan vaqtga pg-boss job'iga qo'yadi.
const scheduleSend = async (notificationId, when) => {
  try {
    const scheduler = (await import("../../../config/scheduler.js")).default;
    await scheduler.schedule(when, "notification.send", {
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

// Rejalashtirilgan yuborish vaqti kelganda pg-boss job tomonidan chaqiriladi:
// auditoriyani QAYTA hisoblaydi (eng so'nggi holat), recipient'larni yaratadi,
// holatni "sent" ga o'tkazadi va bot push'ni navbatga qo'yadi. Idempotent -
// status allaqachon "sent" bo'lsa hech nima qilmaydi.
export const dispatchScheduled = async (notificationId) => {
  const notif = await prisma.notification.findUnique({
    where: { id: String(notificationId) },
    include: { audienceGroups: { select: { id: true } }, audienceUsers: { select: { id: true } } },
  });
  if (!notif || notif.status !== "scheduled") return;

  // Audience'ni tiklash — Prisma'da alohida maydon/relation'larda saqlangan.
  const audience = {
    type: notif.audienceType,
    groupIds: (notif.audienceGroups || []).map((g) => g.id),
    userIds: (notif.audienceUsers || []).map((u) => u.id),
  };

  const sender = notif.senderId
    ? { _id: notif.senderId, role: notif.senderRole === "owner" ? ROLES.OWNER : ROLES.TEACHER }
    : null;
  const recipientIds = await resolveAudience(audience, sender);

  const channels = notif.channels?.length ? notif.channels : ["inapp", "telegram"];
  // Shartli atomik yangilanish: faqat "scheduled" holatdagini "sent" ga o'tkazamiz.
  await prisma.notification.updateMany({
    where: { id: notif.id, status: "scheduled" },
    data: { status: "sent", sentAt: new Date(), recipientsCount: recipientIds.length },
  });
  await materializeRecipients(notif.id, recipientIds, channels);
};

// Rejalashtirilgan xabarni bekor qilish (hali yuborilmagan bo'lsa).
export const cancelScheduled = async (notificationId) => {
  const notif = await prisma.notification.findUnique({
    where: { id: String(notificationId) },
  });
  if (!notif) throw new ApiError(404, "Xabar topilmadi");
  if (notif.status !== "scheduled") {
    throw new ApiError(400, "Faqat rejalashtirilgan xabarni bekor qilish mumkin");
  }
  // Mongoose `doc.save()` o'rniga — Prisma `update`.
  const updated = await prisma.notification.update({
    where: { id: notif.id },
    data: { status: "canceled" },
  });
  try {
    const scheduler = (await import("../../../config/scheduler.js")).default;
    await scheduler.cancel({
      name: "notification.send",
    });
  } catch (err) {
    logger.warn({ err, notificationId }, "Reja job'ini bekor qilishda xato");
  }
  return withLegacyId(updated);
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
  const where = {};
  if (senderId) where.senderId = String(senderId);
  if (category) where.category = category;
  // `channels` Prisma'da enum massiv — `has` operatori bilan filtrlanadi.
  if (channel) where.channels = { has: channel };
  if (status) where.status = status;
  if (search) {
    const escaped = search.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Mongo `$regex` → Prisma `contains` + `mode: "insensitive"`.
    where.OR = [
      { title: { contains: escaped, mode: "insensitive" } },
      { body: { contains: escaped, mode: "insensitive" } },
    ];
  }
  if (fromDate || toDate) {
    where.sentAt = {};
    if (fromDate) where.sentAt.gte = new Date(fromDate);
    if (toDate) where.sentAt.lte = new Date(toDate);
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    prisma.notification.findMany({
      where,
      orderBy: { sentAt: "desc" },
      skip,
      take: limit,
      include: {
        sender: { select: SENDER_SELECT },
        template: { select: { id: true, name: true, category: true } },
      },
    }),
    prisma.notification.count({ where }),
  ]);

  // Frontend `item.sender.firstName` va `item.template.name` o'qiydi.
  // Eski Mongo populate'da `_id` avtomatik qaytardi — Prisma'da `id` bor,
  // `withLegacyId` chuqur o'tib `_id` qo'shadi.
  return { items: withLegacyIds(items), total, page, limit };
};

export const getById = async (id) => {
  const notif = await prisma.notification.findUnique({
    where: { id: String(id) },
    include: {
      sender: { select: SENDER_SELECT },
      template: { select: { id: true, name: true, body: true, category: true } },
      // Mongo `populate("audience.groupIds")` → Prisma M2M relation.
      audienceGroups: { select: { id: true, name: true } },
      audienceUsers: { select: { id: true, firstName: true, lastName: true, role: true } },
      relatedFeedback: { select: { id: true, message: true, status: true } },
    },
  });
  if (!notif) throw new ApiError(404, "Xabar topilmadi");

  // Frontend `notif.audience.type`, `notif.audience.groupIds[].name`,
  // `notif.audience.userIds[].firstName` shaklida o'qiydi.
  // Prisma'da bu alohida maydon/relation — eski shaklni tiklaymiz.
  const result = withLegacyId(notif);
  result.audience = {
    type: notif.audienceType,
    groupIds: withLegacyIds(notif.audienceGroups || []),
    userIds: withLegacyIds(notif.audienceUsers || []),
  };
  return result;
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
  const where = { status: "sent" };
  if (fromDate || toDate) {
    where.sentAt = {};
    if (fromDate) where.sentAt.gte = new Date(fromDate);
    if (toDate) where.sentAt.lte = new Date(toDate);
  }

  // Mongo aggregate → Prisma groupBy + aggregate.
  // `$group {_id: "$category"}` → `groupBy({by: ["category"]})`.
  // `$group {_id: null}` → `aggregate({_sum, _count})`.
  const [total, byCategory, totals] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.groupBy({
      by: ["category"],
      where,
      _count: { _all: true },
      _sum: {
        recipientsCount: true,
        deliveredViaBot: true,
        readCount: true,
      },
      orderBy: { _count: { _all: "desc" } },
    }),
    prisma.notification.aggregate({
      where,
      _sum: {
        recipientsCount: true,
        deliveredViaBot: true,
        readCount: true,
      },
    }),
  ]);

  // Mongo aggregate shakli: { _id: "...", count, recipients, delivered, reads }
  // Prisma groupBy shakli: { category, _count: { _all }, _sum: { ... } }
  // Eski shaklga o'giramiz — klient shunga tayanadi.
  const byCategoryFormatted = byCategory.map((r) => ({
    _id: r.category,
    count: r._count._all,
    recipients: r._sum.recipientsCount || 0,
    delivered: r._sum.deliveredViaBot || 0,
    reads: r._sum.readCount || 0,
  }));

  const t = {
    totalRecipients: totals._sum.recipientsCount || 0,
    totalDelivered: totals._sum.deliveredViaBot || 0,
    totalReads: totals._sum.readCount || 0,
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
    byCategory: byCategoryFormatted,
  };
};

// Feedback statusi o'zgarganda avto-notification (faqat anonim emas bo'lsa)
export const notifyFeedbackStatusChange = async (
  feedback,
  { statusLabel, adminReply, rejectionReason },
  currentUser,
) => {
  // `feedback.author` → `feedback.authorId`: Prisma FK.
  const authorId = feedback?.authorId || feedback?.author;
  if (!authorId || feedback.isAnonymous) return null;

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
        userIds: [String(authorId)],
      },
      relatedFeedback: feedback.id || feedback._id,
      isAuto: true,
    },
    currentUser,
  );
};
