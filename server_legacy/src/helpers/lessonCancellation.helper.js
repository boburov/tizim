import prisma from "../config/prisma.js";

// BEKOR QILINGAN DARSLARNI HISOBGA OLISH.
//
// Ikki joyda BIR XIL ishlatilishi kerak:
//   1. o'quvchi to'lovi  (studentPayment.service - loadMonthLessonDates)
//   2. o'qituvchi soatbay maoshi (variableBase.helper - computeLessonHours)
// Aks holda o'quvchi to'lamagan dars uchun o'qituvchiga haq to'lanardi
// (yoki teskarisi) - ikkalasi bitta manbadan o'qishi shart.

/**
 * Oraliqdagi bekor qilingan (va KO'CHIRILMAGAN) darslar kalitlari.
 *
 * billable=true bo'lgan yozuvlar QAYTARILMAYDI: ular ko'chirilgan (makeup)
 * darslar, ya'ni dars baribir o'tiladi va pul o'zgarmasligi kerak.
 *
 * @returns {Promise<Set<string>>} "YYYY-MM-DD" yoki "YYYY-MM-DD|slot" kalitlari
 */
export const loadCancelledLessonKeys = async (groupId, from, to) => {
  if (!groupId) return new Set();
  // PRISMA: `group` → `groupId` (ustun), `$gte/$lte` → `gte/lte`,
  // `billable: { $ne: true }` → `billable: false` (ustunda `@default(false)`,
  // NULL holat yo'q).
  const rows = await prisma.lessonCancellation.findMany({
    where: {
      groupId: String(groupId),
      date: { gte: from, lte: to },
      billable: false,
      isDeleted: false,
    },
    select: { dateKey: true, slot: true },
  });

  const set = new Set();
  for (const r of rows) {
    // slot="" → o'sha kunning BARCHA darslari bekor.
    set.add(r.slot ? `${r.dateKey}|${r.slot}` : r.dateKey);
  }
  return set;
};

/**
 * getClassDaysInRange qaytargan sessiya bekor qilinganmi.
 *
 * Ikki kalit tekshiriladi: butun kun (slotsiz) VA aniq slot - chunki
 * "shu kun umuman dars yo'q" va "shu kunning 14:00 darsi yo'q" ikkala
 * holat ham qo'llab-quvvatlanadi.
 */
export const isCancelledSession = (cancelledSet, session) => {
  if (!cancelledSet || cancelledSet.size === 0) return false;
  if (cancelledSet.has(session.dateKey)) return true;
  return Boolean(session.slot) && cancelledSet.has(`${session.dateKey}|${session.slot}`);
};
