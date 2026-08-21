import prisma from "../config/prisma.js";
import { ROLES } from "../constants/roles.js";
import { toUtcMidnight } from "./attendance.helper.js";
import logger from "../config/logger.js";

const db = (tx) => tx || prisma;

/**
 * O'quvchining "yakunlash sanasi" (completedAt) ni qayta hisoblaydi.
 *
 * MANBA USTUVORLIGI (o'zgarmadi):
 *   1) completedAtManual=true → qo'lda override, tegmaymiz.
 *   2) archivedAt bor        → completedAt = archivedAt.
 *   3) faol a'zolik bor      → null (hali o'qiyapti).
 *   4) faol a'zolik yo'q, lekin a'zoliklar bor → eng oxirgi leftAt.
 *   5) umuman a'zolik yo'q   → null.
 *
 * PRISMA ESLATMASI: soft-delete avtomatik filtrlanmaydi (Mongo'da ham
 * shunday edi - plugin faqat helper berardi), shuning uchun
 * `isDeleted: false` ochiq yozilgan.
 */
export const recomputeStudentCompletion = async (studentId, { tx } = {}) => {
  const client = db(tx);

  const user = await client.user.findUnique({
    where: { id: String(studentId) },
    select: {
      id: true,
      role: true,
      completedAt: true,
      completedAtManual: true,
      archivedAt: true,
    },
  });
  if (!user || user.role !== ROLES.STUDENT) return;
  if (user.completedAtManual) return;

  let completedAt = null;
  if (user.archivedAt) {
    completedAt = toUtcMidnight(user.archivedAt);
  } else {
    // FAOL a'zolik bormi - bitta so'rov yetadi (hammasini o'qish shart emas).
    const active = await client.groupMembership.findFirst({
      where: { studentId: user.id, isDeleted: false, leftAt: null },
      select: { id: true },
    });

    if (!active) {
      // Eng OXIRGI chiqish sanasi. Mongo'da hamma a'zolik o'qilib JS'da
      // reduce qilinardi; Postgres buni `orderBy` bilan o'zi qiladi.
      const lastLeft = await client.groupMembership.findFirst({
        where: { studentId: user.id, isDeleted: false, leftAt: { not: null } },
        select: { leftAt: true },
        orderBy: { leftAt: "desc" },
      });
      if (lastLeft?.leftAt) completedAt = toUtcMidnight(lastLeft.leftAt);
    }
  }

  const current = user.completedAt ? new Date(user.completedAt).getTime() : null;
  const next = completedAt ? completedAt.getTime() : null;
  if (current !== next) {
    await client.user.update({
      where: { id: user.id },
      data: { completedAt },
    });
  }
};

/** Xato bo'lsa ham asosiy oqim buzilmasligi uchun best-effort variant. */
export const safeRecomputeStudentCompletion = async (studentId, opts) => {
  try {
    await recomputeStudentCompletion(studentId, opts);
  } catch (err) {
    logger.warn({ err, studentId }, "completedAt qayta hisoblanmadi");
  }
};
