import { toUtcMidnight } from './date.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PRORATSIYA — `modules/finance/services/proration.helper.js` KO'CHIRMASI.
 *
 * ⚠ BU FAYL IKKI MODUL UCHUN YAGONA MANBA: o'quvchi to'lovi
 * (`studentPayment`) va o'qituvchi maoshi (`teacherSalary`). Ikkinchi
 * nusxa yaratilsa "o'quvchi to'lamagan kun uchun o'qituvchiga haq
 * to'lanadi" turidagi ajralish paydo bo'lardi.
 *
 * `studentPayment` SHU fayldan import qiladi, o'z nusxasini yaratmaydi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const clamp = (n: number, lo: number, hi: number): number =>
  Math.max(lo, Math.min(hi, n));

/** Oydagi kalendar kunlar soni. */
export const daysInMonth = (year: number, month: number): number =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

export interface FreezeWindow {
  start: number;
  end: number;
}

const isFrozenDayMs = (freezeWindows: FreezeWindow[], dMs: number): boolean =>
  freezeWindows.some((w) => dMs >= w.start && dMs < w.end);

/**
 * Proratsiya (kalendar kun + muzlatish ayirmasi).
 *
 * ⚠⚠ `leftExclusive` IKKI XIL SEMANTIKANI AJRATADI ⚠⚠
 *   `false` (MAOSH)   — `workEndDate` KUNI HAM ishlangan kun → inclusive
 *   `true`  (A'ZOLIK) — `leftAt` kuni ARTIQ a'zo emas → oxirgi
 *                        to'lanadigan kun = `leftAt - 1`
 *
 * Ikkalasini aralashtirish bir kunlik siljish beradi: o'quvchi chiqqan
 * kuni unga yana qarz yozilardi yoki o'qituvchi oxirgi ish kuni uchun
 * haq olmasdi.
 */
export const computeProration = ({
  year,
  month,
  joinedAt,
  leftAt = null,
  leftExclusive = false,
  freezeWindows = [],
}: {
  year: number;
  month: number;
  joinedAt?: Date | string | null;
  leftAt?: Date | string | null;
  leftExclusive?: boolean;
  freezeWindows?: FreezeWindow[];
}): { factor: number; payableDays: number; totalDays: number } => {
  const totalDays = daysInMonth(year, month);
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEnd = new Date(Date.UTC(year, month, 0));
  const join = joinedAt ? toUtcMidnight(joinedAt) : monthStart;
  const left = leftAt ? toUtcMidnight(leftAt) : null;

  // Bu oyga umuman tegishli emas: keyin boshlagan yoki avval tugatgan.
  if (join.getTime() > monthEnd.getTime()) {
    return { factor: 0, payableDays: 0, totalDays };
  }
  if (left) {
    const leftBeforeMonth = leftExclusive
      ? left.getTime() <= monthStart.getTime()
      : left.getTime() < monthStart.getTime();
    if (leftBeforeMonth) return { factor: 0, payableDays: 0, totalDays };
  }

  const startDay = join.getTime() <= monthStart.getTime() ? 1 : join.getUTCDate();
  let endDay: number;
  if (!left || left.getTime() > monthEnd.getTime()) {
    endDay = totalDays;
  } else if (leftExclusive) {
    endDay = left.getUTCDate() - 1;
  } else {
    endDay = left.getTime() >= monthEnd.getTime() ? totalDays : left.getUTCDate();
  }

  let payable = Math.max(0, endDay - startDay + 1);

  // Muzlatilgan kunlar ayriladi (oraliqdagi har bir kun tekshiriladi).
  if (freezeWindows && freezeWindows.length) {
    let frozen = 0;
    for (let day = startDay; day <= endDay; day += 1) {
      if (isFrozenDayMs(freezeWindows, Date.UTC(year, month - 1, day))) frozen += 1;
    }
    payable = Math.max(0, payable - frozen);
  }

  return { factor: clamp(payable / totalDays, 0, 1), payableDays: payable, totalDays };
};

/** Chegirmalarni proratsiyalangan fee ga nisbatan yechadi (percent + fixed, capped). */
export const resolveDiscountAmount = (
  discounts: { type?: string; value?: unknown }[] | null | undefined,
  proratedFee: number,
): number => {
  let pct = 0;
  let fixed = 0;
  for (const d of discounts || []) {
    if (d.type === 'percent') pct += Number(d.value) || 0;
    else fixed += Number(d.value) || 0;
  }
  pct = clamp(pct, 0, 100);
  const percentCut = Math.round((proratedFee * pct) / 100);
  return clamp(percentCut + fixed, 0, proratedFee);
};

/**
 * `paidAmount` va `expectedAmount` dan status.
 *
 * ⚠ MAOSHDA HAM, TO'LOVDA HAM AYNAN SHU QOIDA. `applyPaidDelta` xom SQL
 * ishlatgani uchun o'sha yerda ham AYNAN shu shartlar takrorlanadi —
 * ikki joyda ikki xil qoida bo'lib qolmasin.
 */
export const deriveStatus = (
  paidAmount: number,
  expectedAmount: number,
): 'unpaid' | 'partial' | 'paid' => {
  if (paidAmount <= 0) return 'unpaid';
  if (paidAmount < expectedAmount) return 'partial';
  return 'paid';
};


/**
 * Bir o'quvchi bitta oyda guruhdan ketib QAYTA QO'SHILSA (rejoin) — har
 * davr alohida proratsiya qilinib, kunlar QO'SHILADI.
 *
 * ⚠ Bir kun ikki marta sanalmaydi: a'zolik davrlari kesishmaydi va buni
 * yozish qatlami (`assertPeriodInvariants`) ta'minlaydi.
 */
const sumPayableDays = ({
  year,
  month,
  periods,
  freezeWindows = [],
}: {
  year: number;
  month: number;
  periods: { joinedAt?: Date | string | null; leftAt?: Date | string | null }[];
  freezeWindows?: FreezeWindow[];
}): { payableDays: number; totalDays: number } => {
  let payableDays = 0;
  let totalDays = 0;
  for (const period of periods) {
    const r = computeProration({
      year,
      month,
      joinedAt: period.joinedAt,
      leftAt: period.leftAt || null,
      // ⚠ A'ZOLIK — `leftAt` kuni ARTIQ a'zo emas.
      leftExclusive: true,
      freezeWindows,
    });
    totalDays = r.totalDays;
    payableDays += r.payableDays;
  }
  return { payableDays, totalDays };
};

export interface Snapshot {
  baseFee: number;
  prorationFactor: number;
  discountApplied: number;
  expectedAmount: number;
}

/**
 * TO'LIQ SNAPSHOT — `baseFee`, proratsiya va chegirmalardan.
 *
 * `periods`: o'quvchining shu oydagi a'zolik davrlari
 * `[{ joinedAt, leftAt(EXCLUSIVE) }]`. Bir nechta davr (rejoin) bo'lsa
 * kunlar qo'shiladi.
 *
 * ⚠ IKKI XIL "BO'SHLIK" IKKI XIL MA'NO:
 *   `periods === null` → bitta `{joinedAt, leftAt}` davr (orqaga moslik)
 *   `periods === []`   → o'quvchi shu oyda guruhda BO'LMAGAN → 0 kun
 *
 * Bo'sh massivni "to'liq oy" ga default qilish KETGAN o'quvchiga qarzni
 * QAYTA TIKLARDI.
 */
export const computePaymentSnapshot = ({
  baseFee = 0,
  year,
  month,
  joinedAt,
  leftAt = null,
  periods = null,
  discounts = [],
  freezeWindows = [],
}: {
  baseFee?: number;
  year: number;
  month: number;
  joinedAt?: Date | string | null;
  leftAt?: Date | string | null;
  periods?: { joinedAt?: Date | string | null; leftAt?: Date | string | null }[] | null;
  discounts?: any[];
  freezeWindows?: FreezeWindow[];
}): Snapshot => {
  const effPeriods = periods === null ? [{ joinedAt, leftAt }] : periods;

  const main = sumPayableDays({ year, month, periods: effPeriods, freezeWindows });
  const totalDays = main.totalDays || daysInMonth(year, month);

  /**
   * ⚠⚠ KUNLAR OYDAN OSHMASLIGI KERAK.
   *
   * `sumPayableDays` davrlarni QO'SHADI va ular kesishmasligiga ISHONADI.
   * Lekin ishonch yetarli emas: Express'da ilgari `factor` clamp
   * qilinardi-yu, `proratedFee` XOM nisbatdan hisoblanardi. Kesishgan
   * ikki davrda 600 000 lik oylik 1 200 000 bo'lib chiqardi —
   * foydalanuvchi IKKI BAROBAR qarzdor bo'lardi.
   *
   * Endi KUNLARNING O'ZI chegaralanadi, ya'ni ikkala qiymat ham bir xil
   * (himoyalangan) sondan chiqadi va ular hech qachon ajralib ketmaydi.
   */
  const payableDays = Math.min(main.payableDays, totalDays);

  const proratedFee = Math.round(((Number(baseFee) || 0) * payableDays) / totalDays);
  const factor = clamp(payableDays / totalDays, 0, 1);

  const discountApplied = resolveDiscountAmount(discounts, proratedFee);
  const expectedAmount = Math.max(0, proratedFee - discountApplied);
  return {
    baseFee: Number(baseFee) || 0,
    prorationFactor: factor,
    discountApplied,
    expectedAmount,
  };
};

/**
 * DARS-ASOSLI accrual snapshot: narx kalendar kunga emas, OYDAGI DARS
 * SONIGA bo'linadi (1 dars narxi = oylik / oydagi jami dars).
 *
 * Qarz o'tib bo'lgan HAR BIR dars uchun yig'iladi — o'quvchi darsga
 * kelsin-kelmasin (bu DAVOMAT emas, MAJBURIYAT).
 *
 * ⚠ Yaxlitlash drift'siz: `elapsed === total` bo'lganda (oy oxiri) AYNAN
 * `baseFee` chiqadi, oraliqda esa proporsional.
 */
export const computeLessonSnapshot = ({
  baseFee = 0,
  totalLessons = 0,
  elapsedLessons = 0,
  discounts = [],
}: {
  baseFee?: number;
  totalLessons?: number;
  elapsedLessons?: number;
  discounts?: any[];
}): Snapshot => {
  const fee = Number(baseFee) || 0;
  const total = Math.max(0, Number(totalLessons) || 0);
  const elapsed = clamp(Number(elapsedLessons) || 0, 0, total);

  const proratedFee = total > 0 ? Math.round((fee * elapsed) / total) : 0;
  const factor = total > 0 ? elapsed / total : 0;

  const discountApplied = resolveDiscountAmount(discounts, proratedFee);
  const expectedAmount = Math.max(0, proratedFee - discountApplied);
  return {
    baseFee: fee,
    prorationFactor: factor,
    discountApplied,
    expectedAmount,
  };
};
