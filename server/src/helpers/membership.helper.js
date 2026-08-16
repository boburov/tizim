import prisma from "../config/prisma.js";
import ApiError from "../utils/ApiError.js";

// ─────────────────────────────────────────────────────────────────
// MONGO → PRISMA MOSLIK ESLATMASI
//
// Mongoose'da bog'lanish maydonlari `student` / `group` deb atalardi va
// ichida ObjectId turardi. Prisma'da ular `studentId` / `groupId` —
// obyekt (`student` / `group`) esa relation. Bu farq jimgina noto'g'ri
// natija berishi mumkin edi: `where: { student: id }` Prisma'da xato
// bermaydi, u shunchaki `student` relation'i bo'yicha filtr izlaydi.
// Shuning uchun har bir shart ochiq `...Id` bilan yozilgan.
//
// `session` → `tx`: Mongoose sessiyasi o'rniga Prisma tranzaksiya
// klienti uzatiladi. Berilmasa oddiy klient ishlatiladi, ya'ni
// chaqiruvchilarning imzosi o'zgarmadi.
// ─────────────────────────────────────────────────────────────────

const db = (tx) => tx || prisma;

/**
 * O'quvchining FAOL (leftAt=null) guruh a'zoligi bormi.
 *
 * `isDeleted` filtri SHART: soft-delete qilingan a'zolik "faol" deb
 * sanalmasligi kerak - aks holda o'chirilgan o'quvchi tekshiruvdan
 * o'tib ketardi.
 */
export const hasActiveGroup = async (studentId, tx) => {
  const found = await db(tx).groupMembership.findFirst({
    where: { studentId: String(studentId), leftAt: null, isDeleted: false },
    select: { id: true },
  });
  return Boolean(found);
};

/** O'quvchi AYNAN shu guruhda faolmi (leftAt=null). */
export const isActiveInGroup = async (studentId, groupId, tx) => {
  const found = await db(tx).groupMembership.findFirst({
    where: {
      studentId: String(studentId),
      groupId: String(groupId),
      leftAt: null,
      isDeleted: false,
    },
    select: { id: true },
  });
  return Boolean(found);
};

/** Faol guruh bo'lmasa amalni rad etadi (to'lov, chegirma, ozod davri...). */
export const ensureActiveGroup = async (studentId, tx) => {
  if (!(await hasActiveGroup(studentId, tx))) {
    throw new ApiError(
      400,
      "O'quvchi hech qaysi guruhda emas. Avval o'quvchini guruhga qo'shing.",
    );
  }
};

/**
 * O'qituvchi shu o'quvchiga ega bo'lgan guruhlardan biriga biriktirilganmi.
 *
 * O'quvchi o'qituvchining guruhlaridan birida a'zo bo'lishi YETARLI -
 * leftAt bo'lgani (tarixiy a'zolik) ham hisobga olinadi, chunki ozod
 * davri tarixiy a'zolik uchun ham tuzilishi mumkin.
 *
 * Boshqa rollar (owner) bu tekshiruvni umuman ishlatmaydi.
 *
 * PRISMA: `Group.teachers` ko'p-ko'pga bog'lanish, shuning uchun
 * `teachers: { some: { id } }` - Mongo'dagi `{ teachers: teacherId }`
 * massiv ichidan qidirishning ekvivalenti.
 */
export const ensureTeacherOwnsStudent = async (teacherId, studentId) => {
  const membership = await prisma.groupMembership.findFirst({
    where: {
      studentId: String(studentId),
      isDeleted: false,
      group: { teachers: { some: { id: String(teacherId) } } },
    },
    select: { id: true },
  });

  if (!membership) {
    throw new ApiError(403, "Bu o'quvchi sizning guruhlaringizda emas");
  }
};
