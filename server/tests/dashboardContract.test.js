/**
 * RAHBARIYAT PANELI ↔ SERVER KONTRAKTI.
 *
 * ═══════════════════════════════════════════════════════════════════
 * NEGA BU TEST BOR
 *
 * `/admin` qobig'i yozilganda brauzerda ikkita 500 chiqdi va tekshiruv
 * ular ORTIDA yana beshta jimgina nomuvofiqlik borligini ko'rsatdi:
 * yo'q maydon nomlari, qabul qilinmaydigan query parametrlari, massiv
 * o'rniga konvert uzatilishi. Ularning HECH BIRI build yoki lint bilan
 * tutilmasdi - hammasi faqat ishlab turgan brauzerda ko'rinardi.
 *
 * Bu test aynan shu bo'shliqni yopadi: u HAQIQIY HTTP so'rov yuboradi
 * va javobning SHAKLINI tekshiradi. Mock yo'q.
 *
 * TEST NIMANI TEKSHIRMAYDI: qiymatlarning TO'G'RILIGINI. "Tushum 12
 * mln bo'lishi kerak" degan da'vo bu yerda yo'q - u ma'lumotga bog'liq
 * va har bazada boshqacha. Tekshiriladigan narsa KONTRAKT: maydon bor,
 * turi to'g'ri, konvert kutilgan shaklda.
 * ═══════════════════════════════════════════════════════════════════
 *
 * ISHLATISH:  npm run test:dashboard-contract
 *   Server ISHLAB TURISHI shart (npm run dev).
 */
import "dotenv/config";
import prisma from "../src/config/prisma.js";
import { signAccess } from "../src/utils/jwt.js";

const BASE = process.env.CONTRACT_BASE_URL || "http://localhost:5000/api";

const R = { pass: 0, fail: 0 };
const ok = (n, extra = "") => {
  R.pass += 1;
  console.log(`  ✅ ${n}${extra ? ` — ${extra}` : ""}`);
};
const bad = (n, extra = "") => {
  R.fail += 1;
  console.log(`  ❌ ${n}${extra ? ` — ${extra}` : ""}`);
};

let TOKEN = null;

const call = async (path, { token = TOKEN, method = "GET" } = {}) => {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }
  return { status: res.status, body };
};

/**
 * Endpoint kutilgan HOLAT KODINI beradimi.
 *
 * `expected` massiv bo'lishi mumkin: ko'chirilmagan modul 501 beradi,
 * ko'chgach 200 - ikkalasi ham TO'G'RI. Test modul ko'chganda
 * yiqilmasligi kerak (aks holda uni kim ko'chirsa, testni ham
 * "tuzatishga" majbur bo'lardi va tekshiruv ma'nosini yo'qotardi).
 */
const expectStatus = async (name, path, expected, opts) => {
  const list = Array.isArray(expected) ? expected : [expected];
  try {
    const { status, body } = await call(path, opts);
    if (!list.includes(status)) {
      bad(name, `HTTP ${status} (kutilgan: ${list.join(" yoki ")}) ${body?.message || ""}`);
      return null;
    }
    ok(name, `HTTP ${status}${body?.code ? ` ${body.code}` : ""}`);
    return { status, body };
  } catch (err) {
    bad(name, err.message);
    return null;
  }
};

/** Javob konverti `{ success, data }` shaklidami. */
const expectEnvelope = (name, res) => {
  if (!res) return null;
  const { body } = res;
  if (body?.success !== true) return bad(name, "success !== true"), null;
  if (!("data" in body)) return bad(name, "`data` maydoni yo'q"), null;
  ok(name);
  return body.data;
};

/** Obyektda kutilgan maydonlar bormi va turi to'g'rimi. */
const expectShape = (name, obj, spec) => {
  if (obj === null || obj === undefined) return bad(name, "obyekt yo'q");
  const problems = [];
  for (const [key, kind] of Object.entries(spec)) {
    const v = obj[key];
    const nullable = kind.endsWith("?");
    const base = nullable ? kind.slice(0, -1) : kind;
    if (v === null || v === undefined) {
      if (!nullable) problems.push(`${key} yo'q`);
      continue;
    }
    const actual = Array.isArray(v) ? "array" : typeof v;
    if (actual !== base) problems.push(`${key}: ${actual} (kutilgan ${base})`);
  }
  if (problems.length) bad(name, problems.join("; "));
  else ok(name);
};

const run = async () => {
  console.log("\n=== RAHBARIYAT PANELI ↔ SERVER KONTRAKTI ===\n");

  // Server tirikmi - aks holda hamma test bir xil sababdan yiqiladi
  // va haqiqiy muammo ko'rinmay qoladi.
  try {
    const h = await fetch(`${BASE}/health`);
    if (!h.ok) throw new Error(`health ${h.status}`);
  } catch (err) {
    console.error(
      `\nSERVER JAVOB BERMADI (${BASE}).\n` +
        `Avval ishga tushiring: cd server && npm run dev\n` +
        `Xato: ${err.message}\n`,
    );
    process.exit(1);
  }

  const owner = await prisma.user.findFirst({
    where: { role: "owner" },
    select: { id: true, role: true },
  });
  if (!owner) {
    console.error("Bazada owner yo'q - `npm run db:reset` bajaring.");
    process.exit(1);
  }
  TOKEN = signAccess({ id: owner.id, sub: owner.id, role: owner.role });

  const now = new Date();
  const Y = now.getUTCFullYear();
  const M = now.getUTCMonth() + 1;

  // ══ 1) AUTENTIFIKATSIYA (PHASE 9) ══════════════════════════════
  console.log("1) autentifikatsiya va holat kodlari");

  await expectStatus(
    "tokensiz so'rov 401 beradi (403 EMAS)",
    "/admin-dashboard/overview",
    401,
    { token: null },
  );
  await expectStatus(
    "yaroqsiz token 401 beradi",
    "/admin-dashboard/overview",
    401,
    { token: "aniq.yaroqsiz.token" },
  );
  await expectStatus(
    "mavjud bo'lmagan manzil 404 beradi",
    "/admin-dashboard/bunday-narsa-yoq",
    404,
  );

  // ══ 2) OVERVIEW ════════════════════════════════════════════════
  console.log("\n2) /admin-dashboard/overview");

  const ovRes = await expectStatus(
    "marshrut mavjud va 200 qaytaradi",
    `/admin-dashboard/overview?year=${Y}&month=${M}`,
    200,
  );
  const ov = expectEnvelope("konvert { success, data }", ovRes);

  // MAYDONLAR - `/admin` KPI plitalari AYNAN shularni o'qiydi.
  // Bittasi nomi o'zgarsa plita jimgina "Ma'lumot yo'q" bo'lib qolardi.
  expectShape("KPI maydonlari mavjud va son turida", ov, {
    studentsCount: "number",
    teachersCount: "number",
    activeGroupsCount: "number",
    newStudentsThisMonth: "number",
    lostStudentsThisMonth: "number",
    netGrowth: "number",
    revenueThisMonth: "number",
    revenueLastMonth: "number",
    paymentsCount: "number",
    // O'tgan oy tushumi nol bo'lsa server `null` qaytaradi -
    // "0%" EMAS. Shuning uchun nullable.
    revenueDelta: "number?",
    attendanceGauge: "object",
    // Bugun dars bo'lmasa `null` (o'lchanmadi).
    todayAttendanceRate: "number?",
    recentPayments: "array",
    topTeachers: "array",
  });

  expectShape("attendanceGauge shakli", ov?.attendanceGauge, {
    rate: "number?",
    present: "number",
    late: "number",
    absent: "number",
    total: "number",
  });

  // ══ 3) CASHFLOW - DAVR KONTRAKTI (PHASE 10) ════════════════════
  console.log("\n3) /admin-dashboard/cashflow (davr)");

  const cfRes = await expectStatus(
    "davrsiz chaqiruv ishlaydi (orqaga moslik)",
    "/admin-dashboard/cashflow?range=month",
    200,
  );
  const cf = expectEnvelope("konvert { success, data }", cfRes);
  expectShape("javob { range, buckets }", cf, {
    range: "string",
    buckets: "array",
  });
  if (cf?.buckets?.[0]) {
    expectShape("bucket { label, income, expense }", cf.buckets[0], {
      label: "string",
      income: "number",
      expense: "number",
    });
  }

  // DAVRNI HURMAT QILADIMI. Bu tuzatishning O'ZAK testi: ilgari
  // `year`/`month` jimgina tashlab yuborilardi va grafik har doim
  // JORIY oyni ko'rsatardi - yonidagi KPI esa tanlangan oyni.
  await (async () => {
    const name = "tanlangan oy HURMAT QILINADI (kun soni mos keladi)";
    // 2025-02 -> 28 kun, 2025-01 -> 31 kun. Ikkalasi ham joriy oydan
    // farq qilishi mumkin, shuning uchun ikkitasini solishtiramiz.
    const feb = await call("/admin-dashboard/cashflow?range=month&year=2025&month=2");
    const jan = await call("/admin-dashboard/cashflow?range=month&year=2025&month=1");
    const nFeb = feb.body?.data?.buckets?.length;
    const nJan = jan.body?.data?.buckets?.length;
    if (nFeb === 28 && nJan === 31) ok(name, `fevral ${nFeb}, yanvar ${nJan} kun`);
    else bad(name, `fevral ${nFeb} (28 kutilgan), yanvar ${nJan} (31 kutilgan)`);
  })();

  await (async () => {
    const name = "range=year 12 oylik bucket beradi";
    const r = await call("/admin-dashboard/cashflow?range=year&year=2025");
    const n = r.body?.data?.buckets?.length;
    if (n === 12) ok(name);
    else bad(name, `${n} bucket (12 kutilgan)`);
  })();

  await expectStatus(
    "yaroqsiz range 400 beradi (jimgina qabul QILMAYDI)",
    "/admin-dashboard/cashflow?range=asr",
    400,
  );
  await expectStatus(
    "yaroqsiz oy 400 beradi",
    "/admin-dashboard/cashflow?range=month&year=2025&month=13",
    400,
  );

  // ══ 4) STUDENT FLOW ════════════════════════════════════════════
  console.log("\n4) /admin-dashboard/student-flow");

  const sfRes = await expectStatus(
    "marshrut mavjud",
    "/admin-dashboard/student-flow?months=6",
    200,
  );
  const sf = expectEnvelope("konvert { success, data }", sfRes);
  if (Array.isArray(sf)) {
    ok("javob MASSIV (konvert emas)");
    if (sf[0]) {
      expectShape("element { year, month, joined, left, netGrowth }", sf[0], {
        year: "number",
        month: "number",
        joined: "number",
        left: "number",
        netGrowth: "number",
      });
    }
  } else {
    bad("javob MASSIV (konvert emas)", `turi: ${typeof sf}`);
  }

  // ══ 5) KO'CHIRILMAGAN MODULLAR (PHASE 7) ═══════════════════════
  console.log("\n5) ko'chirilmagan modullar — 501, 500 EMAS");

  // ENG MUHIM TEKSHIRUV. Ilgari bular 10 SONIYA osilib, keyin 500
  // berardi (Mongoose buferi). Endi darhol 501 qaytaradi va
  // rahbariyat paneli "Manba ulanmagan" degan xotirjam holatni
  // ko'rsatadi - qizil xato emas.
  //
  // Modul ko'chgach 200 beradi va test BARIBIR o'tadi.
  // `/branch-analytics/pnl` va `/finance-report/*` WAVE 4 DA
  // KO'CHIRILDI - ular endi 200 beradi va shu ro'yxatdan chiqarildi.
  // Ro'yxat "hali ko'chirilmagan" modullarni qayd etadi; modul
  // ko'chgach uni bu yerdan olib tashlash kerak, aks holda test
  // kelajakda ham 501 kutib turaverardi.
  for (const [name, path] of [
    ["/ai/insights", "/ai/insights?limit=4"],
    ["/ai/briefing", "/ai/briefing"],
  ]) {
    const res = await expectStatus(`${name} 501 yoki 200 (500 EMAS)`, path, [501, 200]);
    if (res?.status === 501) {
      if (res.body?.code === "MODULE_NOT_MIGRATED") {
        ok(`${name} sababi ANIQ (MODULE_NOT_MIGRATED)`);
      } else {
        bad(`${name} sababi ANIQ`, `code=${res.body?.code}`);
      }
    }
  }

  await (async () => {
    const name = "501 TEZ qaytadi (osilmaydi)";
    const t0 = Date.now();
    await call("/ai/insights?limit=4");
    const ms = Date.now() - t0;
    // Mongoose buferi 10 000 ms edi. 2000 ms - keng zaxira.
    if (ms < 2000) ok(name, `${ms} ms`);
    else bad(name, `${ms} ms — bufer yana yoqilganga o'xshaydi`);
  })();

  // ══ 6) MAVJUD BO'LMAGAN MANZILLAR (PHASE 11) ═══════════════════
  console.log("\n6) mavjud bo'lmagan manzillar");

  // `/finance-report` (pastki manzilsiz) marshrut EMAS. Frontend
  // ilgari aynan shuni chaqirardi. Test uni qayd etib turadi:
  // kimdir yana shu manzilni yozsa, sababi darhol ko'rinadi.
  await expectStatus("/finance-report (pastki manzilsiz) 404", "/finance-report", 404);

  // ══ 6b) MOLIYA HISOBOTI (wave 4 da ko'chirildi) ════════════════
  console.log("\n6b) /finance-report/* — shakl kontrakti");

  const frSummary = await expectStatus(
    "summary 200",
    `/finance-report/summary?year=${Y}&month=${M}`,
    200,
  );
  const fr = expectEnvelope("konvert { success, data }", frSummary);
  if (fr) {
    // Rahbariyat paneli shu maydonlarni o'qiydi. Bittasi nomi
    // o'zgarsa karta jimgina "Ma'lumot yo'q" bo'lib qolardi.
    // Shakl SERVERDAN olindi (taxmin emas):
    // { period, income, expense, netProfit, netProfitDelta, margin,
    //   accrual, paymentMethods }
    expectShape("summary bo'limlari", fr, {
      period: "object",
      income: "object",
      expense: "object",
      netProfit: "number",
      // O'tgan oy nolga teng bo'lsa `null` - "0%" EMAS.
      netProfitDelta: "number?",
      margin: "number?",
      accrual: "object",
      paymentMethods: "object",
    });

    // `income` - o'quvchi to'lovlari kesimi. `billed`/`outstanding`/
    // `badDebt` xom SQL bilan hisoblanadi (studentBilledStats).
    expectShape("income (collected/billed/outstanding/badDebt)", fr.income, {
      collected: "number",
      billed: "number",
      outstanding: "number",
      badDebt: "number",
      rate: "number?",
      count: "number",
    });

    // `expense.billed`/`outstanding` - o'qituvchi maoshi kesimi
    // (teacherBilledStats). `badDebt` bu yerda YO'Q va bo'lmasligi
    // ham kerak: `teacher_salaries` da `writtenOff` ustuni mavjud
    // emas, ya'ni maosh uchun "yomon qarz" tushunchasi yo'q.
    expectShape("expense (paid/billed/outstanding/byKind)", fr.expense, {
      paid: "number",
      billed: "number",
      outstanding: "number",
      salaryPaid: "number",
      staffSalaryPaid: "number",
      operatingAccrued: "number",
      byKind: "object",
      capital: "number",
    });

    expectShape("accrual (revenue/expense/profit)", fr.accrual, {
      revenue: "number",
      expense: "number",
      profit: "number",
      margin: "number?",
    });

    expectShape("paymentMethods (cash/card)", fr.paymentMethods, {
      cash: "number",
      card: "number",
    });
  }

  await (async () => {
    const name = "trend MASSIV qaytaradi";
    const r = await call("/finance-report/trend?months=6");
    const d = r.body?.data;
    if (r.status === 200 && Array.isArray(d)) ok(name, `${d.length} oy`);
    else bad(name, `HTTP ${r.status}, turi: ${Array.isArray(d) ? "array" : typeof d}`);
  })();

  for (const [name, path] of [
    ["group-breakdown", `/finance-report/group-breakdown?year=${Y}&month=${M}`],
    ["ledger", `/finance-report/ledger?year=${Y}&month=${M}`],
    ["write-offs", `/finance-report/write-offs?year=${Y}&month=${M}`],
  ]) {
    await expectStatus(`${name} 200`, path, 200);
  }

  // ══ 7) PAGINATION KONTRAKTI (PHASE 5) ══════════════════════════
  console.log("\n7) pagination kontrakti — ?page&limit -> meta");

  // Kanonik konvensiya: `utils/pagination.js` (33 modul shuni
  // ishlatadi). `pageSize` / `offset` / `cursor` KODBAZADA YO'Q.
  const pg = await call("/users?page=1&limit=5");
  if (pg.status === 200) {
    const m = pg.body?.meta;
    expectShape("meta { page, limit, total, pages }", m, {
      page: "number",
      limit: "number",
      total: "number",
      pages: "number",
    });
    if (Array.isArray(pg.body?.data) && pg.body.data.length <= 5) {
      ok("`limit` hurmat qilinadi");
    } else {
      bad("`limit` hurmat qilinadi", `${pg.body?.data?.length} ta element`);
    }
  } else {
    bad("pagination namunasi (/users)", `HTTP ${pg.status}`);
  }

  await (async () => {
    const name = "`pageSize` QABUL QILINMAYDI (kanonik nom - `limit`)";
    const r = await call("/users?page=1&pageSize=5");
    // Noma'lum parametr jimgina e'tiborsiz qoldiriladi - lekin
    // `limit` standart qiymatda (20) qolishi kerak, ya'ni `pageSize`
    // ISHLAMAYDI. Buni ochiq qayd etamiz.
    if (r.status === 200 && r.body?.meta?.limit === 20) ok(name, "limit=20 (standart)");
    else if (r.status === 200) bad(name, `limit=${r.body?.meta?.limit} — kutilmagan`);
    else bad(name, `HTTP ${r.status}`);
  })();

  // ══ 8) FILIAL KO'LAMI (PHASE 8) ════════════════════════════════
  console.log("\n8) filial ko'lami — mijozga ISHONILMAYDI");

  await (async () => {
    const name = "begona ?branchId dashboard raqamlarini O'ZGARTIRMAYDI";
    // Filial ko'lami SERVERDA, AsyncLocalStorage konteksti orqali
    // aniqlanadi (branchContext.helper.js) - query parametridan EMAS.
    // Ya'ni qo'lda yozilgan `branchId` javobga ta'sir qilmasligi kerak.
    const clean = await call(`/admin-dashboard/overview?year=${Y}&month=${M}`);
    const spoofed = await call(
      `/admin-dashboard/overview?year=${Y}&month=${M}&branchId=6a80cc3efb4c5110ae1d32b9`,
    );
    if (clean.status !== 200 || spoofed.status !== 200) {
      bad(name, `HTTP ${clean.status}/${spoofed.status}`);
    } else if (clean.body.data.studentsCount === spoofed.body.data.studentsCount) {
      ok(name, "natija bir xil");
    } else {
      bad(name, "branchId javobni o'zgartirdi — mijoz ko'lamni boshqarmoqda");
    }
  })();

  console.log(`\n=== NATIJA: ${R.pass} o'tdi, ${R.fail} yiqildi ===\n`);
};

run()
  .catch((err) => {
    console.error("\nTEST YIQILDI:", err);
    R.fail += 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(R.fail ? 1 : 0);
  });
