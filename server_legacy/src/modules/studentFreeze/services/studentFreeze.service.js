import prisma from "../../../config/prisma.js";
import ApiError from "../../../utils/ApiError.js";
import { ROLES } from "../../../constants/roles.js";
import { assertTargetInScope } from "../../../helpers/branchAccess.helper.js";
import {
  toUtcMidnight,
  localTodayMidnight,
} from "../../../helpers/attendance.helper.js";
import { correlationCacheInvalidate } from "../../../helpers/correlationCache.js";
import { withLegacyId, withLegacyIds } from "../../../utils/serialize.js";
import * as financePaymentService from "../../finance/services/studentPayment.service.js";
import logger from "../../../config/logger.js";

// ─────────────────────────────────────────────────────────────────
// MONGO → PRISMA
//   student   → studentId      createdBy → createdById
//   endedBy   → endedById      isDeleted: { $ne: true } → isDeleted: false
//
// `isDeleted: { $ne: true }` NEGA `false` GA AYLANDI: Mongo'da maydon
// umuman bo'lmasligi mumkin edi ("mavjud emas" ham "true emas"), Postgres
// ustunida esa `@default(false)` bor - NULL holat yo'q.
// ─────────────────────────────────────────────────────────────────

// FILIAL HIMOYASI.
//
// Ilgari bu modul butunlay requireRole(OWNER) bilan qulflangan edi, ya'ni
// faqat owner kirardi va o'quvchi qaysi filialda ekani ahamiyatsiz edi.
// Endi muzlatish `students.freeze` ruxsatiga ochilgan (filial direktori
// uchun kundalik amal), shuning uchun chegara shu yerda qo'yiladi.
//
// `scope` berilmasa (job / ichki chaqiruv) tekshirilmaydi.
//
// DIQQAT - `branchAssignments` ATAYLAB YUKLANADI: assertTargetInScope
// o'quvchining filiallarini `homeBranchId` VA `branchAssignments[]` dan
// yig'adi. Prisma relation'ni so'ralmasa qaytarmaydi, ya'ni ro'yxat bo'sh
// bo'lib qolardi va faqat `homeBranchId` mos kelgan holat o'tardi -
// qo'shimcha filialga biriktirilgan o'quvchi "kirish huquqingiz yo'q"
// xatosini olardi (jimgina fail-closed regressiya).
const ensureStudent = async (studentId, scope = null) => {
  const u = await prisma.user.findUnique({
    where: { id: String(studentId) },
    select: {
      id: true,
      role: true,
      isActive: true,
      enrolledAt: true,
      homeBranchId: true,
      branchAssignments: { select: { branchId: true } },
    },
  });
  if (!u || u.role !== ROLES.STUDENT) {
    throw new ApiError(404, "O'quvchi topilmadi");
  }
  if (scope) {
    assertTargetInScope(scope.allowedBranchIds, scope.canSeeAllBranches, u);
  }
  return u;
};

// Ochiq (hozir amaldagi) muzlatishni qaytaradi yoki null.
const findActiveFreeze = (studentId) =>
  prisma.studentFreeze.findFirst({
    where: { studentId: String(studentId), endDate: null, isDeleted: false },
  });

// Muzlatish/chiqarishdan keyin: to'lovlarni qayta hisoblaymiz (muzlatilgan
// darslar accrual qilinmaydi) va davomat foizi keshini tozalaymiz.
const afterFreezeChange = async (studentId) => {
  try {
    await financePaymentService.recalcForStudent(studentId);
  } catch (err) {
    logger.warn({ err, studentId }, "Muzlatishda o'quvchi to'lovlari qayta hisoblanmadi");
  }
  correlationCacheInvalidate();
};

// O'quvchini muzlatish. startDate berilmasa - bugun. Kelajak sana bo'lmaydi.
export const freeze = async (studentId, { startDate, reason, by, scope } = {}) => {
  const student = await ensureStudent(studentId, scope);
  if (!student.isActive) {
    throw new ApiError(
      400,
      "Arxivlangan o'quvchini muzlatib bo'lmaydi. Avval uni tiklang.",
    );
  }

  const existing = await findActiveFreeze(studentId);
  if (existing) {
    throw new ApiError(400, "O'quvchi allaqachon muzlatilgan");
  }

  const start = startDate ? toUtcMidnight(startDate) : localTodayMidnight();
  if (start.getTime() > localTodayMidnight().getTime()) {
    throw new ApiError(400, "Muzlatish sanasi kelajakda bo'lishi mumkin emas");
  }

  // Muzlatish sanasi o'quvchi guruhga qo'shilgan (kelgan) kundan oldin bo'lmasin.
  // Bir nechta faol guruh bo'lsa - eng erta qo'shilgan sana bilan cheklanadi;
  // faol a'zolik bo'lmasa - ro'yxatga olingan sana (enrolledAt) bilan.
  const firstJoin = await prisma.groupMembership.findFirst({
    where: { studentId: student.id, leftAt: null, isDeleted: false },
    select: { joinedAt: true },
    orderBy: { joinedAt: "asc" },
  });
  const joinBound = firstJoin
    ? toUtcMidnight(firstJoin.joinedAt)
    : student.enrolledAt
      ? toUtcMidnight(student.enrolledAt)
      : null;
  if (joinBound && start.getTime() < joinBound.getTime()) {
    throw new ApiError(
      400,
      "Muzlatish sanasi o'quvchi guruhga qo'shilgan kundan oldin bo'lishi mumkin emas",
    );
  }

  const created = await prisma.studentFreeze.create({
    data: {
      studentId: student.id,
      startDate: start,
      endDate: null,
      reason: reason || "",
      createdById: by?.id || by?._id || null,
    },
  });

  await afterFreezeChange(student.id);
  return withLegacyId(created);
};

// O'quvchini muzlatishdan chiqarish. endDate berilmasa - bugun (EXCLUSIVE:
// shu kundan boshlab o'quvchi yana faol). Kelajak/boshlanishidan oldin bo'lmaydi.
export const unfreeze = async (studentId, { endDate, by, scope } = {}) => {
  const student = await ensureStudent(studentId, scope);

  const active = await findActiveFreeze(student.id);
  if (!active) {
    throw new ApiError(400, "O'quvchi muzlatilmagan");
  }

  const end = endDate ? toUtcMidnight(endDate) : localTodayMidnight();
  if (end.getTime() > localTodayMidnight().getTime()) {
    throw new ApiError(400, "Chiqarish sanasi kelajakda bo'lishi mumkin emas");
  }
  if (end.getTime() < toUtcMidnight(active.startDate).getTime()) {
    throw new ApiError(
      400,
      "Chiqarish sanasi muzlatish sanasidan oldin bo'lishi mumkin emas",
    );
  }

  // Mongoose'da bu `active.endDate = ...; await active.save()` edi.
  // Prisma yozuvlari oddiy obyekt - `save()` yo'q, ochiq `update` kerak.
  const updated = await prisma.studentFreeze.update({
    where: { id: active.id },
    data: { endDate: end, endedById: by?.id || by?._id || null },
  });

  await afterFreezeChange(student.id);
  return withLegacyId(updated);
};

// Bitta o'quvchining muzlatish tarixi (yangi -> eski).
export const listForStudent = async (studentId, scope = null) => {
  const student = await ensureStudent(studentId, scope);
  const items = await prisma.studentFreeze.findMany({
    where: { studentId: student.id, isDeleted: false },
    orderBy: { startDate: "desc" },
    // Mongoose `.populate("createdBy", {...})` bilan bir xil shakl:
    // relation nomi ikkalasida ham `createdBy` / `endedBy`.
    include: {
      createdBy: { select: { id: true, firstName: true, lastName: true } },
      endedBy: { select: { id: true, firstName: true, lastName: true } },
    },
  });
  return { items: withLegacyIds(items) };
};

// Bitta o'quvchining HOZIRGI (ochiq) muzlatishi yoki null.
export const getActiveFreeze = async (studentId) => {
  const row = await prisma.studentFreeze.findFirst({
    where: { studentId: String(studentId), endDate: null, isDeleted: false },
    select: { id: true, studentId: true, startDate: true, reason: true, createdAt: true },
  });
  return row ? withLegacyId(row) : null;
};

// HOZIR muzlatilgan barcha o'quvchilarning id'lari (ro'yxat filtri uchun).
//
// Mongoose `.distinct("student")` → Prisma `distinct` + `select`.
// `distinct` qatorlarni qaytaradi, maydonni emas - shuning uchun `map`.
export const getActiveFrozenStudentIds = async () => {
  const rows = await prisma.studentFreeze.findMany({
    where: { endDate: null, isDeleted: false },
    select: { studentId: true },
    distinct: ["studentId"],
  });
  return rows.map((r) => r.studentId);
};

// Ro'yxatni boyitish uchun: berilgan o'quvchilardan qaysilari HOZIR muzlatilgan.
// Map(studentId -> { startDate, reason }).
export const getActiveFreezeMap = async (studentIds) => {
  if (!studentIds || studentIds.length === 0) return new Map();
  const rows = await prisma.studentFreeze.findMany({
    where: {
      studentId: { in: studentIds.map(String) },
      endDate: null,
      isDeleted: false,
    },
    select: { studentId: true, startDate: true, reason: true },
  });
  const map = new Map();
  for (const r of rows) map.set(String(r.studentId), r);
  return map;
};
