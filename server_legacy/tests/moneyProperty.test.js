/**
 * PUL MATEMATIKASI - INVARIANT (PROPERTY) TESTI.
 *
 * SAVOL: "proratsiya + chegirma + muzlatish + rejoin birga kelganda
 *         hisob-kitob HAR DOIM to'g'ri qoladimi?"
 *
 * Alohida holatlarni qo'lda yozish bu savolga javob bermaydi - kombinatsiya
 * juda ko'p. Shuning uchun bu test MINGLAB tasodifiy holat yaratadi va
 * har birida BUZILMASLIGI kerak bo'lgan qoidalarni (invariant) tekshiradi.
 *
 * TAKRORLANUVCHI: PRNG urug'i qat'iy (SEED=42), ya'ni yiqilgan holat
 * har safar AYNAN qayta chiqadi - tuzatgandan keyin tekshirish oson.
 *
 * BAZA KERAK EMAS - faqat sof funksiyalar.
 *
 * ISHLATISH:  npm run test:money-prop
 */
import {
  computePaymentSnapshot,
  computeLessonSnapshot,
  resolveDiscountAmount,
  daysInMonth,
} from "../src/modules/finance/services/proration.helper.js";

const R = { pass: 0, fail: 0, failures: [] };
const ok = (n, extra = "") => {
  R.pass += 1;
  console.log(`  \x1b[32m✓\x1b[0m ${n}${extra ? ` \x1b[2m${extra}\x1b[0m` : ""}`);
};
const bad = (n, d) => {
  R.fail += 1;
  R.failures.push(`${n} — ${d}`);
  console.log(`  \x1b[31m✗\x1b[0m ${n} → \x1b[31m${d}\x1b[0m`);
};
const head = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);
const money = (n) => new Intl.NumberFormat("uz-UZ").format(Math.round(n || 0));

// ─── Determinstik PRNG (mulberry32) - Math.random ishlatmaymiz ───
let _seed = 42;
const rnd = () => {
  _seed |= 0;
  _seed = (_seed + 0x6d2b79f5) | 0;
  let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const ri = (lo, hi) => lo + Math.floor(rnd() * (hi - lo + 1));

const utc = (y, m, d) => new Date(Date.UTC(y, m - 1, d));

// ─── Tasodifiy holat generatori ───
const genCase = () => {
  const year = ri(2024, 2027);
  const month = ri(1, 12);
  const dim = daysInMonth(year, month);
  const baseFee = ri(0, 20) * 50_000; // 0 .. 1 000 000

  // A'zolik davri
  const joinDay = ri(1, dim);
  const hasLeft = rnd() < 0.5;
  const leftDay = hasLeft ? ri(joinDay, dim) : null;

  // Muzlatish oynalari (0..2 ta)
  const freezeWindows = [];
  const nFreeze = ri(0, 2);
  for (let i = 0; i < nFreeze; i += 1) {
    const s = ri(1, dim);
    const e = Math.min(dim + 1, s + ri(1, 10));
    freezeWindows.push({
      start: Date.UTC(year, month - 1, s),
      end: Date.UTC(year, month - 1, e),
    });
  }

  // Chegirmalar (0..3 ta)
  const discounts = [];
  const nDisc = ri(0, 3);
  for (let i = 0; i < nDisc; i += 1) {
    discounts.push(
      rnd() < 0.5
        ? { type: "percent", value: ri(0, 120) } // >100 ham ataylab
        : { type: "fixed", value: ri(0, 15) * 50_000 },
    );
  }

  return {
    baseFee,
    year,
    month,
    joinedAt: utc(year, month, joinDay),
    leftAt: leftDay ? utc(year, month, leftDay) : null,
    discounts,
    freezeWindows,
  };
};

const brief = (c) =>
  `fee=${c.baseFee} ${c.year}-${c.month} join=${c.joinedAt?.toISOString().slice(0, 10)} left=${
    c.leftAt ? c.leftAt.toISOString().slice(0, 10) : "-"
  } disc=${JSON.stringify(c.discounts)} freeze=${c.freezeWindows.length}`;

// ─── 1. Tasodifiy holatlarda umumiy invariantlar ───
head("1) Tasodifiy holatlar (10 000 ta) - umumiy invariantlar");

const N = 10_000;
const viol = {
  negative: null,
  overBase: null,
  factorRange: null,
  discountOverFee: null,
  nonDeterministic: null,
};

for (let i = 0; i < N; i += 1) {
  const c = genCase();
  const s = computePaymentSnapshot(c);
  const proratedFee = s.expectedAmount + s.discountApplied;

  if (!viol.negative && s.expectedAmount < 0) viol.negative = { c, s };
  if (!viol.overBase && s.expectedAmount > c.baseFee) viol.overBase = { c, s };
  if (!viol.factorRange && (s.prorationFactor < 0 || s.prorationFactor > 1))
    viol.factorRange = { c, s };
  if (!viol.discountOverFee && s.discountApplied > proratedFee)
    viol.discountOverFee = { c, s };

  if (!viol.nonDeterministic) {
    const s2 = computePaymentSnapshot(c);
    if (s2.expectedAmount !== s.expectedAmount) viol.nonDeterministic = { c, s };
  }
}

const report = (key, name) => {
  const v = viol[key];
  if (v) {
    bad(name, `${brief(v.c)} -> ${JSON.stringify(v.s)}`);
  } else {
    ok(name, `${N} holat`);
  }
};

report("negative", "expectedAmount hech qachon manfiy emas");
report("overBase", "expectedAmount hech qachon baseFee dan oshmaydi");
report("factorRange", "prorationFactor [0..1] oralig'ida");
report("discountOverFee", "chegirma proratsiyalangan narxdan oshmaydi");
report("nonDeterministic", "bir xil kirish -> bir xil chiqish (deterministik)");

// ─── 2. Aniq chegaraviy qoidalar ───
head("2) Chegaraviy qoidalar");

// To'liq oy, chegirmasiz, muzlatishsiz -> AYNAN baseFee (yaxlitlash drifti yo'q)
{
  let drift = null;
  for (let y = 2024; y <= 2027 && !drift; y += 1) {
    for (let m = 1; m <= 12 && !drift; m += 1) {
      for (const fee of [333_333, 500_000, 999_999, 1_234_567]) {
        const s = computePaymentSnapshot({
          baseFee: fee, year: y, month: m,
          joinedAt: utc(y, m, 1), leftAt: null,
        });
        if (s.expectedAmount !== fee) {
          drift = `${y}-${m} fee=${fee} -> ${s.expectedAmount}`;
          break;
        }
      }
    }
  }
  drift
    ? bad("to'liq oy = aynan baseFee (drift yo'q)", drift)
    : ok("to'liq oy = aynan baseFee (drift yo'q)", "48 oy x 4 narx");
}

// 100% chegirma -> 0
{
  const s = computePaymentSnapshot({
    baseFee: 500_000, year: 2026, month: 6,
    joinedAt: utc(2026, 6, 1), leftAt: null,
    discounts: [{ type: "percent", value: 100 }],
  });
  s.expectedAmount === 0
    ? ok("100% chegirma -> 0 so'm")
    : bad("100% chegirma -> 0 so'm", `${money(s.expectedAmount)} chiqdi`);
}

// >100% chegirma 100% bilan bir xil (clamp)
{
  const a = computePaymentSnapshot({
    baseFee: 500_000, year: 2026, month: 6, joinedAt: utc(2026, 6, 1),
    discounts: [{ type: "percent", value: 100 }],
  });
  const b = computePaymentSnapshot({
    baseFee: 500_000, year: 2026, month: 6, joinedAt: utc(2026, 6, 1),
    discounts: [{ type: "percent", value: 5000 }],
  });
  a.expectedAmount === b.expectedAmount
    ? ok("5000% chegirma 100% ga clamp qilinadi")
    : bad("5000% chegirma 100% ga clamp qilinadi", `${a.expectedAmount} != ${b.expectedAmount}`);
}

// Butun oy muzlatilgan -> 0
{
  const s = computePaymentSnapshot({
    baseFee: 500_000, year: 2026, month: 6,
    joinedAt: utc(2026, 6, 1), leftAt: null,
    freezeWindows: [{ start: Date.UTC(2026, 5, 1), end: Date.UTC(2026, 6, 1) }],
  });
  s.expectedAmount === 0
    ? ok("butun oy muzlatilgan -> 0 so'm")
    : bad("butun oy muzlatilgan -> 0 so'm", `${money(s.expectedAmount)} chiqdi`);
}

// periods: [] -> 0 (oyda guruhda bo'lmagan)
{
  const s = computePaymentSnapshot({
    baseFee: 500_000, year: 2026, month: 6, periods: [],
  });
  s.expectedAmount === 0
    ? ok("bo'sh periods -> 0 so'm (qarz tiklanmaydi)")
    : bad("bo'sh periods -> 0 so'm", `${money(s.expectedAmount)} chiqdi`);
}

// ─── 3. USTMA-UST TUSHGAN A'ZOLIK DAVRLARI (rejoin) ───
head("3) Ustma-ust tushgan a'zolik davrlari (rejoin)");

// sumPayableDays davrlarni QO'SHADI va "davrlar kesishmaydi" deb taxmin qiladi.
//
// HOZIRCHA XAVFSIZ: barcha API yozish yo'llari (addStudent, applyMembershipDates)
// assertPeriodInvariants bilan qo'riqlangan, removeStudent esa leftAt'ni bugunga
// qo'yadi. Ya'ni kesishgan davrni API orqali YARATIB BO'LMAYDI.
//
// LEKIN hisoblash qatlamining o'zi kirishga ISHONADI va clamp ASIMMETRIK:
//   factor       = clamp(payableDays / totalDays, 0, 1)   <- clamp BOR
//   proratedFee  = round(baseFee * payableDays / totalDays) <- clamp YO'Q
// Shuning uchun kesishgan davr boshqa yo'l bilan kirsa (seed/insertMany,
// migratsiya, qo'lda tahrir, yoki kelajakda qo'riqchisiz yangi endpoint),
// o'quvchi jimgina ortiqcha hisoblanadi - UI esa faktorni 1.0 ko'rsatib
// hech narsa sezdirmaydi. Bu test o'sha ASIMMETRIYANI qayd etadi.
{
  const y = 2026;
  const m = 6; // 30 kun
  const fee = 600_000;
  const s = computePaymentSnapshot({
    baseFee: fee, year: y, month: m,
    periods: [
      { joinedAt: utc(y, m, 1), leftAt: null }, // butun oy
      { joinedAt: utc(y, m, 1), leftAt: null }, // AYNAN o'sha davr yana
    ],
  });

  console.log(
    `  \x1b[2mbaseFee=${money(fee)} | expectedAmount=${money(s.expectedAmount)} | factor=${s.prorationFactor}\x1b[0m`,
  );

  if (s.expectedAmount > fee) {
    bad(
      "kesishgan davrlarda ham expectedAmount <= baseFee",
      `${money(s.expectedAmount)} > ${money(fee)} - clamp asimmetrik (factor esa ${s.prorationFactor}). API orqali yetib bo'lmaydi, lekin hisoblash qatlami o'zini himoya qilmaydi`,
    );
  } else {
    ok("kesishgan davrlarda ham expectedAmount <= baseFee", money(s.expectedAmount));
  }
}

// ─── 4. Dars-asosli snapshot ───
head("4) Dars-asosli snapshot (computeLessonSnapshot)");
{
  let over = null;
  for (let i = 0; i < 2000 && !over; i += 1) {
    const fee = ri(0, 20) * 50_000;
    const total = ri(0, 30);
    const elapsed = ri(0, 40); // total dan katta ham bo'lsin
    const s = computeLessonSnapshot({
      baseFee: fee, totalLessons: total, elapsedLessons: elapsed,
      discounts: [{ type: "percent", value: ri(0, 120) }],
    });
    if (s.expectedAmount > fee || s.expectedAmount < 0) {
      over = `fee=${fee} total=${total} elapsed=${elapsed} -> ${s.expectedAmount}`;
    }
  }
  over
    ? bad("elapsed > total bo'lsa ham baseFee dan oshmaydi", over)
    : ok("elapsed > total bo'lsa ham baseFee dan oshmaydi", "2000 holat");
}

// ─── 5. resolveDiscountAmount alohida ───
head("5) Chegirma yechish (resolveDiscountAmount)");
{
  let bad1 = null;
  for (let i = 0; i < 2000 && !bad1; i += 1) {
    const proratedFee = ri(0, 20) * 50_000;
    const ds = [];
    for (let k = 0, n = ri(0, 4); k < n; k += 1) {
      ds.push(
        rnd() < 0.5
          ? { type: "percent", value: ri(-50, 200) }
          : { type: "fixed", value: ri(-5, 30) * 50_000 },
      );
    }
    const amt = resolveDiscountAmount(ds, proratedFee);
    if (amt < 0 || amt > proratedFee) {
      bad1 = `fee=${proratedFee} disc=${JSON.stringify(ds)} -> ${amt}`;
    }
  }
  bad1
    ? bad("chegirma [0..proratedFee] oralig'ida qoladi", bad1)
    : ok("chegirma [0..proratedFee] oralig'ida qoladi", "2000 holat (manfiy qiymatlar ham)");
}

console.log(
  `\n\x1b[1mNATIJA:\x1b[0m \x1b[32m${R.pass} to'g'ri\x1b[0m / \x1b[31m${R.fail} muammo\x1b[0m`,
);
if (R.failures.length) {
  console.log("\n\x1b[31mMuammolar:\x1b[0m");
  for (const f of R.failures) console.log(`  • ${f}`);
}
