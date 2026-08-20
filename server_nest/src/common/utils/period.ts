import { ApiError } from '../errors/api-error.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DAVR (period) INVARIANTLARI — `helpers/period.helper.js` KO'CHIRMASI.
 *
 * ⚠⚠ IKKI GRANULARLIK, IKKI XIL ORALIQ SEMANTIKASI ⚠⚠
 *
 *   "month" → [startYM .. endYM]  INCLUSIVE  (narx / maosh stavkasi)
 *   "date"  → [start, end)        HALF-OPEN  (a'zolik / biriktirish)
 *
 * `date` da `end` (ya'ni `leftAt`) KUNI A'ZO EMAS — bu davomat
 * kodlashi bilan AYNAN bir xil. Ikkalasini aralashtirish bir kunlik
 * siljish beradi: o'quvchi chiqqan kuni unga yana dars yozilardi va
 * o'sha kun uchun qarz hisoblanardi.
 *
 * Ochiq davr (`end = null`) → cheksizgacha davom etadi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export type Granularity = 'month' | 'date';

export interface MonthPeriod {
  startYear: number;
  startMonth: number;
  endYear?: number | null;
  endMonth?: number | null;
}

export interface DatePeriod {
  startDate: Date | string;
  endDate?: Date | string | null;
}

export type PeriodLike = Partial<MonthPeriod> & Partial<DatePeriod>;

/** Oy → tartib raqami (`yil*12 + oy-1`). Taqqoslash/oraliq uchun. */
export const monthToIndex = (year: number, month: number): number =>
  year * 12 + (month - 1);

export const indexToMonth = (idx: number): { year: number; month: number } => ({
  year: Math.floor(idx / 12),
  month: (idx % 12) + 1,
});

/** Davrni `[start, end]` raqamli oralig'iga aylantiradi. Ochiq → `Infinity`. */
const toInterval = (p: PeriodLike, granularity: Granularity) => {
  if (granularity === 'month') {
    const start = monthToIndex(p.startYear as number, p.startMonth as number);
    const end =
      p.endYear != null && p.endMonth != null
        ? monthToIndex(p.endYear, p.endMonth)
        : Infinity;
    return { start, end };
  }
  const start = new Date(p.startDate as Date).getTime();
  const end = p.endDate ? new Date(p.endDate).getTime() : Infinity;
  return { start, end };
};

/** Ikki oraliq kesishadimi. `month`: inclusive, `date`: half-open. */
const intervalsOverlap = (
  a: { start: number; end: number },
  b: { start: number; end: number },
  granularity: Granularity,
): boolean => {
  if (granularity === 'month') return a.start <= b.end && b.start <= a.end;
  return a.start < b.end && b.start < a.end;
};

/** UTC timestampni "dd.mm.yyyy" ko'rinishida (sanalar UTC yarim tunda). */
const formatDateUTC = (t: number): string => {
  const d = new Date(t);
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getUTCFullYear()}`;
};

/** Davrning O'ZINI tekshiradi (start mavjud, end >= start). */
export const assertValidPeriod = (
  period: PeriodLike,
  granularity: Granularity,
): void => {
  const iv = toInterval(period, granularity);
  if (!Number.isFinite(iv.start)) {
    throw new ApiError(400, 'Davr boshlanish sanasi majburiy');
  }
  if (iv.end !== Infinity && iv.end < iv.start) {
    throw new ApiError(400, "Davr tugashi boshlanishidan oldin bo'lishi mumkin emas");
  }
};

/**
 * Nomzod davr mavjud davrlar bilan TO'QNASHMASLIGINI va ko'lamda FAQAT
 * BITTA ochiq (`end = null`) davr bo'lishini ta'minlaydi.
 *
 * ⚠ `existing` — SHU ko'lamdagi BOSHQA davrlar. Nomzodning O'ZI
 * `excludeId` orqali chiqarib tashlangan bo'lishi SHART: aks holda
 * tahrirlash amali har doim "o'zi bilan kesishdi" deb rad etilardi.
 */
export const assertPeriodInvariants = (
  candidate: PeriodLike,
  existing: PeriodLike[],
  granularity: Granularity,
): void => {
  assertValidPeriod(candidate, granularity);
  const cand = toInterval(candidate, granularity);
  let openCount = cand.end === Infinity ? 1 : 0;

  for (const e of existing) {
    const iv = toInterval(e, granularity);
    if (iv.end === Infinity) openCount += 1;
    if (intervalsOverlap(cand, iv, granularity)) {
      // "date" (a'zolik/biriktirish) uchun QAYSI davr kesishayotganini
      // ko'rsatamiz — aks holda foydalanuvchi sababini bilmay chalkashadi.
      if (granularity === 'date') {
        const end = iv.end === Infinity ? 'hozircha ochiq' : formatDateUTC(iv.end);
        throw new ApiError(
          400,
          `Davrlar bir-biri bilan kesishmasligi kerak. Mavjud davr: ${formatDateUTC(iv.start)} – ${end}. Yangi sanani shu davr bilan kesishmaydigan qilib tanlang.`,
        );
      }
      throw new ApiError(400, 'Davrlar bir-biri bilan kesishmasligi kerak');
    }
  }
  if (openCount > 1) {
    throw new ApiError(400, "Faqat bitta ochiq (tugamagan) davr bo'lishi mumkin");
  }
};

/** Berilgan oy qaysi davrga tushishini topadi (yoki `null`). */
export const findPeriodForMonth = <T extends PeriodLike>(
  periods: T[],
  year: number,
  month: number,
): T | null => {
  const ym = monthToIndex(year, month);
  for (const p of periods) {
    const iv = toInterval(p, 'month');
    if (ym >= iv.start && ym <= iv.end) return p;
  }
  return null;
};

/** Berilgan sana qaysi davrga tushishini topadi (HALF-OPEN). */
export const findPeriodForDate = <T extends PeriodLike>(
  periods: T[],
  date: Date | string,
): T | null => {
  const t = new Date(date).getTime();
  for (const p of periods) {
    const iv = toInterval(p, 'date');
    if (t >= iv.start && t < iv.end) return p;
  }
  return null;
};

/** `[fromYM, toYM]` oralig'idagi oylar ro'yxati — recompute uchun. */
export const monthsInRange = (
  startYear: number,
  startMonth: number,
  endYear: number,
  endMonth: number,
): { year: number; month: number }[] => {
  const from = monthToIndex(startYear, startMonth);
  const to = monthToIndex(endYear, endMonth);
  const out = [];
  for (let i = from; i <= to; i += 1) out.push(indexToMonth(i));
  return out;
};
