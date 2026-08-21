import { toUtcMidnight } from '../../common/utils/date.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * STAVKA ANIQLASH (rate resolution) — `rateResolver.helper.js` KO'CHIRMASI.
 *
 * Bir oy ichida stavka IKKI sababdan o'zgarishi mumkin:
 *   1. o'qituvchi guruhdagi davri (`TeacherGroupPeriod`) almashdi,
 *   2. o'qituvchining STANDART stavkasi (`TeacherCompensation`) oshirildi.
 *
 * Ikkalasi ham sana-amalli, shuning uchun oy KESISHMALARGA (segment)
 * bo'linadi va har segment o'z stavkasi bilan ALOHIDA proratsiya
 * qilinadi. Aks holda 15-martda oylik oshirilsa, BUTUN mart yangi
 * stavkada hisoblanib ketardi.
 *
 * USTUNLIK TARTIBI (har segment uchun):
 *   1. `TeacherGroupPeriod.variableType`  → "bu guruhda boshqacha kelishdik"
 *   2. `TeacherGroupPeriod.salaryType`    → LEGACY maydon (eski yozuvlar)
 *   3. `TeacherCompensation.variableType` → o'qituvchi STANDART stavkasi
 *   4. hech biri                          → 0 stavkali segment
 * ═══════════════════════════════════════════════════════════════════════════
 */

const DAY = 24 * 60 * 60 * 1000;

export interface Rate {
  perGroup: number;
  percentRate: number;
  percentBase: string;
  perStudent: number;
  perHour: number;
  source: string;
  variableType: string | null;
  variableRate: number;
  compensationId: string | null;
}

/**
 * Normallashtirilgan stavka: barcha "kanal"lar bir joyda.
 *
 * ⚠ BITTA ENUM O'RNIGA KANALLAR TO'PLAMI: LEGACY "mixed" bir vaqtda IKKI
 * kanalni (guruh fiksasi + foiz) yoqadi va uni bitta enum bilan
 * ifodalab bo'lmaydi.
 */
export const emptyRate = (): Rate => ({
  perGroup: 0,
  percentRate: 0,
  percentBase: 'billed',
  perStudent: 0,
  perHour: 0,
  source: 'none',
  variableType: null,
  variableRate: 0,
  compensationId: null,
});

/** Yangi (`variableType`) shaklidagi stavkani kanallarga yoyadi. */
const applyVariable = (
  rate: Rate,
  type: string | null,
  value: unknown,
  percentBase?: string | null,
): Rate => {
  const v = Number(value) || 0;
  switch (type) {
    case 'percent':
      rate.percentRate = v;
      rate.percentBase = percentBase || 'billed';
      break;
    case 'per_student':
      rate.perStudent = v;
      break;
    case 'per_lesson_hour':
      rate.perHour = v;
      break;
    case 'per_group':
      rate.perGroup = v;
      break;
    default:
      break; // "none" yoki noma'lum — kanal yoqilmaydi
  }
  rate.variableType = type;
  rate.variableRate = v;
  return rate;
};

/**
 * LEGACY (`salaryType`/`fixedAmount`/`percentRate`) → kanallar.
 *
 * ⚠ MUHIM TARJIMA: eski "fixed" GURUH uchun qat'iy summa degani edi
 * (o'qituvchi 3 guruhda ishlasa 3 BAROBAR olardi). Yangi modeldagi
 * markaz darajasidagi fiksa oylik BU EMAS. Shuning uchun eski "fixed"
 * → `per_group` ga tarjima qilinadi: mavjud yozuvlarning puli
 * TIYINIGA QADAR o'zgarmaydi.
 */
const applyLegacy = (rate: Rate, period: Record<string, any>): Rate => {
  const type = period.salaryType;
  const fixed = Number(period.fixedAmount) || 0;
  const pct = Number(period.percentRate) || 0;
  if (type === 'fixed' || type === 'mixed') rate.perGroup = fixed;
  if (type === 'percent' || type === 'mixed') {
    rate.percentRate = pct;
    rate.percentBase = 'billed'; // eski xulq-atvor: hisoblangan bo'yicha
  }
  rate.variableType =
    type === 'fixed' ? 'per_group' : type === 'percent' ? 'percent' : 'per_group';
  rate.variableRate = type === 'percent' ? pct : fixed;
  rate.source = 'period_legacy';
  return rate;
};

const hasOwnRate = (period: Record<string, any>): boolean =>
  period?.variableType != null || period?.salaryType != null;

/**
 * Stavka hujjatining kaliti.
 *
 * ⚠ Bu qiymat maosh qatoriga AUDIT HAVOLASI bo'lib yoziladi
 * (`TeacherSalary.compensationId`), shuning uchun jimgina `undefined`
 * bo'lishiga yo'l qo'yib bo'lmaydi — maosh to'g'ri chiqardi-yu,
 * "qaysi shartnomadan" izi yo'qolardi.
 */
const compIdOf = (comp: Record<string, any> | null): string | null =>
  comp?.id ?? comp?._id ?? null;

/**
 * Stavkalar tartibi — `claimedUntil` klampi SHU tartibga tayanadi.
 *
 * ⚠ `effectiveFrom` YETARLI EMAS. Ikki stavka bir xil `effectiveFrom`
 * bilan tursa, Mongo kolleksiyani tabiiy tartibda skanerlagani uchun
 * natija TASODIFAN barqaror edi. Postgres bunday kafolat BERMAYDI va
 * o'sha oy IKKI XIL SUMMAGA qayta hisoblanishi mumkin edi.
 *
 * `createdAt` "avval kiritilgani yutadi" qoidasini OCHIQ belgilaydi.
 */
export const byEffectiveFrom = (a: Record<string, any>, b: Record<string, any>): number =>
  toUtcMidnight(a.effectiveFrom).getTime() - toUtcMidnight(b.effectiveFrom).getTime() ||
  new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();

/** Stavka hisobiga KERAK bo'lgan ustunlar — bitta manba. */
export const COMPENSATION_FIELDS = {
  id: true,
  branchId: true,
  effectiveFrom: true,
  effectiveTo: true,
  baseType: true,
  baseAmount: true,
  variableType: true,
  variableRate: true,
  percentBase: true,
} as const;

export interface Segment {
  start: Date;
  endExcl: Date;
  rate: Rate;
}

/**
 * Bir dars davrini stavka SEGMENTLARIGA bo'ladi.
 *
 * ⚠⚠ IKKI MARTA SANASHDAN HIMOYA (ikkinchi qatlam) ⚠⚠
 * Servis qatlamida kesishuv taqiqlangan (`assertNoOverlap`), lekin
 * qo'riqchi qo'yilishidan OLDIN yaratilgan buzuq ma'lumot bazada
 * qolgan bo'lishi mumkin. Kesishgan stavkalar segmentlarga aylansa,
 * bir kun IKKI MARTA to'lanardi — 2 mln oylik 4 mln bo'lib chiqardi.
 *
 * `claimedUntil`: kesishgan qismni ERTAROQ boshlangan stavka oladi,
 * keyingisi faqat QOLGANINI.
 */
export const segmentPeriod = (
  period: Record<string, any>,
  compensations: Record<string, any>[],
  windowStart: Date,
  windowEndExcl: Date,
): Segment[] => {
  const pStart = Math.max(
    toUtcMidnight(period.startDate).getTime(),
    windowStart.getTime(),
  );
  const pEndExcl = Math.min(
    period.endDate ? toUtcMidnight(period.endDate).getTime() : Infinity,
    windowEndExcl.getTime(),
  );
  if (pStart >= pEndExcl) return [];

  // Davr O'Z stavkasiga ega → standart stavka UMUMAN qaralmaydi.
  if (hasOwnRate(period)) {
    const rate = emptyRate();
    if (period.variableType != null) {
      applyVariable(rate, period.variableType, period.variableRate, period.percentBase);
      rate.source = 'period';
    } else {
      applyLegacy(rate, period);
    }
    return [{ start: new Date(pStart), endExcl: new Date(pEndExcl), rate }];
  }

  const sortedComps = [...compensations].sort(byEffectiveFrom);

  const segments: Segment[] = [];
  let claimedUntil = -Infinity;
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
    rate.source = 'compensation';
    rate.compensationId = compIdOf(comp);
    segments.push({ start: new Date(s), endExcl: new Date(e), rate });
  }

  // ⚠ Stavka topilmagan oraliq 0 STAVKALI segment sifatida QAYTARILADI,
  // jimgina yo'qolmaydi. Shunda maosh 0 chiqadi va hisobotda "stavka
  // belgilanmagan" ogohlantirishi ko'rinadi.
  if (segments.length === 0) {
    return [{ start: new Date(pStart), endExcl: new Date(pEndExcl), rate: emptyRate() }];
  }
  return segments.sort((a, b) => a.start.getTime() - b.start.getTime());
};

export interface BaseSegment {
  start: Date;
  endExcl: Date;
  amount: number;
  compensationId: string | null;
  branchId: string | null;
}

/**
 * O'qituvchining bir OYDAGI markaz darajasidagi FIKSA (base) segmentlari.
 * Guruhga bog'liq emas — faqat `TeacherCompensation` oynalaridan.
 *
 * ⚠ Kesishuv himoyasi `segmentPeriod` dagi bilan bir xil sabab. Fiksa
 * oylikda bu AYNIQSA og'ir: kesishuv to'g'ridan-to'g'ri oylikni ikki
 * barobar qiladi (2 mln → 4 mln).
 */
export const baseSegmentsForMonth = (
  compensations: Record<string, any>[],
  year: number,
  month: number,
  { from = null, toExcl = null }: { from?: Date | string | null; toExcl?: Date | string | null } = {},
): BaseSegment[] => {
  const monthStart = new Date(Date.UTC(year, month - 1, 1)).getTime();
  const monthEndExcl = new Date(Date.UTC(year, month, 1)).getTime();
  const lo = Math.max(monthStart, from ? toUtcMidnight(from).getTime() : -Infinity);
  const hi = Math.min(monthEndExcl, toExcl ? toUtcMidnight(toExcl).getTime() : Infinity);

  const sortedComps = [...compensations].sort(byEffectiveFrom);

  const segments: BaseSegment[] = [];
  let claimedUntil = -Infinity;
  for (const comp of sortedComps) {
    if (comp.baseType !== 'fixed_monthly') continue;
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
export const segmentDays = (segment: { start: Date; endExcl: Date }): number =>
  Math.max(0, Math.round((segment.endExcl.getTime() - segment.start.getTime()) / DAY));
