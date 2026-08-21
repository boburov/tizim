import { num, pctOf, div, mul, sub } from '../../common/utils/money.js';

/**
 * O'LCHOV YORDAMCHILARI — taqqoslash va nisbatlar.
 * (`services/metrics.js` NING KO'CHIRMASI)
 *
 * ── NOLGA BO'LISHNI QANDAY HAL QILAMIZ ──
 * Nolga bo'linganda `0` EMAS, `null` qaytariladi.
 *
 * NEGA: `0%` "o'zgarish bo'lmadi" degan MA'NOGA ega, holbuki haqiqat
 * "taqqoslab bo'lmaydi" (oldingi davrda umuman pul yo'q edi). Noldan
 * 5 mln ga o'sishni "0% o'sish" deb ko'rsatish yolg'on bo'lardi va
 * ogohlantirish tizimi uni sezmay o'tib ketardi.
 *
 * Frontend `null` ni "—" yoki "yangi" deb ko'rsatadi.
 */

/** Xom (Decimal yoki son) qiymatni songa keltiradi. */
export const n = (v: unknown): number => num(v);

export interface Comparison {
  current: number;
  previous: number;
  change: number;
  changePercent: number | null;
}

/** Joriy va oldingi davrni taqqoslaydi. */
export const compare = (current: unknown, previous: unknown): Comparison => {
  const c = num(current);
  const p = num(previous);
  return {
    current: c,
    previous: p,
    change: num(sub(c, p)),
    // `pctOf` nolda `null` qaytaradi — yuqoridagi izohga qarang.
    changePercent: pctOf(sub(c, p), p),
  };
};

/**
 * Ulush foizi (marja, bandlik, undirish darajasi).
 * Maxraj nol bo'lsa `null`.
 */
export const ratioPercent = (part: unknown, whole: unknown): number | null =>
  pctOf(part, whole);

/** Bo'lish — maxraj nol bo'lsa `null` (masalan o'quvchi boshiga daromad). */
export const per = (total: unknown, count: unknown): number | null => {
  const c = Number(count) || 0;
  if (!c) return null;
  return Math.round(num(div(total, c)));
};

/** Foizni summaga qo'llaydi (yaxlitlangan so'm). */
export const applyRate = (amount: unknown, ratePercent: unknown): number =>
  Math.round(num(div(mul(amount, ratePercent), 100)));

/**
 * Reytingni bir nechta mezon bo'yicha tayyorlaydi.
 *
 * ATAYLAB YAGONA "eng yaxshi" BALL YO'Q: daromadi katta o'qituvchi
 * marjasi past bo'lishi mumkin, ko'p o'quvchili yo'nalish esa zarar
 * keltirishi mumkin. Bitta raqamga siqish qaysi mezon muhimligini
 * YASHIRARDI — qaror esa o'sha mezonga bog'liq.
 */
export const rankBy = <T extends Record<string, unknown>>(
  rows: T[],
  keys: string[],
  limit: number | null = null,
): Record<string, T[]> => {
  const out: Record<string, T[]> = {};
  for (const key of keys) {
    const sorted = [...rows]
      .filter((r) => r[key] !== null && r[key] !== undefined)
      .sort((a, b) => Number(b[key]) - Number(a[key]));
    out[key] = limit ? sorted.slice(0, limit) : sorted;
  }
  return out;
};
