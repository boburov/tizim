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
 * `studentPayment` hali ko'chirilmagan — u ko'chganda SHU fayldan
 * import qiladi, o'z nusxasini yaratmaydi.
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
