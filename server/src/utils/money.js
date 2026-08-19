import { Prisma } from "@prisma/client";

/**
 * ══════════════════════════════════════════════════════════════════════
 * PUL MATEMATIKASI — aniq (decimal-safe) amallar.
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── MUAMMO ──
 * `double` da pul bilan ishlash jimgina yolg'on beradi:
 *     0.1 + 0.2                    === 0.30000000000000004
 *     8_200_000 * 0.335            === 2_747_000.0000000005
 * Bitta qatorda bu ko'rinmaydi, lekin 10 000 qator yig'ilganda tiyinlar
 * to'planib, hisobot bilan kassa qoldig'i FARQ QILA BOSHLAYDI. Farqni
 * keyin izlash — eng qimmat ish.
 *
 * ── YECHIM VA UNING CHEGARASI ──
 * Baza ustunlari `numeric(18,2)` (schema.prisma §2). Postgres'dagi
 * `SUM()`, `AVG()`, `*`, `/` — hammasi ANIQ. Ya'ni eng katta va eng
 * xavfli yig'indilar allaqachon to'g'ri.
 *
 * JS tomonida esa qiymatlar SON bo'lib keladi (`config/prisma.js`
 * kengaytmasi). Butun so'mlar uchun bu XAVFSIZ: `double` 2^53 gacha
 * (≈9·10^15 so'm) butun sonni aniq saqlaydi va +/− amallari aniq
 * qoladi. Xavf faqat KO'PAYTIRISH va BO'LISHDA (foiz, proratsiya,
 * ulush) — natija kasr bo'lib chiqadi.
 *
 * ── QOIDA ──
 * Qo'shish/ayirish — oddiy `+`/`−` bilan mumkin (butun so'm).
 * KO'PAYTIRISH, BO'LISH, FOIZ va ULUSH — SHU YERDAGI funksiyalar bilan.
 *
 * Bu fayl `decimal.js` ustida ishlaydi (Prisma.Decimal — o'sha kutubxona),
 * ya'ni qo'shimcha bog'liqlik YO'Q.
 */

const D = Prisma.Decimal;

/** Har qanday kiruvchini Decimal'ga keltiradi (null/undefined/NaN → 0). */
export const dec = (v) => {
  if (v instanceof D) return v;
  if (v === null || v === undefined || v === "") return new D(0);
  // Sonni AVVAL satrga keltiramiz: new Decimal(0.1) aniq 0.1 beradi,
  // chunki decimal.js satrni o'nlik sifatida o'qiydi.
  const d = new D(String(v));
  return d.isNaN() ? new D(0) : d;
};

/** Decimal → oddiy son (JSON javob va mavjud kod uchun). */
export const num = (v) => (v === null || v === undefined ? 0 : Number(dec(v)));

/** Yig'indi — istalgan uzunlikdagi ro'yxat uchun. */
export const sum = (list = []) => list.reduce((acc, v) => acc.plus(dec(v)), new D(0));

export const add = (a, b) => dec(a).plus(dec(b));
export const sub = (a, b) => dec(a).minus(dec(b));
export const mul = (a, b) => dec(a).times(dec(b));

/** Bo'lish — nolga bo'lish 0 qaytaradi (hisobotda ∞/NaN chiqmasin). */
export const div = (a, b) => {
  const d = dec(b);
  return d.isZero() ? new D(0) : dec(a).div(d);
};

/**
 * BUTUN SO'MGA yaxlitlash (yarmi yuqoriga).
 *
 * Kassa tiyin bilan ishlamaydi: to'lov, maosh va chiqim HAR DOIM butun
 * so'mda yoziladi. Yaxlitlash ANIQ nuqtada bo'lishi kerak, aks holda
 * 700000/3 kabi ulushlar qayta-qayta yaxlitlanib, yig'indi butunga
 * to'g'ri kelmay qoladi.
 */
export const round = (v) => dec(v).toDecimalPlaces(0, D.ROUND_HALF_UP);

/** Butun so'm sifatida son qaytaradi — bazaga yozish uchun. */
export const soum = (v) => Number(round(v));

/** a ning b dan foizi (b=0 → null, "0% o'sish" yolg'on bo'lmasin). */
export const pctOf = (a, b) => {
  const d = dec(b);
  if (d.isZero()) return null;
  return Number(div(mul(a, 100), d).toDecimalPlaces(2, D.ROUND_HALF_UP));
};

/** Foiz ulushi: amount ning rate% i (rate — 40 => 40%). */
export const applyPercent = (amount, rate) => div(mul(amount, rate), 100);

/**
 * ULUSHLARGA BO'LISH — yaxlitlash yo'qotishisiz.
 *
 * 1 000 000 ni 3 ga bo'lsak 333 333.33 chiqadi; uchalasini yaxlitlab
 * qo'shsak 999 999 bo'lib, 1 so'm YO'QOLADI. Taqsimlangan chiqim yoki
 * bo'lingan to'lovda bu jimgina nomuvozanat degani.
 *
 * Bu funksiya qoldiqni birinchi ulushlarga tarqatadi, ya'ni
 * yig'indi HAR DOIM asl summaga teng bo'ladi.
 *
 * @param {*} total — bo'linadigan summa
 * @param {number[]} weights — vaznlar (masalan o'quvchilar soni)
 * @returns {number[]} butun so'mdagi ulushlar
 */
export const allocate = (total, weights = []) => {
  const t = round(total);
  const w = weights.map((x) => dec(x));
  const totalWeight = w.reduce((a, b) => a.plus(b), new D(0));
  if (totalWeight.isZero() || !w.length) return weights.map(() => 0);

  const shares = w.map((x) => Number(div(mul(t, x), totalWeight).toDecimalPlaces(0, D.ROUND_DOWN)));
  let rest = Number(t) - shares.reduce((a, b) => a + b, 0);
  // Qoldiqni eng katta vaznlilardan boshlab bittadan tarqatamiz.
  const order = w
    .map((x, i) => ({ i, v: Number(x) }))
    .sort((a, b) => b.v - a.v)
    .map((x) => x.i);
  let k = 0;
  while (rest > 0 && order.length) {
    shares[order[k % order.length]] += 1;
    rest -= 1;
    k += 1;
  }
  return shares;
};

export const isZero = (v) => dec(v).isZero();
export const gt = (a, b) => dec(a).greaterThan(dec(b));
export const gte = (a, b) => dec(a).greaterThanOrEqualTo(dec(b));
export const lt = (a, b) => dec(a).lessThan(dec(b));
export const max0 = (v) => (dec(v).isNegative() ? new D(0) : dec(v));

export { D as Decimal };
