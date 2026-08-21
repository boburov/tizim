import prisma from "../../../config/prisma.js";
import { toUtcMidnight } from "../../../helpers/attendance.helper.js";

// STAVKA ANIQLASH (rate resolution).
//
// Bir oy ichida stavka IKKI sababdan o'zgarishi mumkin:
//   1. o'qituvchi guruhdagi davri (TeacherGroupPeriod) almashdi,
//   2. o'qituvchining STANDART stavkasi (TeacherCompensation) oshirildi.
// Ikkalasi ham sana-amalli, shuning uchun oy KESISHMALARGA (segment) bo'linadi
// va har segment o'z stavkasi bilan alohida proratsiya qilinadi. Aks holda
// 15-martda oylik oshirilsa, butun mart yangi stavkada hisoblanib ketardi.
//
// USTUNLIK TARTIBI (har segment uchun):
//   1. TeacherGroupPeriod.variableType  → "bu guruhda boshqacha kelishdik"
//   2. TeacherGroupPeriod.salaryType    → LEGACY maydon (eski yozuvlar)
//   3. TeacherCompensation.variableType → o'qituvchi STANDART stavkasi
//   4. hech biri                        → 0 (va ogohlantirish)

const DAY = 24 * 60 * 60 * 1000;

// Normallashtirilgan stavka: barcha "kanal"lar bir joyda. Bitta tur o'rniga
// kanallar to'plami saqlanadi, chunki LEGACY "mixed" bir vaqtda ikki kanalni
// (guruh fiksasi + foiz) yoqadi - bitta enum bilan ifodalab bo'lmaydi.
const emptyRate = () => ({
  perGroup: 0,
  percentRate: 0,
  percentBase: "billed",
  perStudent: 0,
  perHour: 0,
  source: "none",
  variableType: null,
  variableRate: 0,
  compensationId: null,
});

// Yangi (variableType) shaklidagi stavkani kanallarga yoyadi.
const applyVariable = (rate, type, value, percentBase) => {
  const v = Number(value) || 0;
  switch (type) {
    case "percent":
      rate.percentRate = v;
      rate.percentBase = percentBase || "billed";
      break;
    case "per_student":
      rate.perStudent = v;
      break;
    case "per_lesson_hour":
      rate.perHour = v;
      break;
    case "per_group":
      rate.perGroup = v;
      break;
    default:
      break; // "none" yoki noma'lum - kanal yoqilmaydi
  }
  rate.variableType = type;
  rate.variableRate = v;
  return rate;
};

// LEGACY (salaryType/fixedAmount/percentRate) → kanallar.
// MUHIM TARJIMA: eski "fixed" GURUH uchun qat'iy summa degani edi (o'qituvchi
// 3 guruhda ishlasa 3 barobar olardi). Yangi modeldagi markaz darajasidagi
// fiksa oylik BU EMAS. Shuning uchun eski "fixed" → per_group ga tarjima
// qilinadi: mavjud yozuvlarning puli TIYINIGA QADAR o'zgarmaydi.
const applyLegacy = (rate, period) => {
  const type = period.salaryType;
  const fixed = Number(period.fixedAmount) || 0;
  const pct = Number(period.percentRate) || 0;
  if (type === "fixed" || type === "mixed") rate.perGroup = fixed;
  if (type === "percent" || type === "mixed") {
    rate.percentRate = pct;
    rate.percentBase = "billed"; // eski xulq-atvor: hisoblangan bo'yicha
  }
  rate.variableType = type === "fixed" ? "per_group" : type === "percent" ? "percent" : "per_group";
  rate.variableRate = type === "percent" ? pct : fixed;
  rate.source = "period_legacy";
  return rate;
};

const hasOwnRate = (period) =>
  period?.variableType != null || period?.salaryType != null;

// Stavka hujjatining kaliti. Prisma `id` beradi; `_id` esa migratsiya
// davomida qolgan chaqiruvchilar uchun. Bu qiymat maosh qatoriga audit
// havolasi bo'lib yoziladi, shuning uchun jimgina `undefined` bo'lishiga
// yo'l qo'yib bo'lmaydi.
const compIdOf = (comp) => comp?.id ?? comp?._id ?? null;

// Stavkalar tartibi - `claimedUntil` klampi SHU tartibga tayanadi.
//
// `effectiveFrom` teng bo'lgan ikki stavka bo'lsa kesishgan kunlarni
// BIRINCHISI oladi. Tartib aniq bo'lmasa bir xil oy ikki xil summaga
// hisoblanishi mumkin edi, shuning uchun teng holatda `createdAt`
// (avval kiritilgani yutadi) ikkinchi mezon sifatida qo'shilgan.
// `compensationsForRange` ham bazadan aynan shu tartibda o'qiydi.
const byEffectiveFrom = (a, b) =>
  toUtcMidnight(a.effectiveFrom).getTime() -
    toUtcMidnight(b.effectiveFrom).getTime() ||
  new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();

// Stavka hisobiga KERAK bo'lgan ustunlar - bitta manba.
// `id` ATAYLAB bor: u TeacherSalary.compensationId ga audit havolasi
// sifatida yoziladi (qarang segmentPeriod / baseSegmentsForMonth).
const COMPENSATION_FIELDS = {
  id: true,
  branchId: true,
  effectiveFrom: true,
  effectiveTo: true,
  baseType: true,
  baseAmount: true,
  variableType: true,
  variableRate: true,
  percentBase: true,
};

/**
 * O'qituvchining berilgan oraliqda amal qilgan STANDART stavkalari.
 * effectiveTo EXCLUSIVE (TeacherGroupPeriod.endDate bilan bir xil).
 *
 * PRISMA: `teacher` → `teacherId` (Prisma'da `teacher` bu RELATION, ustun
 * emas - eski nomni qoldirish xato bermay, boshqa ma'noga o'tib ketardi).
 * Oraliq sharti AYNAN o'sha: [effectiveFrom, effectiveTo) oynasi
 * [from, to) bilan kesishsa - qatnashadi.
 */
export const compensationsForRange = async (teacher, from, to) => {
  const rows = await prisma.teacherCompensation.findMany({
    where: {
      teacherId: String(teacher),
      isDeleted: false,
      effectiveFrom: { lt: to },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: from } }],
    },
    select: { ...COMPENSATION_FIELDS, createdAt: true },
    // TARTIB ANIQ BO'LISHI SHART - `effectiveFrom` YETARLI EMAS.
    //
    // Ikki stavka bir xil `effectiveFrom` bilan tursa (assertNoOverlap
    // buni to'sishi kerak, lekin qo'riqchi qo'yilishidan oldingi
    // ma'lumot bazada qolgan bo'lishi mumkin), pastdagi `claimedUntil`
    // klampi kesishgan kunlarni BIRINCHI kelgan qatorga beradi.
    //
    // Mongo kolleksiyani tabiiy tartibda skanerlagani uchun natija
    // tasodifan barqaror edi. Postgres bunday kafolat BERMAYDI: bir xil
    // `effectiveFrom` da qatorlar ixtiyoriy tartibda kelishi mumkin va
    // O'SHA OY IKKI XIL SUMMAGA qayta hisoblanishi mumkin edi.
    //
    // `createdAt` qo'shilishi "avval kiritilgani yutadi" degan qoidani
    // ochiq belgilaydi - Mongo'dagi amaldagi xatti-harakat bilan bir xil.
    orderBy: [{ effectiveFrom: "asc" }, { createdAt: "asc" }],
  });
  return rows;
};

/**
 * Bir a'zolik/dars davrini stavka SEGMENTLARIGA bo'ladi.
 *
 * Davrning o'z stavkasi bo'lsa - bo'linish shart emas (bitta segment).
 * Bo'lmasa - standart stavka (compensation) oynalari bo'yicha kesiladi.
 *
 * @returns {Array<{start: Date, endExcl: Date|null, rate: object}>}
 */
export const segmentPeriod = (period, compensations, windowStart, windowEndExcl) => {
  const pStart = Math.max(
    toUtcMidnight(period.startDate).getTime(),
    windowStart.getTime(),
  );
  const pEndExcl = Math.min(
    period.endDate ? toUtcMidnight(period.endDate).getTime() : Infinity,
    windowEndExcl.getTime(),
  );
  if (pStart >= pEndExcl) return [];

  // Davr o'z stavkasiga ega → standart stavka umuman qaralmaydi.
  if (hasOwnRate(period)) {
    const rate = emptyRate();
    if (period.variableType != null) {
      applyVariable(rate, period.variableType, period.variableRate, period.percentBase);
      rate.source = "period";
    } else {
      applyLegacy(rate, period);
    }
    return [{ start: new Date(pStart), endExcl: new Date(pEndExcl), rate }];
  }

  // Standart stavka oynalari bo'yicha kesamiz.
  //
  // IKKI MARTA SANASHDAN HIMOYA (ikkinchi qatlam):
  // servis qatlamida kesishuv taqiqlangan (assertNoOverlap), lekin qo'riqchi
  // qo'yilishidan OLDIN yaratilgan buzuq ma'lumot bazada qolgan bo'lishi
  // mumkin. Kesishgan stavkalar segmentlarga aylansa, bir kun IKKI marta
  // to'lanardi - 2 mln oylik 4 mln bo'lib chiqardi.
  //
  // Yechim: stavkalar sana bo'yicha tartiblanadi va har biri ALLAQACHON
  // egallangan eng katta nuqtadan keyin boshlanadi. Ya'ni kesishgan qismni
  // ERTAROQ boshlangan stavka oladi, keyingisi faqat qolgan qismini.
  const sortedComps = [...compensations].sort(byEffectiveFrom);

  const segments = [];
  let claimedUntil = -Infinity; // shu nuqtagacha kunlar allaqachon berilgan
  for (const comp of sortedComps) {
    const cStart = toUtcMidnight(comp.effectiveFrom).getTime();
    const cEndExcl = comp.effectiveTo
      ? toUtcMidnight(comp.effectiveTo).getTime()
      : Infinity;
    const s = Math.max(pStart, cStart, claimedUntil);
    const e = Math.min(pEndExcl, cEndExcl);
    if (s >= e) continue;
    claimedUntil = e;

    const rate = emptyRate();
    applyVariable(rate, comp.variableType, comp.variableRate, comp.percentBase);
    rate.source = "compensation";
    // `comp.id` (Prisma) - `comp._id` esa faqat eski chaqiruvchi qolgan
    // bo'lsa. Faqat `_id` ga tayanish JIMGINA `undefined` berardi va
    // TeacherSalary.compensationId (nullable) NULL bo'lib yozilardi:
    // maosh to'g'ri chiqardi-yu, "qaysi shartnomadan" izi yo'qolardi.
    rate.compensationId = compIdOf(comp);
    segments.push({ start: new Date(s), endExcl: new Date(e), rate });
  }

  // Stavka topilmagan oraliq (standart ham, ustunlik ham yo'q) - 0 stavkali
  // segment sifatida QAYTARILADI, jimgina yo'qolmaydi. Shunda maosh 0 chiqadi
  // va hisobotda "stavka belgilanmagan" ogohlantirishi ko'rinadi.
  if (segments.length === 0) {
    return [{ start: new Date(pStart), endExcl: new Date(pEndExcl), rate: emptyRate() }];
  }
  return segments.sort((a, b) => a.start - b.start);
};

/**
 * O'qituvchining bir OYDAGI markaz darajasidagi FIKSA (base) segmentlari.
 * Guruhga bog'liq emas - faqat TeacherCompensation oynalaridan.
 * Ishga kirish/bo'shash sanasi bilan cheklanadi (hiredAt/terminatedAt).
 */
export const baseSegmentsForMonth = (compensations, year, month, { from = null, toExcl = null } = {}) => {
  const monthStart = new Date(Date.UTC(year, month - 1, 1)).getTime();
  const monthEndExcl = new Date(Date.UTC(year, month, 1)).getTime();
  const lo = Math.max(monthStart, from ? toUtcMidnight(from).getTime() : -Infinity);
  const hi = Math.min(monthEndExcl, toExcl ? toUtcMidnight(toExcl).getTime() : Infinity);

  // IKKI MARTA SANASHDAN HIMOYA - segmentPeriod dagi bilan bir xil sabab.
  // Fiksa oylikda bu ayniqsa og'ir: kesishuv to'g'ridan-to'g'ri oylikni
  // ikki barobar qiladi (2 mln → 4 mln).
  const sortedComps = [...compensations].sort(byEffectiveFrom);

  const segments = [];
  let claimedUntil = -Infinity;
  for (const comp of sortedComps) {
    if (comp.baseType !== "fixed_monthly") continue;
    const cStart = toUtcMidnight(comp.effectiveFrom).getTime();
    const cEndExcl = comp.effectiveTo
      ? toUtcMidnight(comp.effectiveTo).getTime()
      : Infinity;
    const s = Math.max(lo, cStart, claimedUntil);
    const e = Math.min(hi, cEndExcl);
    if (s >= e) continue;
    claimedUntil = e;
    segments.push({
      start: new Date(s),
      endExcl: new Date(e),
      amount: Number(comp.baseAmount) || 0,
      compensationId: compIdOf(comp),
      branchId: comp.branchId || null,
    });
  }
  return segments;
};

/** Segment nechta kun (butun kunlar) qamrab oladi. */
export const segmentDays = (segment) =>
  Math.max(0, Math.round((segment.endExcl.getTime() - segment.start.getTime()) / DAY));

export { emptyRate };
