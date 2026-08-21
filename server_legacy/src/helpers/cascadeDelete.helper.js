// Cascade "haqiqiy o'chirish" (soft) - o'chirilganda ota + bog'liq yozuvlar isDeleted=true bo'ladi.
// Arxiv (isActive) dan FARQLI: bular UI'dan butunlay yashiriladi va barcha hisob-kitobdan chiqariladi.
//
// MONGO → PRISMA: `updateMany({ student: id }, { $set: {...} })` →
// `updateMany({ where: { studentId: id }, data: {...} })`. Maydon nomlari
// relation'dan ustunga ko'chdi (`student` → `studentId`), aks holda Prisma
// shartni relation filtri deb o'qib, BOSHQA natija berardi.
import prisma from "../config/prisma.js";
import { ROLES } from "../constants/roles.js";
import ApiError from "../utils/ApiError.js";

const mark = (deleted, by) =>
  deleted
    ? { isDeleted: true, deletedAt: new Date(), deletedBy: by || null }
    : { isDeleted: false, deletedAt: null, deletedBy: null };

// `by` chaqiruvchidan hujjat sifatida ham kelishi mumkin (req.user).
// `deletedBy` esa oddiy satr ustun - normallashtiramiz.
const toId = (v) => {
  if (!v) return null;
  if (typeof v === "string") return v;
  return v.id ? String(v.id) : v._id ? String(v._id) : null;
};

// ─────────────────────────────────────────────────────────────────
// `StudentPayment` VA `TeacherSalary` BU YERDA YO'Q - ATAYLAB.
//
// Eski Mongoose kodi ularga ham `$set: { isDeleted: true }` yozardi,
// LEKIN bu qatorlar hech qachon HECH NIMA QILMAGAN: ikkala modelda
// softDelete plagini umuman yo'q edi (o'sha fayllardagi izoh buni
// ochiq aytadi: "O'chirilmaydi (softDelete yo'q)"), Mongoose esa
// sxemada bo'lmagan maydonni jimgina tashlab yuborardi.
//
// Ya'ni kod "moliya yozuvlari ham yashiriladi" degan taassurot
// berardi, amalda esa yashirmasdi. Postgres bunday yozuvni jimgina
// yutmaydi - ustun yo'q bo'lsa xato beradi. Shuning uchun chaqiruv
// olib tashlandi.
//
// XULQ-ATVOR O'ZGARMADI: bu yozuvlar ilgari ham belgilanmasdi.
// Ular boshqacha yo'l bilan hisobdan chiqadi - to'lov/maosh qatorlari
// a'zolik va davrlardan QAYTA HISOBLANADI (recalc), ya'ni o'quvchi
// yoki guruh o'chirilgach summalar o'zi nolga tushadi.
//
// `PaymentTransaction` va `SalaryTransaction` esa QOLDI - ularda
// `isDeleted` ustuni haqiqatan bor (prisma/schema.prisma).
// ─────────────────────────────────────────────────────────────────

const setStudentRelated = (studentId, deleted, by) => {
  const data = mark(deleted, toId(by));
  const where = { studentId: String(studentId) };
  return Promise.all([
    prisma.groupMembership.updateMany({ where, data }),
    prisma.attendance.updateMany({ where, data }),
    prisma.attendanceExemption.updateMany({ where, data }),
    prisma.paymentTransaction.updateMany({ where, data }),
  ]);
};

const setTeacherRelated = (teacherId, deleted, by) => {
  const data = mark(deleted, toId(by));
  const where = { teacherId: String(teacherId) };
  return Promise.all([
    prisma.teacherAttendance.updateMany({ where, data }),
    prisma.teacherAbsence.updateMany({ where, data }),
    prisma.salaryTransaction.updateMany({ where, data }),
  ]);
};

const setGroupRelated = async (groupId, deleted, by) => {
  const data = mark(deleted, toId(by));
  const where = { groupId: String(groupId) };
  await Promise.all([
    prisma.groupMembership.updateMany({ where, data }),
    prisma.attendance.updateMany({ where, data }),
    prisma.teacherAbsence.updateMany({ where, data }),
    prisma.paymentTransaction.updateMany({ where, data }),
    prisma.salaryTransaction.updateMany({ where, data }),
  ]);
};

// ─── User (role bo'yicha) ───
export const deleteUser = async (user, by) => {
  if (user.role === ROLES.OWNER) {
    throw new ApiError(403, "Owner foydalanuvchini o'chirib bo'lmaydi");
  }
  const id = toId(user);
  await prisma.user.update({ where: { id }, data: mark(true, toId(by)) });
  if (user.role === ROLES.TEACHER) await setTeacherRelated(id, true, by);
  else await setStudentRelated(id, true, by);
};

export const restoreUser = async (user) => {
  const id = toId(user);
  await prisma.user.update({ where: { id }, data: mark(false) });
  if (user.role === ROLES.TEACHER) await setTeacherRelated(id, false);
  else await setStudentRelated(id, false);
};

// ─── Group ───
export const deleteGroup = async (groupId, by) => {
  await prisma.group.update({
    where: { id: String(groupId) },
    data: mark(true, toId(by)),
  });
  await setGroupRelated(groupId, true, by);
};

export const restoreGroup = async (groupId) => {
  await prisma.group.update({
    where: { id: String(groupId) },
    data: mark(false),
  });
  await setGroupRelated(groupId, false);
};
