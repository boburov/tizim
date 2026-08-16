import prisma from "../../../config/prisma.js";
import {
  toUtcMidnight,
  getClassDaysInRange,
} from "../../../helpers/attendance.helper.js";
import { holidayKeySetForRange } from "../../holidays/services/holidays.service.js";
import {
  loadCancelledLessonKeys,
  isCancelledSession,
} from "../../../helpers/lessonCancellation.helper.js";

// O'ZGARUVCHI MAOSH BAZALARI: har bir kanal uchun "nimaga ko'paytiriladi".
//
// Barcha bazalar SEGMENT oynasi bo'yicha hisoblanadi (oy emas) - stavka oy
// o'rtasida o'zgarsa har segment o'z bazasini oladi.
//
// ─────────────────────────────────────────────────────────────────
// MONGO → PRISMA: ARIFMETIKA O'ZGARMADI
//
// Bu fayldagi hisob-kitob (kunlar/oy ulushi, daqiqalar, yig'indilar)
// TO'LIQ o'zgarishsiz qoldi - faqat ma'lumot olish usuli almashdi:
//
//   GroupMembership.find({ group })  → findMany({ where: { groupId } })
//   .aggregate([{ $group: $sum }])   → aggregate({ _sum: {...} })
//
// PUL TURI: sxemadagi barcha summa ustunlari `Float` (Mongo'da ham
// `float64` edi), ya'ni Prisma oddiy JS `number` qaytaradi. Hech qanday
// Decimal/BigInt konvertatsiyasi YO'Q va natija bit-bit bir xil.
// (Decimal(14,2) ga o'tish alohida ish - qarang MIGRATION.md §4.)
// ─────────────────────────────────────────────────────────────────

const DAY = 24 * 60 * 60 * 1000;

// Guruh hujjatining kaliti. `groupDoc` chaqiruvchidan keladi: ko'chirilgan
// servis Prisma obyektini (`id`), ko'chirilmagani esa hali `_id` beradi.
const groupIdOf = (g) => g?.id ?? g?._id ?? null;

const daysInMonth = (year, month) => new Date(Date.UTC(year, month, 0)).getUTCDate();

// Ikki yarim-ochiq oraliq kesishmasi (ms) - kunlar soni.
const overlapDays = (aStart, aEndExcl, bStart, bEndExcl) => {
  const s = Math.max(aStart, bStart);
  const e = Math.min(aEndExcl, bEndExcl);
  return e > s ? Math.round((e - s) / DAY) : 0;
};

/**
 * per_student bazasi: PRORATSIYALANGAN O'QUVCHI-OY ("student units").
 *
 * NEGA headcount EMAS: oyning oxirgi kunida qo'shilgan o'quvchi uchun to'liq
 * 50 000 so'm to'lash adolatsiz va manipulyatsiyaga ochiq bo'lardi (oy oxirida
 * o'quvchi qo'shib maoshni shishirish). Har o'quvchi guruhda o'tkazgan kunlari
 * ulushicha sanaladi: butun oy = 1.0, yarim oy = 0.5.
 *
 * Chiqib ketgan (leftAt) o'quvchi ham o'zi bo'lgan kunlar uchun sanaladi -
 * o'qituvchi o'sha kunlar unga dars bergan.
 */
export const computeStudentUnits = async ({ group, year, month, segStart, segEndExcl }) => {
  const monthStart = Date.UTC(year, month - 1, 1);
  const monthEndExcl = Date.UTC(year, month, 1);
  const lo = Math.max(monthStart, segStart.getTime());
  const hi = Math.min(monthEndExcl, segEndExcl.getTime());
  if (hi <= lo) return { units: 0, headcount: 0 };

  const memberships = await prisma.groupMembership.findMany({
    where: {
      groupId: String(group),
      isDeleted: false,
      joinedAt: { lt: new Date(hi) },
      OR: [{ leftAt: null }, { leftAt: { gt: new Date(lo) } }],
    },
    select: { studentId: true, joinedAt: true, leftAt: true },
  });

  const total = daysInMonth(year, month);
  let units = 0;
  const students = new Set();
  for (const m of memberships) {
    const mStart = toUtcMidnight(m.joinedAt).getTime();
    // leftAt EXCLUSIVE - a'zolik va davomat bilan bir xil encoding.
    const mEndExcl = m.leftAt ? toUtcMidnight(m.leftAt).getTime() : Infinity;
    const days = overlapDays(lo, hi, mStart, mEndExcl);
    if (days <= 0) continue;
    units += days / total;
    students.add(String(m.studentId));
  }
  return { units, headcount: students.size };
};

/**
 * per_lesson_hour bazasi: segment oynasidagi DARS SOATLARI.
 *
 * Manba haqiqati - Group.schedule (versiyalangan) + Holiday. Davomat EMAS:
 * o'qituvchi dars o'tgani uchun haq oladi, o'quvchilar kelgani uchun emas.
 *
 * BEKOR QILINGAN darslar ham chiqariladi - va aynan O'QUVCHI TO'LOVI bilan
 * BIR XIL manbadan (lessonCancellation.helper). Ikki joyda ikki xil mantiq
 * bo'lsa: o'quvchi to'lamagan dars uchun o'qituvchiga haq to'lanib, markaz
 * har bekor qilingan darsda zarar ko'rardi.
 */
export const computeLessonHours = async ({ groupDoc, segStart, segEndExcl }) => {
  if (!groupDoc) return { hours: 0, lessons: 0 };
  const from = new Date(segStart);
  // getClassDaysInRange INKLYUZIV oxirgi kun bilan ishlaydi, segment esa
  // EKSKLYUZIV - shuning uchun bir kun ayiramiz.
  const to = new Date(segEndExcl.getTime() - DAY);
  if (to.getTime() < from.getTime()) return { hours: 0, lessons: 0 };

  // DIQQAT - `groupDoc.schedule`: Prisma'da jadval endi RELATION
  // (GroupScheduleItem[]). Chaqiruvchi uni ochiq `include` qilmasa
  // massiv bo'sh keladi va getClassDaysInRange() 0 dars qaytaradi -
  // ya'ni per_lesson_hour maoshi JIMGINA nolga tushardi.
  const [holidaySet, cancelledSet] = await Promise.all([
    holidayKeySetForRange(from, to),
    loadCancelledLessonKeys(groupIdOf(groupDoc), from, to),
  ]);
  const sessions = getClassDaysInRange(groupDoc, from, to, holidaySet).filter(
    (s) => !isCancelledSession(cancelledSet, s),
  );

  let minutes = 0;
  for (const s of sessions) {
    const [sh, sm] = s.startTime.split(":").map(Number);
    const [eh, em] = s.endTime.split(":").map(Number);
    minutes += eh * 60 + em - (sh * 60 + sm);
  }
  return { hours: minutes / 60, lessons: sessions.length };
};

/**
 * percent bazasi: guruh oylik tushumi.
 *   billed    - SUM(StudentPayment.expectedAmount) - hisoblangan (eski xulq-atvor).
 *               O'quvchi to'lamasa ham o'qituvchi oladi: risk 100% markazda.
 *   collected - SUM(PaymentTransaction.amount) - haqiqatda kassaga tushgan.
 *               Risk o'qituvchi bilan bo'linadi.
 *
 * DIQQAT: bu yerda FILIAL filtri ATAYLAB yo'q - guruh ID'si bo'yicha
 * qidirilmoqda va guruh bitta filialga tegishli (Group.branchId), demak
 * natija allaqachon filial ichida.
 */
export const computeGroupRevenueBase = async (group, year, month, base = "billed") => {
  const scope = { groupId: String(group), year, month };

  if (base === "collected") {
    // PaymentTransaction'da `isDeleted` HAQIQATAN bor - bekor qilingan
    // to'lov tushumdan chiqarilishi shart.
    const agg = await prisma.paymentTransaction.aggregate({
      where: { ...scope, isDeleted: false },
      _sum: { amount: true },
    });
    // Qator topilmasa Prisma `null` beradi (Mongo bo'sh massiv berardi) -
    // ikkalasida ham natija 0.
    return agg._sum.amount ?? 0;
  }

  // `isDeleted` ATAYLAB YO'Q: StudentPayment'da bunday ustun umuman
  // mavjud emas (prisma/schema.prisma) va Mongoose modelida ham
  // softDelete plagini yo'q edi - ya'ni eski `{ $ne: true }` sharti
  // HAMMA qatorga to'g'ri kelardi. Bu yerga `isDeleted: false` yozish
  // Prisma'da xato berardi, filtrni "tuzatib" qo'yish esa hisoblangan
  // tushumni o'zgartirib yuborardi.
  const agg = await prisma.studentPayment.aggregate({
    where: scope,
    _sum: { expectedAmount: true },
  });
  return agg._sum.expectedAmount ?? 0;
};

/** Segment oy ichida qancha ulush egallaydi (per_group / percent proratsiyasi uchun). */
export const segmentFactor = ({ year, month, segStart, segEndExcl }) => {
  const monthStart = Date.UTC(year, month - 1, 1);
  const monthEndExcl = Date.UTC(year, month, 1);
  const days = overlapDays(
    monthStart,
    monthEndExcl,
    segStart.getTime(),
    segEndExcl.getTime(),
  );
  const total = daysInMonth(year, month);
  return { factor: total > 0 ? days / total : 0, days, totalDays: total };
};
