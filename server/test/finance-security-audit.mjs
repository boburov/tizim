/**
 * MOLIYA ISHLAB CHIQARISHGA TAYYORLIK AUDITI.
 *
 * Bu test emas — TEKSHIRUV RO'YXATI. U ishlab turgan serverga
 * HAQIQIY HTTP so'rovlar yuboradi va chegaralar amalda ishlashini
 * tasdiqlaydi. Kod o'qish bilan emas, xatti-harakat bilan.
 *
 * ISHLATISH:  node tests/financeSecurityAudit.mjs
 */
// ⚠ `dotenv` OLIB TASHLANDI (2026-08-25): u Express paketi edi va
//   `server/` bog'liqliklarida YO'Q. Muhit endi Node'ning o'zidan
//   keladi — `node --env-file=.env ...` (npm skriptlari shunday
//   chaqiradi).

const API = process.env.API || "http://localhost:5000/api";
const R = { pass: 0, fail: 0, warn: 0, failures: [] };
const ok = (n, e = "") => { R.pass += 1; console.log(`  ✅ ${n}${e ? ` — ${e}` : ""}`); };
const bad = (n, e = "") => { R.fail += 1; R.failures.push(`${n} — ${e}`); console.log(`  ❌ ${n} — ${e}`); };
const warn = (n, e = "") => { R.warn += 1; console.log(`  ⚠️  ${n}${e ? ` — ${e}` : ""}`); };
const head = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

/**
 * ⚠ AUDIT MOLIYAVIY QOLDIQ QOLDIRARDI.
 *
 * 6-bo'lim (idempotentlik) DEMO filialida HAQIQIY ichki o'tkazma
 * yozadi — 1 000 so'm, `cash → bank`. Bu ATAYLAB shunday: idempotentlik
 * faqat haqiqiy yozuv ustida isbotlanadi, "muvaffaqiyatli HTTP javob"
 * bilan emas.
 *
 * Lekin audit hech narsani TOZALAMASDI. Har ishga tushirish DEMO
 * filialining jurnaliga bitta yozuv qo'shardi va u abadiy qolardi:
 * tekshirilgan bazada 3 ta shunday yozuv topildi
 * (`account_transfer:audit-idem-…`). Audit — chiqarishdan oldingi
 * OXIRGI darvoza, ya'ni u eng ko'p ishga tushiriladigan skript.
 *
 * Yozuv o'zgarmas, LEKIN o'chirilishi mumkin (`config/prisma.js` dagi
 * izohga qarang: to'siq TAHRIRGA qo'yilgan, o'chirish esa KO'RINADI).
 * Shuning uchun audit o'zi yozgan yozuvni o'zi olib tashlaydi.
 */
const MADE = { postingKeys: [], references: [] };

const cleanup = async () => {
  if (!MADE.postingKeys.length) return;
  // ⚠ Express klienti o'rniga NestJS kengaytirilgan klienti (2026-08-25).
  const { createExtendedPrismaClient } = await import("../dist/prisma/prisma.service.js");
  const prisma = createExtendedPrismaClient();
  try {
    const entries = await prisma.journalEntry.findMany({
      where: { postingKey: { in: MADE.postingKeys } },
      select: { id: true },
    });
    const ids = entries.map((e) => e.id);
    if (ids.length) {
      await prisma.journalLine.deleteMany({ where: { entryId: { in: ids } } });
      await prisma.journalEntry.deleteMany({ where: { id: { in: ids } } });
    }
    // Audit izida `postingKey` YO'Q — u hujjat bilan bog'lanadi
    // (`entityType` + `entityId`). O'tkazma uchun `entityId` —
    // idempotentlik kalitining O'ZI (qarang: `postTransfer`).
    await prisma.financialAuditLog.deleteMany({
      where: { entityType: "AccountTransfer", entityId: { in: MADE.references } },
    }).catch(() => {});
    console.log(`\n  🧹 tozalandi: ${ids.length} jurnal yozuvi`);
  } catch (e) {
    console.error("  ⚠ tozalash xatosi:", e.message);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
};

const login = async (l, p) => {
  const r = await fetch(`${API}/auth/login`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ login: l, password: p }),
  });
  const j = await r.json().catch(() => ({}));
  return j?.data?.accessToken || null;
};
const get = (path, token, headers = {}) =>
  fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token}`, ...headers } });
const post = (path, token, body, headers = {}) =>
  fetch(`${API}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });

const run = async () => {
  console.log("\n=== MOLIYA XAVFSIZLIK / TAYYORLIK AUDITI ===\n");

  const owner = await login("owner", "owner123");
  if (!owner) { bad("owner login", "server ishlayaptimi?"); return; }
  const readOnly = await login("demo_qa_read", "qa123456");
  const profitNoPayroll = await login("demo_qa_profit", "qa123456");
  const acctOnly = await login("demo_qa_acct", "qa123456");

  const branches = await (await get("/branches", owner)).json();
  const demo = (branches.data || []).find((b) => String(b.name).startsWith("DEMO"));
  const BID = demo?.id;

  // ══════════ 1) RUXSATSIZ KIRISH ══════════
  head("1) Autentifikatsiyasiz kirish");
  for (const p of ["/finance-analytics/summary", "/finance-analytics/intelligence",
    "/finance-analytics/entries", "/finance-ops/budgets"]) {
    const r = await fetch(`${API}${p}`);
    if (r.status === 401) ok(`${p} → 401`);
    else bad(`${p} → 401 kutilgan`, String(r.status));
  }

  // ══════════ 2) RUXSAT SIZISHI ══════════
  head("2) Ruxsat chegaralari");
  const matrix = [
    ["finance.read only", readOnly, [
      ["/finance-analytics/summary", 200], ["/finance-analytics/teachers", 403],
      ["/finance-analytics/cash-flow", 403], ["/finance-analytics/receivables", 403],
      ["/finance-analytics/intelligence", 200],
    ]],
    ["profitability, maoshsiz", profitNoPayroll, [
      ["/finance-analytics/directions", 200], ["/finance-analytics/teachers", 403],
      ["/finance-analytics/cash-flow", 200],
    ]],
  ];
  for (const [label, token, checks] of matrix) {
    for (const [path, expect] of checks) {
      const r = await get(path, token);
      if (r.status === expect) ok(`${label}: ${path} → ${expect}`);
      else bad(`${label}: ${path} → ${expect} kutilgan`, String(r.status));
    }
  }

  // ══════════ 3) MAOSH SIZISHI ══════════
  head("3) Maosh ma'lumoti sizishi");
  const entries = await (await get("/finance-analytics/entries?limit=100", owner)).json();
  const salaryEntry = (entries.data || []).find((e) => e.kind === "salary");
  if (salaryEntry) {
    const r = await get(`/finance-analytics/entries/${salaryEntry.id}`, readOnly);
    if (r.status === 403) ok("maosh yozuvi tafsiloti → 403");
    else bad("maosh yozuvi tafsiloti → 403 kutilgan", String(r.status));

    const list = await (await get("/finance-analytics/entries?limit=100", readOnly)).json();
    const leaked = (list.data || []).filter((e) => e.kind === "salary");
    if (leaked.length === 0) ok("maosh yozuvlari ro'yxatdan chiqarilgan");
    else bad("maosh yozuvlari ro'yxatdan chiqarilgan", `${leaked.length} ta ko'rindi`);
  } else warn("maosh yozuvi topilmadi — sinov o'tkazib yuborildi");

  const intelRead = await (await get("/finance-analytics/intelligence", readOnly)).json();
  const teacherSignals = (intelRead.data?.alerts || []).filter((a) => a.type === "teacher_risk");
  if (teacherSignals.length === 0) ok("intellektda o'qituvchi signali yo'q");
  else bad("intellektda o'qituvchi signali yo'q", `${teacherSignals.length} ta`);
  const raw = JSON.stringify(intelRead.data || {});
  if (!/payroll|salary/i.test(raw)) ok("intellekt javobida maosh atamalari yo'q");
  else warn("intellekt javobida 'salary/payroll' so'zi uchradi", "sabab matnida bo'lishi mumkin");

  // ══════════ 4) RUXSATSIZ MOLIYAVIY MUTATSIYA ══════════
  head("4) Ruxsatsiz moliyaviy amal");
  const mutations = [
    ["/finance-ops/transfers", { fromMethod: "cash", toMethod: "bank", amount: 1000, idempotencyKey: "audit-x1" }],
    ["/finance-ops/owner-capital", { direction: "investment", amount: 1000, method: "cash", idempotencyKey: "audit-x2" }],
    ["/finance-ops/refunds", { studentId: "a".repeat(24), amount: 1000, method: "cash", reason: "audit" }],
    ["/finance-ops/budgets", { year: 2030, month: 1, lines: [] }],
  ];
  for (const [path, body] of mutations) {
    const r = await post(path, readOnly, body, BID ? { "x-branch-id": BID } : {});
    if (r.status === 403) ok(`finance.read → ${path} → 403`);
    else bad(`finance.read → ${path} → 403 kutilgan`, String(r.status));
  }
  if (acctOnly) {
    const r = await post("/finance-ops/owner-capital", acctOnly,
      { direction: "investment", amount: 1000, method: "cash", idempotencyKey: "audit-x3" },
      BID ? { "x-branch-id": BID } : {});
    if (r.status === 403) ok("manage_accounts → owner-capital → 403 (alohida ruxsat)");
    else bad("manage_accounts → owner-capital → 403 kutilgan", String(r.status));
  }

  // ══════════ 5) «BARCHA FILIALLAR» YOZISHNI TO'SADI ══════════
  head("5) «Barcha filiallar» rejimida yozish");
  const r5 = await post("/finance-ops/transfers", owner,
    { fromMethod: "cash", toMethod: "bank", amount: 1000, idempotencyKey: "audit-all-1" });
  if (r5.status === 400) ok("filialsiz o'tkazma → 400");
  else bad("filialsiz o'tkazma → 400 kutilgan", String(r5.status));

  // ══════════ 6) IDEMPOTENTLIK ══════════
  head("6) Takroriy yuborish");
  if (BID) {
    const key = `audit-idem-${Date.now()}`;
    // Yozuv YARATILISHIDAN OLDIN ro'yxatga olinadi — so'rov yarim
    // yo'lda uzilsa ham (javob kelmasa-yu yozuv yozilgan bo'lsa)
    // tozalash uni topadi.
    MADE.postingKeys.push(`account_transfer:${key}`);
    MADE.references.push(key);
    const body = { fromMethod: "cash", toMethod: "bank", amount: 1000, idempotencyKey: key };
    const a = await (await post("/finance-ops/transfers", owner, body, { "x-branch-id": BID })).json();
    const b = await (await post("/finance-ops/transfers", owner, body, { "x-branch-id": BID })).json();
    if (a?.data?.entryId && a.data.entryId === b?.data?.entryId && b?.data?.duplicate) {
      ok("bir xil kalit → bitta yozuv", a.data.entryId.slice(0, 10));
    } else bad("bir xil kalit → bitta yozuv", JSON.stringify(b?.data || {}));
  }

  // ══════════ 7) FILIAL KO'LAMI ══════════
  head("7) Filial ko'lami");
  if (BID) {
    const other = (branches.data || []).find((b) => b.id !== BID);
    if (other) {
      const scoped = await (await get(`/finance-analytics/summary?branchId=${other.id}`, owner)).json();
      const demoScoped = await (await get(`/finance-analytics/summary?branchId=${BID}`, owner)).json();
      if (scoped.data?.revenue?.current !== demoScoped.data?.revenue?.current) {
        ok("filial filtri raqamni o'zgartiradi");
      } else warn("filial filtri", "ikkala filialda bir xil raqam (ma'lumot yo'q bo'lishi mumkin)");
    }
    // Begona filial yozuvi ko'rinmaydi
    const e = (entries.data || [])[0];
    if (e) {
      const otherB = (branches.data || []).find((b) => b.id !== BID);
      if (otherB) {
        const r = await get(`/finance-analytics/entries/${e.id}`, owner, { "x-branch-id": otherB.id });
        if (r.status === 404) ok("begona filial yozuvi → 404");
        else bad("begona filial yozuvi → 404 kutilgan", String(r.status));
      }
    }
  }

  // ══════════ 8) XOM XATO SIZISHI ══════════
  head("8) Xom server xatosi ko'rinmaydi");
  const r8 = await get("/finance-analytics/entries/000000000000000000000000", owner);
  const j8 = await r8.json().catch(() => ({}));
  const msg = j8?.message || "";
  if (/prisma|sql|stack|at Object|node_modules/i.test(msg)) {
    bad("xom xato sizmaydi", msg.slice(0, 80));
  } else ok("xom xato sizmaydi", msg.slice(0, 45));

  // ══════════ 9) NULL / NOL SEMANTIKASI ══════════
  head("9) Null va nol semantikasi");
  const empty = await (await get("/finance-analytics/summary?year=2000&month=1", owner)).json();
  const d9 = empty.data || {};
  if (d9.revenue?.current === 0) ok("bo'sh davr daromadi 0 (raqam)");
  else bad("bo'sh davr daromadi 0", String(d9.revenue?.current));
  if (d9.revenue?.changePercent === null) ok("taqqoslab bo'lmasa null (0 EMAS)");
  else bad("taqqoslab bo'lmasa null", String(d9.revenue?.changePercent));
  if (d9.contributionMargin?.current === null) ok("marja hisoblanmasa null");
  else bad("marja hisoblanmasa null", String(d9.contributionMargin?.current));

  const raw9 = JSON.stringify(d9);
  if (!/NaN|Infinity/.test(raw9)) ok("javobda NaN/Infinity yo'q");
  else bad("javobda NaN/Infinity yo'q");

  // ══════════ 10) AUDIT IZI ══════════
  head("10) Audit izi va traceability");
  const intel = await (await get("/finance-analytics/intelligence", owner)).json();
  const sig = (intel.data?.alerts || [])[0];
  if (sig) {
    if (sig.source?.rule && sig.source?.period && sig.source?.comparedWith) {
      ok("signal audit izi to'liq", sig.source.rule);
    } else bad("signal audit izi to'liq", JSON.stringify(sig.source || {}));
    if (Array.isArray(sig.evidence) && sig.evidence.length) ok("dalil mashina o'qiy oladigan", `${sig.evidence.length} qator`);
    else bad("dalil mashina o'qiy oladigan");
    if (sig.recommendedActionType) ok("tavsiya turi bor", sig.recommendedActionType);
    else bad("tavsiya turi bor");
  } else warn("signal yo'q — audit izi sinovi o'tkazib yuborildi");

  if (intel.data?.comparison?.label) ok("taqqoslash asosi ochiq", intel.data.comparison.label);
  else bad("taqqoslash asosi ochiq");

  // ══════════ 11) AI CHEGARASI ══════════
  head("11) AI chegarasi");
  if (sig) {
    const plain = await (await get(`/finance-analytics/intelligence/alerts/${sig.id}`, owner)).json();
    if (plain.data?.explanation?.source === "deterministic") {
      ok("standart holatda LLM CHAQIRILMAYDI", "deterministic");
    } else warn("standart izoh manbai", String(plain.data?.explanation?.source));
    // Raqamlar signalning o'zida — matnda emas
    if (Array.isArray(plain.data?.explanation?.evidence)) ok("izoh bilan birga dalil qaytadi");
    else bad("izoh bilan birga dalil qaytadi");
  }

  console.log(`\n=== AUDIT: ${R.pass} o'tdi, ${R.fail} yiqildi, ${R.warn} ogohlantirish ===\n`);
  if (R.failures.length) { console.log("Muammolar:"); for (const f of R.failures) console.log("  • " + f); }
};

// ⚠ `process.exit()` `run()` ICHIDA EMAS. U yerda turganda tozalash
// UMUMAN ishlamasdi — Node darhol to'xtaydi. Aynan shu naqsh
// `journalTreasury.test.js` da ham qoldiq to'plab kelayotgan edi.
run()
  .catch((e) => { console.error("AUDIT YIQILDI:", e); R.fail += 1; })
  .finally(async () => {
    await cleanup();
    process.exit(R.fail ? 1 : 0);
  });
