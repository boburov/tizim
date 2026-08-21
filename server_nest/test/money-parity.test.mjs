/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PUL MATEMATIKASI — DIFFERENSIAL PARITET
 *
 * `server/src/utils/money.js` ↔ `server_nest/src/common/utils/money.ts`.
 *
 * ── NEGA ALOHIDA TEST ──
 *
 * Bu fayl butun moliyaning poydevori: foiz, proratsiya, ulush va
 * yaxlitlash HAMMASI shu yerdan o'tadi. Bu yerda "deyarli bir xil"
 * YETARLI EMAS — bitta yaxlitlash farqi 10 000 qatorda yig'ilib,
 * hisobot bilan kassa qoldig'ini ajratib yuboradi va farqni keyin
 * izlash eng qimmat ish bo'ladi.
 *
 * HTTP paritet testi buni QAMRAY OLMAYDI: yaxlitlash farqi faqat
 * ma'lum kirishlarda ko'rinadi va ular tabiiy trafikda uchramasligi
 * mumkin. Shuning uchun ikkala implementatsiya TO'G'RIDAN-TO'G'RI
 * chaqiriladi.
 *
 * ── NIMA SOLISHTIRILADI ──
 *   • har bir eksport qilingan funksiya, ~5 800 ta chaqiruv;
 *   • chegara kirishlari: 0, manfiy, kasr, satr, null, undefined,
 *     NaN, 1e15, 1e-9;
 *   • XATO TASHLASH ham (`dec("abc")` ikkalasida ham yiqiladi —
 *     `new Decimal("abc")` konstruktorning O'ZI xato beradi, ya'ni
 *     pastdagi `isNaN()` qo'riqchisi hech qachon ishlamaydi; bu
 *     Express'dan MEROS va ataylab o'zgartirilmagan);
 *   • `allocate()` INVARIANTI: ulushlar yig'indisi HAR DOIM asl
 *     summaga teng (1 000 000 ni 3 ga bo'lganda 1 so'm yo'qolmaydi).
 *
 * ⚠ `dist/` DAN O'QIYDI — avval `npx tsc -p tsconfig.json`.
 *
 * ISHLATISH:  npm run test:money-parity
 * ═══════════════════════════════════════════════════════════════════════════
 */
const E = await import('../../server/src/utils/money.js');
const N = await import('../dist/common/utils/money.js');

let checked = 0, diff = 0;
const cmp = (label, a, b) => {
  checked += 1;
  const sa = JSON.stringify(a), sb = JSON.stringify(b);
  if (sa !== sb) { diff += 1; console.log(`  ✗ ${label}: express=${sa} nest=${sb}`); }
};

/**
 * Ikkala implementatsiyani ham CHAQIRADI va natijani solishtiradi —
 * XATO TASHLASHNI ham.
 *
 * ⚠ `dec("abc")` IKKALASIDA HAM xato tashlaydi: `new Decimal("abc")`
 * konstruktorning O'ZI yiqiladi, ya'ni pastdagi `d.isNaN()` qo'riqchisi
 * HECH QACHON ishlamaydi. Bu Express'dan MEROS xatti-harakat va
 * ko'chirishda ATAYLAB o'zgartirilmadi — bu yerda maqsad
 * "yaxshilash" emas, AYNAN bir xillik.
 */
const both = (label, fe, fn) => {
  let ea, na;
  try { ea = { ok: fe() }; } catch (e) { ea = { err: e.message }; }
  try { na = { ok: fn() }; } catch (e) { na = { err: e.message }; }
  cmp(label, ea, na);
};

// Turli xil kirishlar — chegara holatlari bilan birga.
const VALUES = [0, 1, -1, 0.1, 0.2, 0.5, 1.5, 2.5, -0.5, 100, 999, 1000,
  333333.33, 700000, 8_200_000, 1e15, "0.1", "700000", "", null, undefined,
  NaN, "abc", 1e-9, -1e6];

for (const v of VALUES) {
  both(`num(${String(v)})`, () => E.num(v), () => N.num(v));
  both(`soum(${String(v)})`, () => E.soum(v), () => N.soum(v));
  both(`round(${String(v)})`, () => String(E.round(v)), () => String(N.round(v)));
  both(`isZero(${String(v)})`, () => E.isZero(v), () => N.isZero(v));
  both(`max0(${String(v)})`, () => String(E.max0(v)), () => String(N.max0(v)));
}
for (const a of VALUES) for (const b of VALUES) {
  both(`add(${String(a)},${String(b)})`, () => String(E.add(a, b)), () => String(N.add(a, b)));
  both(`sub(${String(a)},${String(b)})`, () => String(E.sub(a, b)), () => String(N.sub(a, b)));
  both(`mul(${String(a)},${String(b)})`, () => String(E.mul(a, b)), () => String(N.mul(a, b)));
  both(`div(${String(a)},${String(b)})`, () => String(E.div(a, b)), () => String(N.div(a, b)));
  both(`pctOf(${String(a)},${String(b)})`, () => E.pctOf(a, b), () => N.pctOf(a, b));
  both(`applyPercent(${String(a)},${String(b)})`,
    () => String(E.applyPercent(a, b)), () => String(N.applyPercent(a, b)));
  both(`gt(${String(a)},${String(b)})`, () => E.gt(a, b), () => N.gt(a, b));
  both(`gte(${String(a)},${String(b)})`, () => E.gte(a, b), () => N.gte(a, b));
  both(`lt(${String(a)},${String(b)})`, () => E.lt(a, b), () => N.lt(a, b));
}

// ── allocate(): yaxlitlash yo'qotishini oldini olish ──
const ALLOC = [
  [1_000_000, [1, 1, 1]], [1_000_000, [3, 1]], [700_000, [1, 1, 1]],
  [1, [1, 1, 1]], [0, [1, 2]], [999_999, [5, 3, 2]], [100, []],
  [1_000_000, [0, 0]], [12_345_678, [7, 11, 13, 17]], [5, [1, 1, 1, 1, 1, 1]],
];
for (const [t, w] of ALLOC) {
  let ea, na;
  try { ea = E.allocate(t, w); } catch (e) { ea = `ERR:${e.message}`; }
  try { na = N.allocate(t, w); } catch (e) { na = `ERR:${e.message}`; }
  if (typeof ea === 'string') { cmp(`allocate(${t},[${w}])`, ea, na); continue; }
  cmp(`allocate(${t},[${w}])`, ea, na);
  // INVARIANT: ulushlar yig'indisi ASL SUMMAGA teng (vazn bo'lsa).
  const s = ea.reduce((x, y) => x + y, 0);
  const expect = w.some((x) => x > 0) ? E.soum(t) : 0;
  if (s !== expect) { diff += 1; console.log(`  ✗ allocate yig'indisi: ${s} ≠ ${expect}`); }
  checked += 1;
}

// sum()
for (const list of [[], [1], [0.1, 0.2], [1e15, 1], [null, undefined, 5], ["3", 4]]) {
  both(`sum([${list}])`, () => String(E.sum(list)), () => String(N.sum(list)));
}

console.log(`\n  ${checked} tekshiruv, ${diff} farq`);
// ⚠ MUSBAT NAZORAT: hech narsa tekshirilmagan bo'lsa bu YASHIL EMAS.
if (checked < 1000) {
  console.log('  ❌ O\'LCHANMADI: kutilganidan kam tekshiruv bajarildi.');
  process.exit(1);
}
process.exit(diff ? 1 : 0);
