import prisma from "../../../config/prisma.js";
import { withLegacyId } from "../../../utils/serialize.js";
import ApiError from "../../../utils/ApiError.js";
import {
  parseLocalDay,
  dateKeyOf,
  dayOfWeekOf,
  scheduleActiveOn,
} from "../../../helpers/attendance.helper.js";

const STUDENT_SELECT = {
  // `id` ATAYLAB: Prisma `select` bilan uni avtomatik qaytarmaydi,
  // klient esa o'quvchini `_id` bo'yicha ochadi.
  id: true,
  firstName: true,
  lastName: true,
  username: true,
  phone: true,
};

// JADVAL ALOHIDA JADVALDA. Mongo'da `schedule` guruh hujjati ichidagi
// massiv edi; `include` qilinmasa `sessionsForDay` bo'sh qaytarib,
// dars sessiyalari YO'QOLARDI.
const GROUP_WITH_SCHEDULE = {
  id: true,
  name: true,
  schedule: {
    select: { day: true, startTime: true, endTime: true, effectiveFrom: true },
  },
};

const ensureGroup = async (groupId) => {
  const g = await prisma.group.findUnique({
    where: { id: String(groupId) },
    select: GROUP_WITH_SCHEDULE,
  });
  if (!g) throw new ApiError(404, "Guruh topilmadi");
  return g;
};

// Kunning sessiyalari (davomat bilan bir xil ta'rif): bir slotli kun → ""; ko'p
// slotli kun → slot=startTime.
const sessionsForDay = (group, dow, date = null) => {
  // Shu sanada AMAL QILGAN jadval versiyasi (versiyalash) - davomat bilan bir xil
  const daySlots = scheduleActiveOn(group.schedule, date)
    .filter((s) => s.day === dow)
    .sort((a, b) => a.startTime.localeCompare(b.startTime))
    .map((s) => ({ startTime: s.startTime, endTime: s.endTime }));
  const multi = daySlots.length > 1;
  return daySlots.map((s) => ({
    slot: multi ? s.startTime : "",
    startTime: s.startTime,
    endTime: s.endTime,
  }));
};

// Berilgan sanada guruhning aktiv a'zolari (davomat roster filtri bilan bir xil).
const activeMembersOn = async (groupId, date) => {
  const dayEnd = new Date(date.getTime() + 24 * 60 * 60 * 1000);
  return prisma.groupMembership.findMany({
    where: {
      groupId: String(groupId),
      joinedAt: { lt: dayEnd },
      OR: [{ leftAt: null }, { leftAt: { gt: date } }],
      isDeleted: false,
    },
    select: { studentId: true, student: { select: STUDENT_SELECT } },
  });
};

// ─── Guruh + sana uchun baholash ro'yxati (mavjud ballar bilan) ───
export const listForGroupOnDate = async (groupId, dateInput, slotInput = null) => {
  const group = await ensureGroup(groupId);
  const date = parseLocalDay(dateInput);
  if (!date) throw new ApiError(400, "Sana noto'g'ri");
  const dow = dayOfWeekOf(date);
  const sessions = sessionsForDay(group, dow, date);
  const selectedSlot =
    slotInput !== null && slotInput !== undefined
      ? slotInput
      : sessions[0]?.slot ?? "";

  const memberships = await activeMembersOn(groupId, date);
  const studentIds = memberships.filter((m) => m.student).map((m) => m.student.id);

  const dKey = dateKeyOf(date);
  const grades = await prisma.grade.findMany({
    where: {
      groupId: String(groupId),
      studentId: { in: studentIds },
      dateKey: dKey,
      slot: selectedSlot,
      isDeleted: false,
    },
  });
  const gradeMap = new Map();
  for (const g of grades) gradeMap.set(String(g.studentId), g);

  const rows = memberships
    .filter((m) => m.student)
    .map((m) => {
      const g = gradeMap.get(String(m.student.id)) || null;
      // `toJSON()` EMAS - Prisma oddiy obyekt qaytaradi (Mongoose
      // hujjati emas). Javobda `_id` QOLADI: klient o'quvchini shu
      // bo'yicha ajratadi.
      return {
        student: withLegacyId(m.student),
        grade: g ? withLegacyId(g) : null,
      };
    });

  return {
    group: { _id: group.id, name: group.name, schedule: group.schedule },
    date,
    dateKey: dKey,
    sessions,
    slot: selectedSlot,
    isClassDay: sessions.length > 0,
    rows,
  };
};

const validateItem = (item) => {
  if (!item.studentId) throw new ApiError(400, "O'quvchi kerak");
  const v = Number(item.value);
  if (!Number.isInteger(v) || v < 1 || v > 5) {
    throw new ApiError(400, "Ball 1 dan 5 gacha bo'lishi kerak");
  }
};

/**
 * TRANZAKSIYA — ENDI HAQIQIY.
 *
 * Mongo'da `startSession()` standalone o'rnatmada jimgina
 * atomiklikni yo'qotardi (replica set bo'lmasa tranzaksiya
 * qo'llab-quvvatlanmaydi). PostgreSQL'da `$transaction` har doim
 * haqiqiy: bir nechta o'quvchining bahosi yo hammasi yoziladi, yo
 * hech biri - yarim yozilgan varaq qolmaydi.
 */
const runInTransaction = (fn) => prisma.$transaction(fn);


// ─── Guruh + sana uchun ballarni bulk saqlash (upsert + audit) ───
export const bulkRecord = async (
  groupId,
  dateInput,
  items,
  currentUser,
  slot = null,
) => {
  const group = await ensureGroup(groupId);
  const date = parseLocalDay(dateInput);
  if (!date) throw new ApiError(400, "Sana noto'g'ri");
  const dKey = dateKeyOf(date);
  const dow = dayOfWeekOf(date);
  const sessions = sessionsForDay(group, dow, date);
  if (sessions.length === 0) {
    throw new ApiError(400, "Bu kun bu guruh uchun dars kuni emas");
  }
  const normalizedSlot =
    sessions.length > 1
      ? slot || sessions[0].slot
      : "";
  if (
    sessions.length > 1 &&
    !sessions.some((s) => s.slot === normalizedSlot)
  ) {
    throw new ApiError(400, "Sessiya (dars vaqti) noto'g'ri");
  }

  if (!Array.isArray(items) || items.length === 0) {
    throw new ApiError(400, "Hech bo'lmaganda bitta ball kerak");
  }
  for (const item of items) validateItem(item);

  // Har bir o'quvchi shu sanada guruhning aktiv a'zosi ekanini tekshiramiz
  const studentIds = items.map((it) => it.studentId);
  const dayEnd = new Date(date.getTime() + 24 * 60 * 60 * 1000);
  const activeMembers = await prisma.groupMembership.findMany({
    where: {
      groupId: String(groupId),
      studentId: { in: studentIds.map(String) },
      joinedAt: { lt: dayEnd },
      OR: [{ leftAt: null }, { leftAt: { gt: date } }],
      isDeleted: false,
    },
    select: { studentId: true },
  });
  const memberSet = new Set(activeMembers.map((m) => String(m.studentId)));
  for (const item of items) {
    if (!memberSet.has(String(item.studentId))) {
      throw new ApiError(400, "O'quvchi bu sanada guruhning aktiv a'zosi emas");
    }
  }

  // Audit uchun mavjud ballarni oldindan olamiz
  const existing = await prisma.grade.findMany({
    where: {
      groupId: String(groupId),
      studentId: { in: studentIds.map(String) },
      dateKey: dKey,
      slot: normalizedSlot,
      isDeleted: false,
    },
  });
  const existingMap = new Map();
  for (const g of existing) existingMap.set(String(g.studentId), g);

  // QISMAN UNIQUE INDEKS: `(groupId, studentId, dateKey, slot)` faqat
  // `WHERE isDeleted = false` uchun amal qiladi. Prisma `upsert` bunday
  // indeksni ISHLATA OLMAYDI (u to'liq unique kalit talab qiladi),
  // shuning uchun find-then-write + P2002 qayta urinish.
  const docs = await runInTransaction(async (tx) => {
    const out = [];
    for (const item of items) {
      const prev = existingMap.get(String(item.studentId));
      const value = Number(item.value);
      const changed = !prev || prev.value !== value;

      // `$push` o'rni: `history` ustuni `Json`, massiv JS'da yig'iladi.
      const history = Array.isArray(prev?.history) ? [...prev.history] : [];
      if (changed) {
        history.push({
          at: new Date(),
          by: String(currentUser._id),
          from: prev ? prev.value : null,
          to: value,
          source: "teacher",
        });
      }

      const data = {
        value,
        comment: item.comment || "",
        recordedById: String(currentUser._id),
        recordedAt: new Date(),
        source: "teacher",
        isDeleted: false,
        history,
      };

      let doc;
      if (prev) {
        doc = await tx.grade.update({ where: { id: prev.id }, data });
      } else {
        try {
          doc = await tx.grade.create({
            data: {
              groupId: String(groupId),
              studentId: String(item.studentId),
              date,
              dateKey: dKey,
              slot: normalizedSlot,
              ...data,
            },
          });
        } catch (err) {
          // POYGA: ikki o'qituvchi bir vaqtda baholasa. Mongo'da bu
          // `11000` edi, Prisma'da `P2002` - yozuv baribir bor,
          // ustiga yozamiz.
          if (err?.code !== "P2002") throw err;
          const again = await tx.grade.findFirst({
            where: {
              groupId: String(groupId),
              studentId: String(item.studentId),
              dateKey: dKey,
              slot: normalizedSlot,
              isDeleted: false,
            },
          });
          doc = again
            ? await tx.grade.update({ where: { id: again.id }, data })
            : null;
        }
      }
      if (doc) out.push(doc);
    }
    return out;
  });

  return { count: docs.length, slot: normalizedSlot };
};

// ─── Guruh summary: o'rtacha ball + tarqalish (1..5) ───
export const getGroupSummary = async (groupId, { fromDate, toDate }) => {
  await ensureGroup(groupId);
  const from = parseLocalDay(fromDate);
  const to = parseLocalDay(toDate);
  if (!from || !to) throw new ApiError(400, "Sana noto'g'ri");
  const fromKey = dateKeyOf(from);
  const toKey = dateKeyOf(to);

  const grades = await prisma.grade.findMany({
    where: {
      groupId: String(groupId),
      dateKey: { gte: fromKey, lte: toKey },
      isDeleted: false,
    },
    select: { value: true, student: { select: STUDENT_SELECT } },
  });

  const dist = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const byStudent = new Map();
  let sum = 0;
  for (const g of grades) {
    dist[g.value] = (dist[g.value] || 0) + 1;
    sum += g.value;
    if (!g.student) continue;
    const sid = String(g.student.id);
    if (!byStudent.has(sid)) {
      byStudent.set(sid, { student: g.student, sum: 0, count: 0 });
    }
    const e = byStudent.get(sid);
    e.sum += g.value;
    e.count += 1;
  }

  const perStudent = Array.from(byStudent.values())
    .map((e) => ({
      student: e.student,
      average: e.count ? Math.round((e.sum / e.count) * 100) / 100 : null,
      count: e.count,
    }))
    .sort((a, b) => (b.average || 0) - (a.average || 0));

  const average = grades.length
    ? Math.round((sum / grades.length) * 100) / 100
    : null;

  return {
    average,
    total: grades.length,
    distribution: dist,
    perStudent,
  };
};

// ─── O'quvchi summary: o'rtacha ball + oxirgi ballar ───
export const getStudentSummary = async (
  studentId,
  { fromDate, toDate, scopeGroupIds } = {},
) => {
  const where = { studentId: String(studentId), isDeleted: false };
  if (fromDate && toDate) {
    where.dateKey = {
      gte: dateKeyOf(parseLocalDay(fromDate)),
      lte: dateKeyOf(parseLocalDay(toDate)),
    };
  }
  // `group` -> `groupId`: Prisma'da `group` RELATION.
  if (Array.isArray(scopeGroupIds)) {
    where.groupId = { in: scopeGroupIds.map(String) };
  }
  const grades = await prisma.grade.findMany({
    where,
    select: {
      id: true,
      value: true,
      dateKey: true,
      comment: true,
      group: { select: { id: true, name: true } },
    },
    orderBy: { dateKey: "desc" },
  });

  const count = grades.length;
  const sum = grades.reduce((acc, g) => acc + g.value, 0);
  const average = count ? Math.round((sum / count) * 100) / 100 : null;

  return {
    average,
    count,
    // Javobda `_id` QOLADI - klient shunga tayangan.
    recent: grades.slice(0, 20).map((g) => ({
      _id: g.id,
      value: g.value,
      dateKey: g.dateKey,
      comment: g.comment || "",
      group: g.group ? { _id: g.group.id, name: g.group.name } : null,
    })),
  };
};

// ─── Reyting uchun: bir nechta o'quvchining o'rtacha balli (xaritada) ───
export const averagesForStudents = async (studentIds, { fromDate, toDate, groupId } = {}) => {
  // ID ENDI ODDIY SATR - `new ObjectId(...)` kerak emas (Postgres
  // birlamchi kaliti `VARCHAR(24)`).
  const where = {
    studentId: { in: studentIds.map(String) },
    isDeleted: false,
  };
  if (groupId) where.groupId = String(groupId);
  if (fromDate && toDate) {
    where.dateKey = {
      gte: dateKeyOf(parseLocalDay(fromDate)),
      lte: dateKeyOf(parseLocalDay(toDate)),
    };
  }

  // Guruhlash `grades` jadvalining O'Z ustuni (`studentId`) bo'yicha -
  // `groupBy` yetarli, raw SQL kerak emas.
  const rows = await prisma.grade.groupBy({
    by: ["studentId"],
    where,
    _sum: { value: true },
    _count: { _all: true },
  });
  const map = new Map();
  for (const r of rows) {
    const count = r._count._all;
    const sum = r._sum.value || 0;
    map.set(String(r.studentId), {
      average: count ? Math.round((sum / count) * 100) / 100 : null,
      count,
    });
  }
  return map;
};
