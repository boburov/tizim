/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MAOSH STAVKASINI ANIQLASH — `server_legacy/tests/salaryRate.test.js` dan
 * ko'chirilgan.
 *
 * ── NEGA KO'CHIRILDI (dalil) ──
 * `src/modules/teacher-salary/rate-resolver.ts` NestJS'ga ko'chirilgan,
 * lekin NestJS tomonida uni sinaydigan BIRORTA test yo'q edi —
 * `grep -rl "rate-resolver" test/` BO'SH qaytardi. Mavjud
 * `teacher-salary-parity` to'plami HTTP darajasida ishlaydi va oy
 * o'rtasida stavka o'zgarishi kabi CHEKKA holatlarga yetib bormaydi.
 *
 * ── SAVOL ──
 * "Stavka o'qituvchi standartida ham, guruh davrida ham bo'lishi mumkin.
 *  Qaysi biri yutadi va oy o'rtasida o'zgarsa pul to'g'ri bo'linadimi?"
 *
 * Eng muhim tekshiruv — ORQAGA MOSLIK: mavjud (legacy) yozuvlarning puli
 * tiyiniga qadar o'zgarmasligi kerak. Migratsiya "hammani yangi modelga
 * o'tkazdim" deb eski maoshlarni qayta yozib yuborsa, o'tgan oylar
 * hisoboti buziladi — buni test ushlab qolishi shart.
 *
 * BAZA KERAK EMAS — `segmentPeriod`/`baseSegmentsForMonth` sof funksiyalar.
 *
 * ISHLATISH:  npm run test:salary-rate
 * ═══════════════════════════════════════════════════════════════════════════
 */
import {
  segmentPeriod,
  baseSegmentsForMonth,
  segmentDays,
} from '../dist/modules/teacher-salary/rate-resolver.js';

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
const eq = (name, actual, expected) =>
  actual === expected ? ok(name, `= ${actual}`) : bad(name, `kutilgan ${expected}, olindi ${actual}`);

const D = (s) => new Date(`${s}T00:00:00.000Z`);

// 2025-mart oynasi (31 kun)
const MAR_START = D("2025-03-01");
const MAR_END_EXCL = D("2025-04-01");

// ───────────────────────────────────────────────────────────────
head("1. LEGACY yozuvlar — pul o'zgarmasligi kerak");

{
  // Eski davr: salaryType="fixed", fixedAmount=1.5 mln (GURUH uchun qat'iy).
  const period = {
    startDate: D("2025-01-01"),
    endDate: null,
    salaryType: "fixed",
    fixedAmount: 1_500_000,
    percentRate: null,
    variableType: null,
  };
  const segs = segmentPeriod(period, [], MAR_START, MAR_END_EXCL);
  eq("bitta segment", segs.length, 1);
  eq("manba legacy deb belgilangan", segs[0].rate.source, "period_legacy");
  eq("eski 'fixed' → per_group kanaliga tushdi", segs[0].rate.perGroup, 1_500_000);
  eq("foiz kanali yoqilmagan", segs[0].rate.percentRate, 0);
  eq("to'liq oy", segmentDays(segs[0]), 31);
}

{
  const period = {
    startDate: D("2025-01-01"),
    endDate: null,
    salaryType: "mixed",
    fixedAmount: 800_000,
    percentRate: 15,
    variableType: null,
  };
  const segs = segmentPeriod(period, [], MAR_START, MAR_END_EXCL);
  eq("mixed → per_group kanali", segs[0].rate.perGroup, 800_000);
  eq("mixed → foiz kanali ham", segs[0].rate.percentRate, 15);
  eq("legacy foiz bazasi 'billed'", segs[0].rate.percentBase, "billed");
}

// ───────────────────────────────────────────────────────────────
head("2. USTUNLIK TARTIBI — guruh davri standartni bekor qiladi");

{
  const comp = [
    {
      _id: "comp1",
      effectiveFrom: D("2025-01-01"),
      effectiveTo: null,
      variableType: "per_student",
      variableRate: 50_000,
      percentBase: "billed",
    },
  ];
  // Davrda O'Z stavkasi bor → standart umuman qaralmaydi.
  const withOverride = {
    startDate: D("2025-01-01"),
    endDate: null,
    variableType: "percent",
    variableRate: 30,
    percentBase: "collected",
    salaryType: null,
  };
  const segs = segmentPeriod(withOverride, comp, MAR_START, MAR_END_EXCL);
  eq("ustunlik yutdi (manba)", segs[0].rate.source, "period");
  eq("foiz stavkasi ustunlikdan", segs[0].rate.percentRate, 30);
  eq("per_student kanali YOQILMAGAN", segs[0].rate.perStudent, 0);
  eq("baza ustunlikdan olindi", segs[0].rate.percentBase, "collected");

  // Davrda stavka yo'q → standartdan meros.
  const inherit = {
    startDate: D("2025-01-01"),
    endDate: null,
    variableType: null,
    salaryType: null,
  };
  const segs2 = segmentPeriod(inherit, comp, MAR_START, MAR_END_EXCL);
  eq("meros olindi (manba)", segs2[0].rate.source, "compensation");
  eq("har o'quvchi uchun 50k", segs2[0].rate.perStudent, 50_000);
}

// ───────────────────────────────────────────────────────────────
head("3. OY O'RTASIDA OSHIRISH — segmentlarga bo'linadi");

{
  // 16-martdan boshlab stavka 50k → 70k.
  const comps = [
    {
      _id: "old",
      effectiveFrom: D("2025-01-01"),
      effectiveTo: D("2025-03-16"),
      variableType: "per_student",
      variableRate: 50_000,
    },
    {
      _id: "new",
      effectiveFrom: D("2025-03-16"),
      effectiveTo: null,
      variableType: "per_student",
      variableRate: 70_000,
    },
  ];
  const period = { startDate: D("2025-01-01"), endDate: null, variableType: null, salaryType: null };
  const segs = segmentPeriod(period, comps, MAR_START, MAR_END_EXCL);

  eq("ikkita segment", segs.length, 2);
  eq("1-segment: 1-16 mart = 15 kun", segmentDays(segs[0]), 15);
  eq("1-segment eski stavka", segs[0].rate.perStudent, 50_000);
  eq("2-segment: 16-31 mart = 16 kun", segmentDays(segs[1]), 16);
  eq("2-segment yangi stavka", segs[1].rate.perStudent, 70_000);
  eq("kunlar yig'indisi = oy", segmentDays(segs[0]) + segmentDays(segs[1]), 31);
}

{
  // TARIXIY ANIQLIK: martdagi oshirish YANVARGA tegmasligi kerak.
  const comps = [
    {
      _id: "old",
      effectiveFrom: D("2025-01-01"),
      effectiveTo: D("2025-03-16"),
      variableType: "per_student",
      variableRate: 50_000,
    },
    {
      _id: "new",
      effectiveFrom: D("2025-03-16"),
      effectiveTo: null,
      variableType: "per_student",
      variableRate: 70_000,
    },
  ];
  const period = { startDate: D("2025-01-01"), endDate: null, variableType: null, salaryType: null };
  const jan = segmentPeriod(period, comps, D("2025-01-01"), D("2025-02-01"));
  eq("yanvarda bitta segment", jan.length, 1);
  eq("yanvar ESKI stavkada qoldi", jan[0].rate.perStudent, 50_000);
}

// ───────────────────────────────────────────────────────────────
head("4. STAVKA YO'Q — jimgina yo'qolmaydi");

{
  const period = { startDate: D("2025-01-01"), endDate: null, variableType: null, salaryType: null };
  const segs = segmentPeriod(period, [], MAR_START, MAR_END_EXCL);
  eq("segment baribir qaytdi", segs.length, 1);
  eq("manba 'none'", segs[0].rate.source, "none");
  eq("barcha kanallar nol", segs[0].rate.perGroup + segs[0].rate.percentRate + segs[0].rate.perStudent + segs[0].rate.perHour, 0);
}

// ───────────────────────────────────────────────────────────────
head("5. MARKAZ FIKSA OYLIGI (base) — guruhlar soniga bog'liq emas");

{
  const comps = [
    {
      _id: "c",
      effectiveFrom: D("2025-01-01"),
      effectiveTo: null,
      baseType: "fixed_monthly",
      baseAmount: 2_000_000,
      branchId: "b1",
    },
  ];
  const segs = baseSegmentsForMonth(comps, 2025, 3);
  eq("bitta base segment", segs.length, 1);
  eq("to'liq oy = 31 kun", segmentDays(segs[0]), 31);
  eq("summa 2 mln (guruh soni ahamiyatsiz)", segs[0].amount, 2_000_000);
}

{
  // Oy o'rtasida ishga olindi (15-mart) → proratsiya.
  const comps = [
    {
      _id: "c",
      effectiveFrom: D("2025-01-01"),
      effectiveTo: null,
      baseType: "fixed_monthly",
      baseAmount: 3_100_000,
      branchId: "b1",
    },
  ];
  const segs = baseSegmentsForMonth(comps, 2025, 3, { from: D("2025-03-15") });
  eq("15-martdan = 17 kun", segmentDays(segs[0]), 17);
  const prorated = Math.round((segs[0].amount * segmentDays(segs[0])) / 31);
  eq("proratsiyalangan summa", prorated, 1_700_000);
}

{
  // Ishdan bo'shadi (10-mart, EXCLUSIVE) → faqat 9 kun.
  const comps = [
    {
      _id: "c",
      effectiveFrom: D("2025-01-01"),
      effectiveTo: null,
      baseType: "fixed_monthly",
      baseAmount: 3_100_000,
      branchId: "b1",
    },
  ];
  const segs = baseSegmentsForMonth(comps, 2025, 3, { toExcl: D("2025-03-10") });
  eq("10-martgacha (exclusive) = 9 kun", segmentDays(segs[0]), 9);
}

{
  // Fiksa qismi yo'q (faqat o'zgaruvchi) → base qatori umuman yaratilmaydi.
  const comps = [
    {
      _id: "c",
      effectiveFrom: D("2025-01-01"),
      effectiveTo: null,
      baseType: "none",
      baseAmount: 0,
      variableType: "percent",
      variableRate: 40,
    },
  ];
  const segs = baseSegmentsForMonth(comps, 2025, 3);
  eq("base segment yo'q", segs.length, 0);
}

// ───────────────────────────────────────────────────────────────
head("6. GURUH OYNASI — kurs tugagach maosh yo'q");

{
  const period = {
    startDate: D("2025-01-01"),
    endDate: null,
    variableType: "per_group",
    variableRate: 500_000,
    salaryType: null,
  };
  // Kurs 10-martda tugadi → oyna 11-martgacha (exclusive).
  const segs = segmentPeriod(period, [], MAR_START, D("2025-03-11"));
  eq("faqat 10 kun", segmentDays(segs[0]), 10);
}

{
  // Davr oydan butunlay tashqarida → segment yo'q.
  const period = {
    startDate: D("2025-05-01"),
    endDate: null,
    variableType: "per_group",
    variableRate: 500_000,
    salaryType: null,
  };
  const segs = segmentPeriod(period, [], MAR_START, MAR_END_EXCL);
  eq("segment yo'q", segs.length, 0);
}


// ═══════════════════════════════════════════════════════════════
// 7. IKKI O'QITUVCHI BIR GURUHDA — KUNLAR BO'YICHA TAQSIMOT
// ═══════════════════════════════════════════════════════════════
// Foydalanuvchi talabi: "10 kun bir o'quvchi(o'qituvchi), 20 kun bir
// o'qituvchi o'tgan guruhga to'g'ri taqsimlanishi lozim".
//
// Sinov: 2025-noyabr (30 kun). A o'qituvchi 1-10 (10 kun), B o'qituvchi
// 11-30 (20 kun). Guruh uchun qat'iy stavka 3 000 000.
// Kutilgan: A = 1 000 000, B = 2 000 000, jami = AYNAN 3 000 000.
head("7. Ikki o'qituvchi bir guruhda — kunlar bo'yicha taqsimot");

{
  const NOV_START = D("2025-11-01");
  const NOV_END_EXCL = D("2025-12-01");
  const RATE = 3_000_000;
  const DAYS_IN_NOV = 30;

  // A: 1-noyabrdan 11-noyabrgacha (EXCLUSIVE) = 10 kun
  const periodA = {
    startDate: D("2025-11-01"),
    endDate: D("2025-11-11"),
    variableType: "per_group",
    variableRate: RATE,
    salaryType: null,
  };
  // B: 11-noyabrdan oy oxirigacha = 20 kun
  const periodB = {
    startDate: D("2025-11-11"),
    endDate: null,
    variableType: "per_group",
    variableRate: RATE,
    salaryType: null,
  };

  const segA = segmentPeriod(periodA, [], NOV_START, NOV_END_EXCL);
  const segB = segmentPeriod(periodB, [], NOV_START, NOV_END_EXCL);

  const daysA = segmentDays(segA[0]);
  const daysB = segmentDays(segB[0]);
  eq("A o'qituvchi kunlari", daysA, 10);
  eq("B o'qituvchi kunlari", daysB, 20);
  eq("kunlar yig'indisi = oy (kun ikki marta sanalmadi)", daysA + daysB, DAYS_IN_NOV);

  // buildSnapshot ichidagi hisob: Math.round(rate * factor)
  const payA = Math.round(RATE * (daysA / DAYS_IN_NOV));
  const payB = Math.round(RATE * (daysB / DAYS_IN_NOV));
  eq("A maoshi (10/30)", payA, 1_000_000);
  eq("B maoshi (20/30)", payB, 2_000_000);
  eq("JAMI = guruh stavkasi (ortiq ham, kam ham emas)", payA + payB, RATE);
}

{
  // KESISHMASLIK INVARIANTI: B ning boshlanishi A ning tugashiga TENG
  // (EXCLUSIVE encoding). Agar kod inklyuziv bo'lganda 11-noyabr ikki
  // marta sanalib, jami 30 emas 31 kun chiqardi va markaz ortiqcha to'lardi.
  const NOV_START = D("2025-11-01");
  const NOV_END_EXCL = D("2025-12-01");
  const a = segmentPeriod(
    { startDate: D("2025-11-01"), endDate: D("2025-11-11"), variableType: "per_group", variableRate: 1, salaryType: null },
    [], NOV_START, NOV_END_EXCL,
  )[0];
  const b = segmentPeriod(
    { startDate: D("2025-11-11"), endDate: null, variableType: "per_group", variableRate: 1, salaryType: null },
    [], NOV_START, NOV_END_EXCL,
  )[0];
  const overlap =
    Math.min(a.endExcl.getTime(), b.endExcl.getTime()) -
    Math.max(a.start.getTime(), b.start.getTime());
  eq("davrlar kesishmaydi (kesishma <= 0)", overlap <= 0, true);
}

{
  // UCHTA o'qituvchi + har birida BOSHQA stavka turi (aralash holat).
  // A: 1-10 per_group 3 mln; B: 11-20 foiz 50%; C: 21-30 per_student 100k
  const NOV_START = D("2025-11-01");
  const NOV_END_EXCL = D("2025-12-01");
  const mk = (s, e, type, rate) => ({
    startDate: D(s),
    endDate: e ? D(e) : null,
    variableType: type,
    variableRate: rate,
    salaryType: null,
  });
  const segs = [
    segmentPeriod(mk("2025-11-01", "2025-11-11", "per_group", 3_000_000), [], NOV_START, NOV_END_EXCL)[0],
    segmentPeriod(mk("2025-11-11", "2025-11-21", "percent", 50), [], NOV_START, NOV_END_EXCL)[0],
    segmentPeriod(mk("2025-11-21", null, "per_student", 100_000), [], NOV_START, NOV_END_EXCL)[0],
  ];
  eq("A kunlari", segmentDays(segs[0]), 10);
  eq("B kunlari", segmentDays(segs[1]), 10);
  eq("C kunlari", segmentDays(segs[2]), 10);
  eq("jami 30 kun", segs.reduce((s, x) => s + segmentDays(x), 0), 30);
  eq("A kanali per_group", segs[0].rate.perGroup, 3_000_000);
  eq("B kanali foiz", segs[1].rate.percentRate, 50);
  eq("C kanali per_student", segs[2].rate.perStudent, 100_000);
  // Har biri FAQAT o'z kanalini yoqadi - aralashib ketmaydi.
  eq("A da foiz yo'q", segs[0].rate.percentRate, 0);
  eq("C da per_group yo'q", segs[2].rate.perGroup, 0);
}


// ═══════════════════════════════════════════════════════════════
// 8. KESISHUVDAN HIMOYA (regressiya)
// ═══════════════════════════════════════════════════════════════
// Topilgan bug: amendCompensation effectiveFrom ni erkin o'zgartirardi va
// yopilgan davr ustiga surib yuborish mumkin edi. Natijada bir kun IKKI
// stavkaga tegishli bo'lib, 2 mln lik oylik 4 mln bo'lib chiqardi.
//
// Ikki qatlam himoya qo'yildi:
//   1. servis: assertNoOverlap (yozishni rad etadi)
//   2. hisoblash: segmentlar kesishmaydigan qilib qirqiladi
// Bu blok IKKINCHI qatlamni tekshiradi - buzuq ma'lumot bazada
// allaqachon bor bo'lsa ham pul ikki barobar bo'lmasligi kerak.
head("8. Kesishgan stavkalar — hisoblash qatlami himoyasi");

{
  const NOV_START = D("2025-11-01");
  const NOV_END_EXCL = D("2025-12-01");
  // A: yanvar–dekabr, B: noyabrdan ochiq → noyabrda TO'LIQ kesishadi
  const comps = [
    { _id: "A", effectiveFrom: D("2025-01-01"), effectiveTo: D("2025-12-01"),
      variableType: "per_group", variableRate: 1_000_000 },
    { _id: "B", effectiveFrom: D("2025-11-01"), effectiveTo: null,
      variableType: "per_group", variableRate: 1_000_000 },
  ];
  const period = { startDate: D("2025-01-01"), endDate: null, variableType: null, salaryType: null };
  const segs = segmentPeriod(period, comps, NOV_START, NOV_END_EXCL);
  const days = segs.reduce((s, x) => s + segmentDays(x), 0);
  eq("kunlar oydan oshmadi", days, 30);
  eq("kesishgan qism ERTAROQ stavkaga tegishli", segs[0].rate.compensationId, "A");
}

{
  // FIKSA oylik - kesishuv to'g'ridan-to'g'ri oylikni ikki barobar qilardi.
  const comps = [
    { _id: "A", effectiveFrom: D("2025-01-01"), effectiveTo: D("2025-12-01"),
      baseType: "fixed_monthly", baseAmount: 2_000_000, branchId: "b1" },
    { _id: "B", effectiveFrom: D("2025-11-01"), effectiveTo: null,
      baseType: "fixed_monthly", baseAmount: 2_000_000, branchId: "b1" },
  ];
  const segs = baseSegmentsForMonth(comps, 2025, 11);
  const days = segs.reduce((s, x) => s + segmentDays(x), 0);
  const pay = segs.reduce((s, x) => s + Math.round((x.amount * segmentDays(x)) / 30), 0);
  eq("base kunlari oydan oshmadi", days, 30);
  eq("oylik ikki barobar BO'LMADI", pay, 2_000_000);
}

{
  // QISMAN kesishuv: A 1-20 noyabr, B 10-noyabrdan.
  // Kutilgan: A 1-20 (19 kun... aslida 1-10 = 9 kun A, keyin B 10-30).
  const comps = [
    { _id: "A", effectiveFrom: D("2025-11-01"), effectiveTo: D("2025-11-21"),
      variableType: "per_group", variableRate: 500_000 },
    { _id: "B", effectiveFrom: D("2025-11-10"), effectiveTo: null,
      variableType: "per_group", variableRate: 900_000 },
  ];
  const period = { startDate: D("2025-01-01"), endDate: null, variableType: null, salaryType: null };
  const segs = segmentPeriod(period, comps, D("2025-11-01"), D("2025-12-01"));
  const days = segs.reduce((s, x) => s + segmentDays(x), 0);
  eq("qisman kesishuvda ham 30 kun", days, 30);
  eq("A birinchi 20 kunni oldi", segmentDays(segs[0]), 20);
  eq("B qolgan 10 kunni oldi", segmentDays(segs[1]), 10);
}

// ───────────────────────────────────────────────────────────────
console.log(
  `\n\x1b[1mNatija:\x1b[0m \x1b[32m${R.pass} o'tdi\x1b[0m, ${
    R.fail ? `\x1b[31m${R.fail} yiqildi\x1b[0m` : "0 yiqildi"
  }`,
);
if (R.fail) {
  console.log("\n\x1b[31mYiqilganlar:\x1b[0m");
  for (const f of R.failures) console.log(`  • ${f}`);
  process.exit(1);
}
