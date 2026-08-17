import prisma from "../../../config/prisma.js";
import { withLegacyId, withLegacyIds } from "../../../utils/serialize.js";
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

const USER_SELECT = { id: true, firstName: true, lastName: true, phone: true };

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

  const groups = await prisma.group.findMany({
    where: {
      id: { in: ids },
      isDeleted: false,
      ...branchFilter(),
    },
    select: { id: true, name: true, branchId: true, teachers: { select: { id: true } } },
  });

  if (groups.length !== ids.length) {
    throw new ApiError(404, "Ba'zi guruhlar topilmadi");
  }

  const isTeacher = isTeacherActor(currentUser);
  if (isTeacher) {
    const currentUserId = currentUser._id || currentUser.id;
    const mine = groups.every((g) =>
      (g.teachers || []).some((t) => String(t.id) === String(currentUserId)),
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
 * Qaytadi: [{ student, groupId, botUser|null }]
 * Bir o'quvchi ikki guruhda bo'lsa BIR MARTA qaytadi (birinchi guruh
 * bilan) - aks holda unga bir xil vazifa ikki marta borardi.
 */
const resolveRecipients = async (groups) => {
  const groupIds = groups.map((g) => g.id);

  const memberships = await prisma.groupMembership.findMany({
    where: {
      groupId: { in: groupIds },
      leftAt: null,
      isDeleted: false,
    },
    select: { studentId: true, groupId: true },
  });

  if (!memberships.length) return [];

  // Faqat faol, o'chirilmagan o'quvchilar (boshqa modullar bilan bir xil qoida).
  const studentIds = [...new Set(memberships.map((m) => String(m.studentId)))];
  const students = await prisma.user.findMany({
    where: {
      id: { in: studentIds },
      isActive: true,
      isDeleted: false,
    },
    select: USER_SELECT,
  });
  const studentById = new Map(students.map((s) => [String(s.id), s]));

  // Bot bog'lanishlari BITTA so'rovda (N+1 yo'q).
  const botUsers = await prisma.botUser.findMany({
    where: { userId: { in: students.map((s) => s.id) } },
    select: { userId: true, chatId: true, telegramId: true, isBlocked: true },
  });
  const botByUser = new Map(botUsers.map((b) => [String(b.userId), b]));

  const seen = new Set();
  const out = [];
  for (const m of memberships) {
    const sid = String(m.studentId);
    if (seen.has(sid)) continue;
    const student = studentById.get(sid);
    if (!student) continue; // nofaol / arxivlangan
    seen.add(sid);
    out.push({
      student,
      groupId: m.groupId,
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
      _id: r.student.id,
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
    groups: groups.map((g) => ({ _id: g.id, name: g.name })),
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

  const currentUserId = currentUser._id || currentUser.id;

  let storedFile = null;
  if (file?.buffer?.length) {
    storedFile = await storageService.saveBuffer({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      userId: currentUserId,
      purpose: "assignment",
    });
  }

  const statuses = recipients.map((r) => initialStatus(r.botUser));
  const countOf = (s) => statuses.filter((x) => x === s).length;

  let assignment;
  try {
    assignment = await prisma.assignment.create({
      data: {
        senderId: String(currentUserId),
        title: body.title,
        body: body.body || "",
        branchId: groups[0]?.branchId || null,
        fileId: storedFile?.id || storedFile?._id || null,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        recipientsCount: recipients.length,
        deliveredCount: 0,
        blockedCount: countOf("blocked"),
        noBotCount: countOf("no_bot"),
        failedCount: 0,
        sentAt: new Date(),
        groups: {
          connect: groups.map((g) => ({ id: g.id })),
        },
      },
    });
  } catch (err) {
    // Vazifa yaratilmasa fayl yetim qoladi - kvotani bekorga yeb turadi.
    if (storedFile) await storageService.removeFile(storedFile, currentUserId);
    throw err;
  }

  // `assignment` → `assignmentId`, `student` → `studentId`, `group` → `groupId`
  await prisma.assignmentRecipient.createMany({
    data: recipients.map((r, i) => ({
      assignmentId: assignment.id,
      studentId: String(r.student.id),
      groupId: String(r.groupId),
      status: statuses[i],
    })),
  });

  await scheduleDelivery(assignment.id);

  return getById(assignment.id, currentUser);
};

// Yetkazishni so'rov oqimidan ajratamiz: pg-boss job'iga qo'yamiz.
// pg-boss bo'lmasa (masalan test) - fonda (detached) bajaramiz.
const scheduleDelivery = async (assignmentId) => {
  try {
    const scheduler = (await import("../../../config/scheduler.js")).default;
    await scheduler.now("assignment.deliver", {
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
  const assignment = await prisma.assignment.findUnique({
    where: { id: String(assignmentId) },
  });
  if (!assignment) return;

  const pending = await prisma.assignmentRecipient.findMany({
    where: { assignmentId: String(assignmentId), status: "pending" },
    select: { id: true, studentId: true },
  });
  if (!pending.length) return;

  const botUsers = await prisma.botUser.findMany({
    where: { userId: { in: pending.map((r) => r.studentId) } },
    select: { userId: true, chatId: true, telegramId: true, isBlocked: true },
  });
  const botByUser = new Map(botUsers.map((b) => [String(b.userId), b]));

  // Fayl bir marta o'qiladi va hamma oluvchiga o'sha bufer ketadi.
  //
  // Fayl diskda topilmasa (qo'lda o'chirilgan, volume ko'chgan) vazifa
  // FAQAT MATN bo'lib ketadi. Xato tashlanmaydi ataylab: job yiqilsa
  // pg-boss uni cheksiz qayta urinardi va o'quvchi matnni ham olmasdi.
  let filePayload = null;
  if (assignment.fileId) {
    const doc = await prisma.storedFile.findUnique({
      where: { id: assignment.fileId },
    });
    if (doc && !doc.isDeleted) {
      try {
        filePayload = {
          originalName: doc.originalName,
          mimeType: doc.mimeType,
          telegramFileId: doc.telegramFileId || null,
          // telegramFileId bo'lsa bufer kerak emas - Telegram nusxani o'zida saqlagan.
          buffer: doc.telegramFileId ? null : await storageService.readFile(doc),
        };
      } catch (err) {
        logger.error(
          { err, assignmentId, fileId: doc.id },
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
    const bu = botByUser.get(String(r.studentId));
    if (!bu || !bu.chatId || bu.isBlocked) {
      // Yaratilgandan keyin bloklagan bo'lishi mumkin - holatni yangilaymiz.
      const status = !bu || !bu.chatId ? "no_bot" : "blocked";
      ops.push(
        prisma.assignmentRecipient.update({
          where: { id: r.id },
          data: { status, failedReason: status },
        })
      );
      if (status === "blocked") counters.blocked += 1;
      return;
    }

    const res = await deliverAssignmentToChat(
      { chatId: Number(bu.chatId), telegramId: Number(bu.telegramId) },
      {
        title: assignment.title,
        body: assignment.body,
        dueDate: assignment.dueDate,
        file: filePayload,
      },
    );

    if (res.ok) {
      counters.delivered += 1;
      // Birinchi muvaffaqiyatli yuborishdan keyin Telegram telegramFileId ni
      // keshlaymiz: qolgan o'quvchilarga fayl qayta yuklanmaydi.
      if (res.telegramFileId && filePayload && !filePayload.telegramFileId) {
        filePayload.telegramFileId = res.telegramFileId;
        filePayload.buffer = null;
        storageService
          .cacheTelegramFileId(assignment.fileId, res.telegramFileId)
          .catch(() => null);
      }
      ops.push(
        prisma.assignmentRecipient.update({
          where: { id: r.id },
          data: { status: "delivered", deliveredAt: new Date(), failedReason: "" },
        })
      );
      return;
    }

    if (res.reason === "blocked") {
      counters.blocked += 1;
      ops.push(
        prisma.assignmentRecipient.update({
          where: { id: r.id },
          data: { status: "blocked", failedReason: "blocked" },
        })
      );
      return;
    }

    // transient (bot ishlamayapti / 429) - "pending" holida qoldiramiz,
    // keyingi yurishda qayta uriniladi.
    if (res.transient) return;

    counters.failed += 1;
    ops.push(
      prisma.assignmentRecipient.update({
        where: { id: r.id },
        data: { status: "failed", failedReason: res.reason || "" },
      })
    );
  });

  if (ops.length) {
    await Promise.allSettled(ops);
  }

  // Hisoblagichlarni recipient hujjatlaridan QAYTA hisoblaymiz. $inc emas:
  // job qayta ishga tushsa (yoki bir qismi transient bo'lib qolgan bo'lsa)
  // increment raqamlarni ikki hisoblab yuborardi.
  await recountAssignment(assignmentId);
};

/** Yetkazish hisoblagichlarini recipient'lardan qayta yig'adi. */
const recountAssignment = async (assignmentId) => {
  // Aggregate → groupBy
  const grouped = await prisma.assignmentRecipient.groupBy({
    by: ["status"],
    where: { assignmentId: String(assignmentId) },
    _count: { _all: true },
  });
  const by = Object.fromEntries(grouped.map((r) => [r.status, r._count._all]));

  await prisma.assignment.update({
    where: { id: String(assignmentId) },
    data: {
      deliveredCount: by.delivered || 0,
      blockedCount: by.blocked || 0,
      noBotCount: by.no_bot || 0,
      failedCount: by.failed || 0,
    },
  });
};

const scopeFilter = (currentUser) => {
  // O'qituvchi faqat O'ZI yuborganini ko'radi. Owner/xodim - filial
  // ko'lamidagi hammasini.
  if (isTeacherActor(currentUser)) return { senderId: String(currentUser._id || currentUser.id) };
  return {};
};

export const list = async (query, currentUser) => {
  const { page, limit, skip } = query;
  
  const where = {
    isDeleted: false,
    ...branchFilter(),
    ...scopeFilter(currentUser),
  };
  
  // `groups: groupId` Mongo shakli edi, Prismada bu relations filtri.
  if (query.groupId) {
    where.groups = { some: { id: String(query.groupId) } };
  }

  const [items, total] = await Promise.all([
    prisma.assignment.findMany({
      where,
      orderBy: { sentAt: "desc" },
      skip,
      take: limit,
      include: {
        sender: { select: { id: true, firstName: true, lastName: true, role: true } },
        groups: { select: { id: true, name: true } },
        file: { select: { id: true, originalName: true, size: true, mimeType: true } },
      },
    }),
    prisma.assignment.count({ where }),
  ]);

  return { items: withLegacyIds(items), total };
};

export const getById = async (id, currentUser) => {
  const doc = await prisma.assignment.findFirst({
    where: {
      id: String(id),
      isDeleted: false,
      ...branchFilter(),
    },
    include: {
      sender: { select: { id: true, firstName: true, lastName: true, role: true } },
      groups: { select: { id: true, name: true } },
      file: { select: { id: true, originalName: true, size: true, mimeType: true } },
    },
  });

  if (!doc) throw new ApiError(404, "Vazifa topilmadi");
  
  const currentUserId = currentUser._id || currentUser.id;
  if (
    isTeacherActor(currentUser) &&
    String(doc.senderId) !== String(currentUserId)
  ) {
    throw new ApiError(403, "Ruxsat yo'q");
  }
  
  return withLegacyId(doc);
};

/** Har bir o'quvchining yetkazish holati (o'qituvchi ko'radigan jadval). */
export const getRecipientList = async (assignmentId, { page, limit, skip, status }) => {
  const where = { assignmentId: String(assignmentId) };
  if (status) where.status = status;

  const [items, total] = await Promise.all([
    prisma.assignmentRecipient.findMany({
      where,
      // Yetkazilmaganlar TEPADA: o'qituvchi aynan ular bilan ishlashi kerak.
      orderBy: [{ status: "asc" }, { createdAt: "asc" }],
      skip,
      take: limit,
      include: {
        student: { select: USER_SELECT },
        group: { select: { id: true, name: true } },
      },
    }),
    prisma.assignmentRecipient.count({ where }),
  ]);

  return { items: withLegacyIds(items), total };
};

/** Vazifani arxivlaydi va faylni diskdan o'chirib joyni bo'shatadi. */
export const remove = async (id, currentUser) => {
  const doc = await prisma.assignment.findFirst({
    where: {
      id: String(id),
      isDeleted: false,
      ...branchFilter(),
    },
  });
  if (!doc) throw new ApiError(404, "Vazifa topilmadi");

  const currentUserId = currentUser._id || currentUser.id;

  if (
    isTeacherActor(currentUser) &&
    String(doc.senderId) !== String(currentUserId)
  ) {
    throw new ApiError(403, "Faqat o'z vazifangizni o'chira olasiz");
  }

  if (doc.fileId) {
    const storedFile = await prisma.storedFile.findUnique({ where: { id: doc.fileId } });
    if (storedFile && !storedFile.isDeleted) {
      await storageService.removeFile(storedFile, currentUserId);
    }
  }

  // softDelete o'rniga update
  await prisma.assignment.update({
    where: { id: doc.id },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: String(currentUserId),
    },
  });
  
  return { _id: doc.id };
};

/** Biriktirmani yuklab olish uchun tekshiruv + fayl hujjati. */
export const getDownloadable = async (assignmentId, currentUser, permissions) => {
  const assignment = await prisma.assignment.findFirst({
    where: {
      id: String(assignmentId),
      isDeleted: false,
    },
  });
  if (!assignment) throw new ApiError(404, "Vazifa topilmadi");
  if (!assignment.fileId) throw new ApiError(404, "Bu vazifada fayl yo'q");

  await assertCanRead(assignment, currentUser, permissions);

  const storedFile = await prisma.storedFile.findUnique({
    where: { id: assignment.fileId },
  });
  if (!storedFile || storedFile.isDeleted) {
    throw new ApiError(404, "Fayl o'chirilgan");
  }
  return withLegacyId(storedFile);
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
  
  const currentUserId = currentUser._id || currentUser.id;
  if (String(assignment.senderId) === String(currentUserId)) return;

  if (isStudentActor(currentUser)) {
    const mine = await prisma.assignmentRecipient.findFirst({
      where: {
        assignmentId: assignment.id,
        studentId: String(currentUserId),
      },
      select: { id: true },
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
    prisma.assignmentRecipient.findMany({
      where: { studentId: String(studentId) },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
      include: {
        assignment: {
          select: {
            title: true,
            body: true,
            dueDate: true,
            sentAt: true,
            fileId: true,
            // Fayl tozalash bilan olib tashlangan bo'lsa o'quvchi buni
            // ko'rishi kerak - aks holda "fayl bor edi shekilli" degan
            // savol javobsiz qolardi.
            fileRemovedAt: true,
            senderId: true,
            isDeleted: true,
            sender: { select: { id: true, firstName: true, lastName: true } },
            file: { select: { id: true, originalName: true, size: true, mimeType: true } },
          },
        },
        group: { select: { id: true, name: true } },
      },
    }),
    prisma.assignmentRecipient.count({ where: { studentId: String(studentId) } }),
  ]);

  // O'chirilgan vazifa o'quvchi ro'yxatida turmasin (recipient hujjati
  // qoladi, chunki u yetkazish tarixi).
  const items = rows
    .filter((r) => r.assignment && !r.assignment.isDeleted)
    .map((r) => ({
      _id: r.id,
      status: r.status,
      readAt: r.readAt,
      group: withLegacyId(r.group),
      // include da o'zimiz tanlagan poliyalarni olganimiz bilan,
      // serialize qilishda withLegacyId xalaqit qilmaydi
      assignment: withLegacyId(r.assignment),
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
  // Prisma'da xuddi Mongo'dagi kabi populate filtri o'rniga to'g'ridan-to'g'ri 
  // bog'langan model fieldiga shart qo'yish mumkin (relation filter).
  const count = await prisma.assignmentRecipient.count({
    where: { 
      studentId: String(studentId), 
      readAt: null,
      assignment: { isDeleted: false }
    }
  });

  return { count };
};

/** O'quvchi vazifani platformada ochdi. */
export const markRead = async (recipientId, studentId) => {
  // `updateMany` atomik shart uchun.
  const res = await prisma.assignmentRecipient.updateMany({
    where: { id: String(recipientId), studentId: String(studentId), readAt: null },
    data: { readAt: new Date() },
  });
  
  if (res.count === 0) return null; // Avval o'qilgan yoki topilmadi
  
  const updated = await prisma.assignmentRecipient.findUnique({
    where: { id: String(recipientId) }
  });
  
  return { _id: updated.id, readAt: updated.readAt };
};
