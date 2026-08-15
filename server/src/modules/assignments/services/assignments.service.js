import mongoose from "mongoose";
import Assignment from "../../../models/assignment.model.js";
import AssignmentRecipient from "../../../models/assignmentRecipient.model.js";
import StoredFile from "../../../models/storedFile.model.js";
import Group from "../../../models/group.model.js";
import GroupMembership from "../../../models/groupMembership.model.js";
import User from "../../../models/user.model.js";
import BotUser from "../../../models/botUser.model.js";
import ApiError from "../../../utils/ApiError.js";
import logger from "../../../config/logger.js";
import {
  isTeacherActor,
  isStudentActor,
} from "../../../helpers/actor.helper.js";
import { branchFilter } from "../../../helpers/branchContext.helper.js";
import { botStatusOf, BOT_STATUS } from "../../../helpers/botStatus.helper.js";
import { hasPermission } from "../../../helpers/permission.helper.js";
import { PERMISSIONS } from "../../../constants/permissions.js";
import * as storageService from "../../storage/services/storage.service.js";

// Bir vaqtda nechta bot xabari ketsin (Telegram ~30/sek global chegara).
const DELIVERY_CONCURRENCY = 20;

const USER_PROJECTION = { firstName: 1, lastName: 1, phone: 1 };

/**
 * Tanlangan guruhlarni tekshiradi va qaytaradi.
 *
 * Uch qatlamli tekshiruv: filial ko'lami (branchFilter), mavjudlik, va
 * o'qituvchi uchun egalik. Uchalasi ham SHU YERDA - preview ham, yuborish
 * ham bir xil qoidaga bo'ysunishi kerak, aks holda preview "30 kishi"
 * deb ko'rsatib, yuborish 403 qaytarardi.
 */
const resolveGroups = async (groupIds, currentUser) => {
  const ids = [...new Set((groupIds || []).map(String))];
  if (!ids.length) throw new ApiError(400, "Kamida bitta guruh tanlanishi kerak");

  const groups = await Group.find({
    _id: { $in: ids },
    isDeleted: { $ne: true },
    ...branchFilter(),
  })
    .select({ name: 1, teachers: 1, branchId: 1 })
    .lean();

  if (groups.length !== ids.length) {
    throw new ApiError(404, "Ba'zi guruhlar topilmadi");
  }

  const isTeacher = isTeacherActor(currentUser);
  if (isTeacher) {
    const mine = groups.every((g) =>
      (g.teachers || []).some((t) => String(t) === String(currentUser._id)),
    );
    if (!mine) {
      throw new ApiError(403, "Faqat o'z guruhlaringizga vazifa yubora olasiz");
    }
  }

  // Filial aralashib ketmasin: hisobot ham, ro'yxat filtri ham bitta
  // filial taxminiga tayanadi (Assignment.branchId - yagona qiymat).
  const branchIds = [...new Set(groups.map((g) => String(g.branchId || "")))];
  if (branchIds.length > 1) {
    throw new ApiError(
      400,
      "Tanlangan guruhlar turli filiallarga tegishli. Har bir filial uchun alohida yuboring",
    );
  }

  return groups;
};

/**
 * Guruh(lar)dagi faol o'quvchilar + ularning bot holati.
 *
 * Qaytadi: [{ studentId, groupId, botUser|null }]
 * Bir o'quvchi ikki guruhda bo'lsa BIR MARTA qaytadi (birinchi guruh
 * bilan) - aks holda unga bir xil vazifa ikki marta borardi.
 */
const resolveRecipients = async (groups) => {
  const groupIds = groups.map((g) => g._id);

  const memberships = await GroupMembership.find({
    group: { $in: groupIds },
    leftAt: null,
    isDeleted: { $ne: true },
  })
    .select({ student: 1, group: 1 })
    .lean();

  if (!memberships.length) return [];

  // Faqat faol, o'chirilmagan o'quvchilar (boshqa modullar bilan bir xil qoida).
  const studentIds = [...new Set(memberships.map((m) => String(m.student)))];
  const students = await User.find({
    _id: { $in: studentIds },
    isActive: true,
    isDeleted: { $ne: true },
  })
    .select(USER_PROJECTION)
    .lean();
  const studentById = new Map(students.map((s) => [String(s._id), s]));

  // Bot bog'lanishlari BITTA so'rovda (N+1 yo'q).
  const botUsers = await BotUser.find({ user: { $in: students.map((s) => s._id) } })
    .select({ user: 1, chatId: 1, telegramId: 1, isBlocked: 1 })
    .lean();
  const botByUser = new Map(botUsers.map((b) => [String(b.user), b]));

  const seen = new Set();
  const out = [];
  for (const m of memberships) {
    const sid = String(m.student);
    if (seen.has(sid)) continue;
    const student = studentById.get(sid);
    if (!student) continue; // nofaol / arxivlangan
    seen.add(sid);
    out.push({
      student,
      groupId: m.group,
      botUser: botByUser.get(sid) || null,
    });
  }
  return out;
};

// Bot holatidan boshlang'ich yetkazish statusi. Xarita bitta joyda -
// bot holati mantiqi butun tizimda YAGONA manbadan (botStatus.helper)
// oziqlanadi, aks holda bildirishnoma va vazifa modullari vaqt o'tib
// bir-biridan uzoqlashib ketardi.
const STATUS_BY_BOT = {
  [BOT_STATUS.LINKED]: "pending", // yuborishga tayyor
  [BOT_STATUS.BLOCKED]: "blocked", // kirgan, keyin bloklagan
  [BOT_STATUS.NOT_LINKED]: "no_bot", // botga umuman kirmagan
};

const initialStatus = (botUser) => STATUS_BY_BOT[botStatusOf(botUser)];

/**
 * Yuborishdan OLDINGI ko'rib chiqish.
 *
 * Aynan shu javob "N ta o'quvchi botni bloklagan" ogohlantirishini
 * beradi: o'qituvchi yuborishdan oldin kimga yetib bormasligini bilsin.
 */
export const preview = async ({ groupIds }, currentUser) => {
  const groups = await resolveGroups(groupIds, currentUser);
  const recipients = await resolveRecipients(groups);

  const buckets = { pending: [], blocked: [], no_bot: [] };
  for (const r of recipients) buckets[initialStatus(r.botUser)].push(r);

  const brief = (list) =>
    list.map((r) => ({
      _id: r.student._id,
      firstName: r.student.firstName,
      lastName: r.student.lastName,
      phone: r.student.phone,
    }));

  return {
    total: recipients.length,
    deliverable: buckets.pending.length,
    blocked: buckets.blocked.length,
    noBot: buckets.no_bot.length,
    // Ro'yxatlar ham qaytadi: "5 ta" degan raqamdan ko'ra "kim" degani
    // foydaliroq - o'qituvchi ularga darsda aytib qo'yishi mumkin.
    blockedStudents: brief(buckets.blocked),
    noBotStudents: brief(buckets.no_bot),
    groups: groups.map((g) => ({ _id: g._id, name: g.name })),
  };
};

// Cheklangan parallellik bilan ishlovchi pool (tashqi kutubxonasiz).
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

/**
 * Vazifani yaratadi: fayl saqlanadi, oluvchilar materializatsiya qilinadi,
 * bot yetkazish navbatga qo'yiladi.
 *
 * Fayl KVOTAGA sig'masa - butun so'rov rad etiladi (storage.service
 * assertQuota 507 tashlaydi). Vazifani "faylsiz" holda jimgina yuborish
 * ATAYLAB qilinmaydi: o'qituvchi fayl ketganiga ishonib qolardi.
 */
export const create = async ({ body, file, currentUser }) => {
  const groups = await resolveGroups(body.groupIds, currentUser);
  const recipients = await resolveRecipients(groups);

  if (!recipients.length) {
    throw new ApiError(400, "Tanlangan guruhlarda faol o'quvchi yo'q");
  }

  let storedFile = null;
  if (file?.buffer?.length) {
    storedFile = await storageService.saveBuffer({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      userId: currentUser._id,
      purpose: "assignment",
    });
  }

  const statuses = recipients.map((r) => initialStatus(r.botUser));
  const countOf = (s) => statuses.filter((x) => x === s).length;

  let assignment;
  try {
    assignment = await Assignment.create({
      sender: currentUser._id,
      title: body.title,
      body: body.body || "",
      groups: groups.map((g) => g._id),
      branchId: groups[0]?.branchId || null,
      file: storedFile?._id || null,
      dueDate: body.dueDate || null,
      recipientsCount: recipients.length,
      deliveredCount: 0,
      blockedCount: countOf("blocked"),
      noBotCount: countOf("no_bot"),
      failedCount: 0,
      sentAt: new Date(),
    });
  } catch (err) {
    // Vazifa yaratilmasa fayl yetim qoladi - kvotani bekorga yeb turadi.
    if (storedFile) await storageService.removeFile(storedFile, currentUser._id);
    throw err;
  }

  await AssignmentRecipient.insertMany(
    recipients.map((r, i) => ({
      assignment: assignment._id,
      student: r.student._id,
      group: r.groupId,
      status: statuses[i],
    })),
    { ordered: false },
  );

  await scheduleDelivery(assignment._id);

  return getById(assignment._id, currentUser);
};

// Yetkazishni so'rov oqimidan ajratamiz: Agenda job'iga qo'yamiz.
// Agenda bo'lmasa (masalan test) - fonda (detached) bajaramiz.
const scheduleDelivery = async (assignmentId) => {
  try {
    const agenda = (await import("../../../config/scheduler.js")).default;
    await agenda.now("assignment.deliver", {
      assignmentId: String(assignmentId),
    });
  } catch (err) {
    logger.warn({ err }, "Vazifa yetkazish job'i navbatga qo'yilmadi, inline bajariladi");
    deliverAssignment(assignmentId).catch((e) =>
      logger.error({ err: e, assignmentId }, "Inline vazifa yetkazish xato"),
    );
  }
};

/**
 * Bot orqali yetkazish. Idempotent: faqat status="pending" bo'lganlar
 * uriniladi, ya'ni job qayta ishga tushsa dublikat xabar ketmaydi.
 */
export const deliverAssignment = async (assignmentId) => {
  const assignment = await Assignment.findById(assignmentId).lean();
  if (!assignment) return;

  const pending = await AssignmentRecipient.find({
    assignment: assignmentId,
    status: "pending",
  })
    .select({ _id: 1, student: 1 })
    .lean();
  if (!pending.length) return;

  const botUsers = await BotUser.find({
    user: { $in: pending.map((r) => r.student) },
  })
    .select({ user: 1, chatId: 1, telegramId: 1, isBlocked: 1 })
    .lean();
  const botByUser = new Map(botUsers.map((b) => [String(b.user), b]));

  // Fayl bir marta o'qiladi va hamma oluvchiga o'sha bufer ketadi.
  //
  // Fayl diskda topilmasa (qo'lda o'chirilgan, volume ko'chgan) vazifa
  // FAQAT MATN bo'lib ketadi. Xato tashlanmaydi ataylab: job yiqilsa
  // Agenda uni cheksiz qayta urinardi va o'quvchi matnni ham olmasdi.
  let filePayload = null;
  if (assignment.file) {
    const doc = await StoredFile.findById(assignment.file).lean();
    if (doc && !doc.isDeleted) {
      try {
        filePayload = {
          originalName: doc.originalName,
          mimeType: doc.mimeType,
          telegramFileId: doc.telegramFileId || null,
          // file_id bo'lsa bufer kerak emas - Telegram nusxani o'zida saqlagan.
          buffer: doc.telegramFileId ? null : await storageService.readFile(doc),
        };
      } catch (err) {
        logger.error(
          { err, assignmentId, fileId: doc._id },
          "Biriktirma diskda yo'q - vazifa faqat matn bo'lib ketadi",
        );
      }
    }
  }

  const { deliverAssignmentToChat } = await import(
    "../../../bot/services/assignmentDeliver.service.js"
  );

  const ops = [];
  const counters = { delivered: 0, blocked: 0, failed: 0 };

  await runPool(pending, DELIVERY_CONCURRENCY, async (r) => {
    const bu = botByUser.get(String(r.student));
    if (!bu || !bu.chatId || bu.isBlocked) {
      // Yaratilgandan keyin bloklagan bo'lishi mumkin - holatni yangilaymiz.
      const status = !bu || !bu.chatId ? "no_bot" : "blocked";
      ops.push({
        updateOne: {
          filter: { _id: r._id },
          update: { $set: { status, failedReason: status } },
        },
      });
      if (status === "blocked") counters.blocked += 1;
      return;
    }

    const res = await deliverAssignmentToChat(
      { chatId: bu.chatId, telegramId: bu.telegramId },
      {
        title: assignment.title,
        body: assignment.body,
        dueDate: assignment.dueDate,
        file: filePayload,
      },
    );

    if (res.ok) {
      counters.delivered += 1;
      // Birinchi muvaffaqiyatli yuborishdan keyin Telegram file_id ni
      // keshlaymiz: qolgan o'quvchilarga fayl qayta yuklanmaydi.
      if (res.telegramFileId && filePayload && !filePayload.telegramFileId) {
        filePayload.telegramFileId = res.telegramFileId;
        filePayload.buffer = null;
        storageService
          .cacheTelegramFileId(assignment.file, res.telegramFileId)
          .catch(() => null);
      }
      ops.push({
        updateOne: {
          filter: { _id: r._id },
          update: {
            $set: { status: "delivered", deliveredAt: new Date(), failedReason: "" },
          },
        },
      });
      return;
    }

    if (res.reason === "blocked") {
      counters.blocked += 1;
      ops.push({
        updateOne: {
          filter: { _id: r._id },
          update: { $set: { status: "blocked", failedReason: "blocked" } },
        },
      });
      return;
    }

    // transient (bot ishlamayapti / 429) - "pending" holida qoldiramiz,
    // keyingi yurishda qayta uriniladi.
    if (res.transient) return;

    counters.failed += 1;
    ops.push({
      updateOne: {
        filter: { _id: r._id },
        update: { $set: { status: "failed", failedReason: res.reason || "" } },
      },
    });
  });

  if (ops.length) {
    await AssignmentRecipient.bulkWrite(ops, { ordered: false });
  }

  // Hisoblagichlarni recipient hujjatlaridan QAYTA hisoblaymiz. $inc emas:
  // job qayta ishga tushsa (yoki bir qismi transient bo'lib qolgan bo'lsa)
  // $inc raqamlarni ikki hisoblab yuborardi.
  await recountAssignment(assignmentId);
};

/** Yetkazish hisoblagichlarini recipient'lardan qayta yig'adi. */
const recountAssignment = async (assignmentId) => {
  const rows = await AssignmentRecipient.aggregate([
    { $match: { assignment: new mongoose.Types.ObjectId(String(assignmentId)) } },
    { $group: { _id: "$status", n: { $sum: 1 } } },
  ]);
  const by = Object.fromEntries(rows.map((r) => [r._id, r.n]));
  await Assignment.updateOne(
    { _id: assignmentId },
    {
      $set: {
        deliveredCount: by.delivered || 0,
        blockedCount: by.blocked || 0,
        noBotCount: by.no_bot || 0,
        failedCount: by.failed || 0,
      },
    },
  );
};

const scopeFilter = (currentUser) => {
  // O'qituvchi faqat O'ZI yuborganini ko'radi. Owner/xodim - filial
  // ko'lamidagi hammasini.
  if (isTeacherActor(currentUser)) return { sender: currentUser._id };
  return {};
};

export const list = async (query, currentUser) => {
  const { page, limit, skip } = query;
  const filter = {
    isDeleted: { $ne: true },
    ...branchFilter(),
    ...scopeFilter(currentUser),
  };
  if (query.groupId) filter.groups = query.groupId;

  const [items, total] = await Promise.all([
    Assignment.find(filter)
      .sort({ sentAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("sender", { firstName: 1, lastName: 1, role: 1 })
      .populate("groups", { name: 1 })
      .populate("file", { originalName: 1, size: 1, mimeType: 1 })
      .lean(),
    Assignment.countDocuments(filter),
  ]);

  return { items, total };
};

export const getById = async (id, currentUser) => {
  const doc = await Assignment.findOne({
    _id: id,
    isDeleted: { $ne: true },
    ...branchFilter(),
  })
    .populate("sender", { firstName: 1, lastName: 1, role: 1 })
    .populate("groups", { name: 1 })
    .populate("file", { originalName: 1, size: 1, mimeType: 1 })
    .lean();

  if (!doc) throw new ApiError(404, "Vazifa topilmadi");
  if (
    isTeacherActor(currentUser) &&
    String(doc.sender?._id || doc.sender) !== String(currentUser._id)
  ) {
    throw new ApiError(403, "Ruxsat yo'q");
  }
  return doc;
};

/** Har bir o'quvchining yetkazish holati (o'qituvchi ko'radigan jadval). */
export const getRecipientList = async (assignmentId, { page, limit, skip, status }) => {
  const filter = { assignment: assignmentId };
  if (status) filter.status = status;

  const [items, total] = await Promise.all([
    AssignmentRecipient.find(filter)
      // Yetkazilmaganlar TEPADA: o'qituvchi aynan ular bilan ishlashi kerak.
      .sort({ status: 1, createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .populate("student", USER_PROJECTION)
      .populate("group", { name: 1 })
      .lean(),
    AssignmentRecipient.countDocuments(filter),
  ]);

  return { items, total };
};

/** Vazifani arxivlaydi va faylni diskdan o'chirib joyni bo'shatadi. */
export const remove = async (id, currentUser) => {
  const doc = await Assignment.findOne({
    _id: id,
    isDeleted: { $ne: true },
    ...branchFilter(),
  });
  if (!doc) throw new ApiError(404, "Vazifa topilmadi");

  if (
    isTeacherActor(currentUser) &&
    String(doc.sender) !== String(currentUser._id)
  ) {
    throw new ApiError(403, "Faqat o'z vazifangizni o'chira olasiz");
  }

  if (doc.file) {
    const storedFile = await StoredFile.findById(doc.file).lean();
    if (storedFile && !storedFile.isDeleted) {
      await storageService.removeFile(storedFile, currentUser._id);
    }
  }

  await doc.softDelete(currentUser._id);
  return { _id: doc._id };
};

/** Biriktirmani yuklab olish uchun tekshiruv + fayl hujjati. */
export const getDownloadable = async (assignmentId, currentUser, permissions) => {
  const assignment = await Assignment.findOne({
    _id: assignmentId,
    isDeleted: { $ne: true },
  }).lean();
  if (!assignment) throw new ApiError(404, "Vazifa topilmadi");
  if (!assignment.file) throw new ApiError(404, "Bu vazifada fayl yo'q");

  await assertCanRead(assignment, currentUser, permissions);

  const storedFile = await StoredFile.findById(assignment.file).lean();
  if (!storedFile || storedFile.isDeleted) {
    throw new ApiError(404, "Fayl o'chirilgan");
  }
  return storedFile;
};

/**
 * Faylni kim yuklab ola oladi.
 *
 * DIQQAT: bu yerda branchFilter ATAYLAB ishlatilmaydi - o'quvchi filial
 * tanlagichiga ega emas va uning konteksti bo'sh bo'lishi mumkin.
 * Himoya EGALIK orqali quriladi:
 *   - yuboruvchining o'zi;
 *   - oluvchilar ro'yxatidagi o'quvchi (o'ziga kelgan faylni oladi);
 *   - ASSIGNMENTS_READ ruxsatiga ega xodim/owner.
 *
 * Ruxsat route'da emas, SHU YERDA tekshiriladi: bitta manzil (GET /:id/file)
 * uch xil rolga xizmat qiladi va requirePermission ularning birortasini
 * (o'quvchini) butunlay yopib qo'yardi.
 */
const assertCanRead = async (assignment, currentUser, permissions) => {
  if (!currentUser) throw new ApiError(401, "Avtorizatsiyadan o'tilmagan");
  if (String(assignment.sender) === String(currentUser._id)) return;

  if (isStudentActor(currentUser)) {
    const mine = await AssignmentRecipient.exists({
      assignment: assignment._id,
      student: currentUser._id,
    });
    if (!mine) throw new ApiError(403, "Ruxsat yo'q");
    return;
  }

  // O'qituvchi uchun ASSIGNMENTS_READ yetarli EMAS: u ruxsat standart
  // rolda hammada bor va bo'lmasa o'qituvchi hamkasbining faylini yuklab
  // olardi. Uning uchun yagona shart - yuboruvchi bo'lishi (yuqorida
  // tekshirildi).
  if (isTeacherActor(currentUser)) throw new ApiError(403, "Ruxsat yo'q");

  if (!hasPermission(permissions, PERMISSIONS.ASSIGNMENTS_READ)) {
    throw new ApiError(403, "Ruxsat yo'q");
  }
};

/** O'quvchining o'ziga kelgan vazifalari (platforma ichida). */
export const listForStudent = async (studentId, { page, limit, skip }) => {
  const [rows, total] = await Promise.all([
    AssignmentRecipient.find({ student: studentId })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({
        path: "assignment",
        select: {
          title: 1,
          body: 1,
          dueDate: 1,
          sentAt: 1,
          file: 1,
          // Fayl tozalash bilan olib tashlangan bo'lsa o'quvchi buni
          // ko'rishi kerak - aks holda "fayl bor edi shekilli" degan
          // savol javobsiz qolardi.
          fileRemovedAt: 1,
          sender: 1,
          isDeleted: 1,
        },
        populate: [
          { path: "sender", select: { firstName: 1, lastName: 1 } },
          { path: "file", select: { originalName: 1, size: 1, mimeType: 1 } },
        ],
      })
      .populate("group", { name: 1 })
      .lean(),
    AssignmentRecipient.countDocuments({ student: studentId }),
  ]);

  // O'chirilgan vazifa o'quvchi ro'yxatida turmasin (recipient hujjati
  // qoladi, chunki u yetkazish tarixi).
  const items = rows
    .filter((r) => r.assignment && !r.assignment.isDeleted)
    .map((r) => ({
      _id: r._id,
      status: r.status,
      readAt: r.readAt,
      group: r.group,
      assignment: r.assignment,
    }));

  return { items, total };
};

/**
 * O'qilmagan vazifalar soni (sidebar nishoni uchun).
 *
 * PLATFORMA kanali bot kanalidan MUSTAQIL: botni bloklagan o'quvchi
 * xabarni faqat shu yerdan oladi, shuning uchun sanoq yetkazish
 * holatiga umuman qaramaydi - `readAt` bo'yicha hisoblanadi.
 */
export const unreadCountForStudent = async (studentId) => {
  const rows = await AssignmentRecipient.find({ student: studentId, readAt: null })
    .select({ assignment: 1 })
    .populate({ path: "assignment", select: { isDeleted: 1 } })
    .lean();

  // O'chirilgan vazifa sanoqqa kirmasin - ro'yxatda ham ko'rinmaydi,
  // aks holda nishon hech qachon nolga tushmasdi.
  const count = rows.filter((r) => r.assignment && !r.assignment.isDeleted).length;
  return { count };
};

/** O'quvchi vazifani platformada ochdi. */
export const markRead = async (recipientId, studentId) => {
  const updated = await AssignmentRecipient.findOneAndUpdate(
    { _id: recipientId, student: studentId, readAt: null },
    { $set: { readAt: new Date() } },
    { new: true },
  );
  return { _id: recipientId, readAt: updated?.readAt || null };
};
