import prisma from "../../../config/prisma.js";
import ApiError from "../../../utils/ApiError.js";
import { ROLES } from "../../../constants/roles.js";
import { withLegacyId, withLegacyIds } from "../../../utils/serialize.js";
import {
  ensureActiveGroup,
  ensureTeacherOwnsStudent,
} from "../../../helpers/membership.helper.js";
import { correlationCacheInvalidate } from "../../../helpers/correlationCache.js";

// DAVOMATDAN OZOD DAVRLARI.
//
// ═══════════════════════════════════════════════════════════════════
// MAYDON NOMI: `student` -> `studentId`
//
// Mongo'da bu ObjectId ref bo'lib `student` deb atalardi; Prisma'da
// skalyar ustun `studentId`, `student` esa RELATION. `{ student: id }`
// deb yozilsa Prisma uni relation filtri deb o'qiydi va butunlay
// boshqa ma'no chiqadi.
//
// KLIENT SHARTNOMASI O'ZGARMAYDI: forma hamon `{ student }` yuboradi
// (ExemptionCreateModal), shuning uchun kirishda `body.student`
// o'qiladi va servis ichida `studentId` ga aylantiriladi.
// ═══════════════════════════════════════════════════════════════════

const ensureStudent = async (studentId) => {
  const u = await prisma.user.findUnique({
    where: { id: String(studentId) },
    select: { id: true, role: true },
  });
  if (!u || u.role !== ROLES.STUDENT) {
    throw new ApiError(400, "O'quvchi topilmadi");
  }
  return u;
};

export const list = async (
  { studentId, isActive, page = 1, limit = 50 },
  currentUser,
) => {
  // O'qituvchi faqat o'z guruhidagi o'quvchining ozod davrlarini ko'ra oladi.
  // Shuning uchun studentId majburiy va shu o'quvchi unga tegishli bo'lishi shart.
  if (currentUser?.role === ROLES.TEACHER) {
    if (!studentId) {
      throw new ApiError(400, "O'quvchi tanlanmagan");
    }
    await ensureTeacherOwnsStudent(currentUser._id, studentId);
  }

  const where = { isDeleted: false };
  if (studentId) where.studentId = String(studentId);
  if (isActive !== undefined) where.isActive = !!isActive;

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    prisma.attendanceExemption.findMany({
      where,
      orderBy: { startDate: "desc" },
      skip,
      take: limit,
      // Mongo `.populate("createdBy", {firstName, lastName})` o'rni.
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
    prisma.attendanceExemption.count({ where }),
  ]);

  return { items: withLegacyIds(items), total, page, limit };
};

export const create = async (body, currentUser) => {
  await ensureStudent(body.student);
  // O'qituvchi faqat o'z guruhidagi o'quvchini ozod qila oladi.
  if (currentUser?.role === ROLES.TEACHER) {
    await ensureTeacherOwnsStudent(currentUser._id, body.student);
  }
  await ensureActiveGroup(body.student);

  const startDate = new Date(body.startDate);
  const endDate = body.endDate ? new Date(body.endDate) : null;

  // Bu tekshiruv bazadagi `attendance_exemptions_range_check` bilan
  // BIR XIL qoidani ifodalaydi. Ikkalasi ham kerak: CHECK oxirgi
  // himoya (import/seed HTTP validatsiyasini chetlab o'tadi), bu esa
  // foydalanuvchiga TUSHUNARLI xabar beradi.
  if (endDate && startDate > endDate) {
    throw new ApiError(400, "Tugash sanasi boshlanishidan keyin bo'lishi kerak");
  }

  const created = await prisma.attendanceExemption.create({
    data: {
      studentId: String(body.student),
      startDate,
      endDate,
      daysOfWeek: Array.isArray(body.daysOfWeek) ? body.daysOfWeek : [],
      reason: body.reason || "",
      isActive: body.isActive !== undefined ? !!body.isActive : true,
      createdById: currentUser?._id ? String(currentUser._id) : null,
    },
  });

  // Imtiyoz davomat foiziga ta'sir qiladi → korrelatsiya keshini tozalaymiz
  correlationCacheInvalidate();
  return withLegacyId(created);
};

export const getById = async (id) => {
  const doc = await prisma.attendanceExemption.findFirst({
    where: { id: String(id), isDeleted: false },
  });
  if (!doc) throw new ApiError(404, "Davomatdan ozod davri topilmadi");
  return doc;
};

export const update = async (id, body, currentUser) => {
  const doc = await getById(id);
  // O'qituvchi faqat o'z guruhidagi o'quvchining ozod davrini tahrirlay oladi.
  if (currentUser?.role === ROLES.TEACHER) {
    await ensureTeacherOwnsStudent(currentUser._id, doc.studentId);
  }

  // MONGO'DA BU `doc.save()` EDI: hujjat o'zgartirilib, keyin butunlay
  // qayta yozilardi. Prisma'da faqat BERILGAN maydonlar yangilanadi,
  // shuning uchun tekshiruv uchun "keyingi holat" alohida hisoblanadi -
  // aks holda faqat `endDate` o'zgartirilganda uni ESKI `startDate`
  // bilan solishtirish kerakligi ko'zdan qochardi.
  const data = {};
  if (body.startDate !== undefined) data.startDate = new Date(body.startDate);
  if (body.endDate !== undefined) {
    data.endDate = body.endDate ? new Date(body.endDate) : null;
  }
  if (body.daysOfWeek !== undefined) {
    data.daysOfWeek = Array.isArray(body.daysOfWeek) ? body.daysOfWeek : [];
  }
  if (body.reason !== undefined) data.reason = body.reason;
  if (body.isActive !== undefined) data.isActive = !!body.isActive;

  const nextStart = data.startDate ?? doc.startDate;
  const nextEnd = data.endDate !== undefined ? data.endDate : doc.endDate;
  if (nextEnd && nextStart > nextEnd) {
    throw new ApiError(400, "Tugash sanasi boshlanishidan keyin bo'lishi kerak");
  }

  const updated = await prisma.attendanceExemption.update({
    where: { id: doc.id },
    data,
  });
  correlationCacheInvalidate();
  return withLegacyId(updated);
};

export const remove = async (id, currentUser) => {
  const doc = await getById(id);
  // O'qituvchi faqat o'z guruhidagi o'quvchining ozod davrini o'chira oladi.
  if (currentUser?.role === ROLES.TEACHER) {
    await ensureTeacherOwnsStudent(currentUser._id, doc.studentId);
  }

  // Mongoose plugin'idagi `softDelete()` o'rniga ochiq yozamiz -
  // plugin Prisma'da yo'q.
  const removed = await prisma.attendanceExemption.update({
    where: { id: doc.id },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: currentUser?._id ? String(currentUser._id) : null,
    },
  });
  correlationCacheInvalidate();
  return withLegacyId(removed);
};
