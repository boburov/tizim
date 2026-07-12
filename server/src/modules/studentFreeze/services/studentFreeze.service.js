import StudentFreeze from "../../../models/studentFreeze.model.js";
import User from "../../../models/user.model.js";
import ApiError from "../../../utils/ApiError.js";
import { ROLES } from "../../../constants/roles.js";
import {
  toUtcMidnight,
  localTodayMidnight,
} from "../../../helpers/attendance.helper.js";
import { correlationCacheInvalidate } from "../../../helpers/correlationCache.js";
import * as financePaymentService from "../../finance/services/studentPayment.service.js";
import logger from "../../../config/logger.js";

const ensureStudent = async (studentId) => {
  const u = await User.findById(studentId);
  if (!u || u.role !== ROLES.STUDENT) {
    throw new ApiError(404, "O'quvchi topilmadi");
  }
  return u;
};

// Ochiq (hozir amaldagi) muzlatishni qaytaradi yoki null.
const findActiveFreeze = (studentId) =>
  StudentFreeze.findOne({
    student: studentId,
    endDate: null,
    isDeleted: { $ne: true },
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
export const freeze = async (studentId, { startDate, reason, by } = {}) => {
  const student = await ensureStudent(studentId);
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

  const created = await StudentFreeze.create({
    student: studentId,
    startDate: start,
    endDate: null,
    reason: reason || "",
    createdBy: by?._id || null,
  });

  await afterFreezeChange(studentId);
  return created;
};

// O'quvchini muzlatishdan chiqarish. endDate berilmasa - bugun (EXCLUSIVE:
// shu kundan boshlab o'quvchi yana faol). Kelajak/boshlanishidan oldin bo'lmaydi.
export const unfreeze = async (studentId, { endDate, by } = {}) => {
  await ensureStudent(studentId);

  const active = await findActiveFreeze(studentId);
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

  active.endDate = end;
  active.endedBy = by?._id || null;
  await active.save();

  await afterFreezeChange(studentId);
  return active;
};

// Bitta o'quvchining muzlatish tarixi (yangi -> eski).
export const listForStudent = async (studentId) => {
  await ensureStudent(studentId);
  const items = await StudentFreeze.find({
    student: studentId,
    isDeleted: { $ne: true },
  })
    .sort({ startDate: -1 })
    .populate("createdBy", { firstName: 1, lastName: 1 })
    .populate("endedBy", { firstName: 1, lastName: 1 });
  return { items };
};

// Bitta o'quvchining HOZIRGI (ochiq) muzlatishi yoki null.
export const getActiveFreeze = (studentId) =>
  StudentFreeze.findOne({
    student: studentId,
    endDate: null,
    isDeleted: { $ne: true },
  })
    .select("student startDate reason createdAt")
    .lean();

// HOZIR muzlatilgan barcha o'quvchilarning id'lari (ro'yxat filtri uchun).
export const getActiveFrozenStudentIds = () =>
  StudentFreeze.find({ endDate: null, isDeleted: { $ne: true } }).distinct(
    "student",
  );

// Ro'yxatni boyitish uchun: berilgan o'quvchilardan qaysilari HOZIR muzlatilgan.
// Map(studentId -> { startDate, reason }).
export const getActiveFreezeMap = async (studentIds) => {
  if (!studentIds || studentIds.length === 0) return new Map();
  const rows = await StudentFreeze.find({
    student: { $in: studentIds },
    endDate: null,
    isDeleted: { $ne: true },
  })
    .select("student startDate reason")
    .lean();
  const map = new Map();
  for (const r of rows) map.set(String(r.student), r);
  return map;
};
