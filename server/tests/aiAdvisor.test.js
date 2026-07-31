/**
 * AI MASLAHATCHI TESTI - taksonomiya, o'qish qatlami, hayot sikli,
 * hisobot idempotentligi va FILIAL IZOLYATSIYASI.
 *
 * NEGA BU TEST BOR: AI qatlami butun ERP bo'ylab o'qiydi (o'quvchi,
 * to'lov, davomat, lid, guruh, kurs) va natijani BITTA sahifada
 * ko'rsatadi. Shuning uchun bu yerdagi xato eng qimmat turdagi xato:
 * u yiqilmaydi, shunchaki NOTO'G'RI SON ko'rsatadi va owner unga
 * ishonadi.
 *
 * Test o'z bazasida ishlaydi (lc_ai_test) va oxirida uni o'chiradi -
 * haqiqiy ma'lumotga TEGMAYDI.
 *
 * ISHLATISH:  npm run test:ai
 */
import "dotenv/config";
import mongoose from "mongoose";

import {
  INSIGHT_KIND_META,
  INSIGHT_KINDS,
  INSIGHT_DOMAINS,
  INSIGHT_STANCES,
  KIND_LABELS,
  DOMAIN_LABELS,
  REFRESH_TIERS,
  kindsForDomain,
  kindsForTier,
  isOpportunity,
} from "../src/modules/ai/insightKinds.js";
import { INSIGHT_SUBJECT_TYPES } from "../src/models/insight.model.js";
import {
  byDomainSchema,
  listReportsSchema,
  reportIdSchema,
  listSchema,
  latestReportSchema,
} from "../src/modules/ai/validators/insight.validator.js";
import aiRouter from "../src/modules/ai/ai.routes.js";
import requireAuth from "../src/middleware/auth.js";

const TEST_DB = "mongodb://127.0.0.1:27017/lc_ai_test";

// ─── Natija yig'ish ───
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
  actual === expected ? ok(name) : bad(name, `kutilgan ${expected}, kelgan ${actual}`);

const DAY = 24 * 60 * 60 * 1000;

// ════════════════════════════════════════════════════════════════
// 1. TAKSONOMIYA YAXLITLIGI (DB kerak emas)
//
// insightKinds.js - bitta manba haqiqati. Undagi nomuvofiqlik butun
// zanjirni buzadi: noto'g'ri domen = insight modul panelida umuman
// ko'rinmaydi, noto'g'ri stance = imkoniyat "muammo" bo'lib chiqadi.
// ════════════════════════════════════════════════════════════════
const testTaxonomy = () => {
  head("1. TAKSONOMIYA YAXLITLIGI");

  let badDomain = 0;
  let badStance = 0;
  let badSubject = 0;
  let badTier = 0;
  let missingLabel = 0;

  const tiers = Object.values(REFRESH_TIERS);
  for (const kind of INSIGHT_KINDS) {
    const m = INSIGHT_KIND_META[kind];
    if (!INSIGHT_DOMAINS.includes(m.domain)) badDomain += 1;
    if (!INSIGHT_STANCES.includes(m.stance)) badStance += 1;
    if (!INSIGHT_SUBJECT_TYPES.includes(m.subject)) badSubject += 1;
    if (!tiers.includes(m.tier)) badTier += 1;
    if (!KIND_LABELS[kind]) missingLabel += 1;
  }

  eq("Har bir turning domeni ro'yxatda bor", badDomain, 0);
  eq("Har bir turning stance'i haqiqiy", badStance, 0);
  eq("Har bir turning subyekt turi model enum'ida bor", badSubject, 0);
  eq("Har bir turning yangilanish darajasi haqiqiy", badTier, 0);
  eq("Har bir turda o'zbekcha yorliq bor", missingLabel, 0);

  const missingDomainLabel = INSIGHT_DOMAINS.filter((d) => !DOMAIN_LABELS[d]).length;
  eq("Har bir domenda o'zbekcha yorliq bor", missingDomainLabel, 0);

  // Har bir domen kamida bitta tur bilan qoplangan bo'lishi kerak -
  // aks holda modul paneli DOIM bo'sh chiqadi va owner "AI ishlamayapti"
  // deb o'ylaydi.
  const emptyDomains = INSIGHT_DOMAINS.filter((d) => kindsForDomain(d).length === 0);
  eq(
    "Har bir domenda kamida bitta tur bor",
    emptyDomains.length,
    0,
  );
  if (emptyDomains.length) bad("  bo'sh domenlar", emptyDomains.join(", "));

  // fast + slow = hammasi. Biror tur ikkala guruhdan ham tashqarida
  // qolsa, u HECH QACHON qayta hisoblanmaydi.
  const fast = kindsForTier(REFRESH_TIERS.FAST).length;
  const slow = kindsForTier(REFRESH_TIERS.SLOW).length;
  eq("fast + slow = barcha turlar", fast + slow, INSIGHT_KINDS.length);

  // isOpportunity() va stance bir xil javob berishi shart - Action
  // Center birinchisiga, byDomain ikkinchisiga tayanadi.
  const mismatched = INSIGHT_KINDS.filter(
    (k) => isOpportunity(k) !== (INSIGHT_KIND_META[k].stance === "opportunity"),
  );
  eq("isOpportunity() stance bilan mos", mismatched.length, 0);

  const oppCount = INSIGHT_KINDS.filter(isOpportunity).length;
  ok(`Imkoniyat turlari mavjud`, `${oppCount} ta`);
};

// ════════════════════════════════════════════════════════════════
// 2. VALIDATORLAR (DB kerak emas)
// ════════════════════════════════════════════════════════════════
const testValidators = () => {
  head("2. VALIDATORLAR");

  const passes = (schema, payload) => schema.safeParse(payload).success;

  eq(
    "byDomain: haqiqiy domen o'tadi",
    passes(byDomainSchema, { params: { domain: "finance" }, query: {} }),
    true,
  );
  eq(
    "byDomain: soxta domen RAD ETILADI",
    passes(byDomainSchema, { params: { domain: "hackers" }, query: {} }),
    false,
  );
  eq(
    "byDomain: limit 20 dan oshsa rad etiladi",
    passes(byDomainSchema, { params: { domain: "finance" }, query: { limit: 999 } }),
    false,
  );

  eq(
    "reports: haqiqiy davr o'tadi",
    passes(listReportsSchema, { query: { period: "weekly" } }),
    true,
  );
  eq(
    "reports: soxta davr RAD ETILADI",
    passes(listReportsSchema, { query: { period: "hourly" } }),
    false,
  );
  eq(
    "reports/latest: davrsiz ham o'tadi",
    passes(latestReportSchema, { query: {} }),
    true,
  );

  eq(
    "report/:id: ObjectId o'tadi",
    passes(reportIdSchema, { params: { id: "507f1f77bcf86cd799439011" } }),
    true,
  );
  // Bu MUHIM: "latest" so'zi :id sifatida kelib qolsa, validator uni
  // to'xtatishi kerak (route tartibi buzilganini shu yerda tutamiz).
  eq(
    'report/:id: "latest" so\'zi ObjectId sifatida RAD ETILADI',
    passes(reportIdSchema, { params: { id: "latest" } }),
    false,
  );

  eq(
    "insights: domain filtri qabul qilinadi",
    passes(listSchema, { query: { domain: "teachers" } }),
    true,
  );
  eq(
    "insights: stance filtri qabul qilinadi",
    passes(listSchema, { query: { stance: "opportunity" } }),
    true,
  );
  eq(
    "insights: soxta stance rad etiladi",
    passes(listSchema, { query: { stance: "maybe" } }),
    false,
  );
};

// ════════════════════════════════════════════════════════════════
// 3. ROUTE TARTIBI
//
// "/reports/latest" "/reports/:id" DAN OLDIN turishi SHART. Aks holda
// Express "latest" ni :id deb o'qiydi, ObjectId validatori yiqiladi va
// dashboard "so'nggi hisobot" kartasi 400 oladi.
// ════════════════════════════════════════════════════════════════
const testRouteOrder = () => {
  head("3. ROUTE TARTIBI");

  const paths = aiRouter.stack
    .filter((l) => l.route)
    .map((l) => l.route.path);

  const iLatest = paths.indexOf("/reports/latest");
  const iId = paths.indexOf("/reports/:id");

  if (iLatest === -1) return bad("/reports/latest ro'yxatdan o'rin oldi", "topilmadi");
  if (iId === -1) return bad("/reports/:id ro'yxatdan o'rin oldi", "topilmadi");

  iLatest < iId
    ? ok("/reports/latest → /reports/:id dan OLDIN", `${iLatest} < ${iId}`)
    : bad("/reports/latest tartibi", `latest(${iLatest}) :id(${iId}) dan keyin qolgan`);

  ok("Ro'yxatdagi yo'llar", `${paths.length} ta`);

  // ── HAR BIR YO'L QO'RIQLANGANMI ──
  //
  // AI endpointlari butun biznes ma'lumotini qaytaradi. Yangi route
  // qo'shilib, unga requireAuth/requirePermission yozish UNUTILSA -
  // bu jimgina to'liq ma'lumot sizishi bo'ladi va code review'da
  // ko'zdan qochishi oson. Shu sabab tekshiruv AVTOMATIK.
  const routes = aiRouter.stack.filter((l) => l.route);
  const unguarded = routes.filter((l) => l.route.stack[0].handle !== requireAuth);
  eq("har bir yo'lda requireAuth birinchi turadi", unguarded.length, 0);
  for (const l of unguarded) bad("  qo'riqlanmagan", l.route.path);

  // auth + ruxsat + (validate) + handler → kamida 3 ta.
  const tooFew = routes.filter((l) => l.route.stack.length < 3);
  eq("har bir yo'lda ruxsat qatlami bor", tooFew.length, 0);
  for (const l of tooFew) bad("  ruxsatsiz", `${l.route.path} (${l.route.stack.length} qatlam)`);

  // Kiruvchi ma'lumot oladigan yo'llarda validate() bo'lishi SHART.
  // "?branchId=abc" kabi qiymat to'g'ridan-to'g'ri Mongo'ga tushsa,
  // CastError 500 beradi - foydalanuvchi uchun toza 400 emas.
  const withInput = [
    "/briefing",
    "/reports",
    "/reports/latest",
    "/reports/:id",
    "/insights",
    "/insights/domain/:domain",
    "/action-center",
    "/config",
  ];
  const unvalidated = routes.filter(
    (l) => withInput.includes(l.route.path) && l.route.stack.length < 4,
  );
  eq("kirish oladigan yo'llar validatsiyalangan", unvalidated.length, 0);
  for (const l of unvalidated) bad("  validatsiyasiz", l.route.path);
};

// ════════════════════════════════════════════════════════════════
// 4. HISOBOT DAVRI KALITI (DB kerak emas)
//
// periodKey - IDEMPOTENTLIK asosi. Bir davr uchun ikki xil kalit
// chiqsa, har tungi job yangi hisobot yaratadi va ro'yxat takrorga
// to'ladi.
// ════════════════════════════════════════════════════════════════
const testPeriodMeta = async () => {
  head("4. HISOBOT DAVRI KALITI");
  const { periodMeta } = await import("../src/modules/ai/services/report.service.js");

  const now = new Date("2026-07-30T10:00:00Z");

  const d = periodMeta("daily", now);
  /^\d{4}-\d{2}-\d{2}$/.test(d.periodKey)
    ? ok("kunlik kalit formati", d.periodKey)
    : bad("kunlik kalit formati", d.periodKey);

  const w = periodMeta("weekly", now);
  /^\d{4}-W\d{2}$/.test(w.periodKey)
    ? ok("haftalik kalit formati", w.periodKey)
    : bad("haftalik kalit formati", w.periodKey);

  const m = periodMeta("monthly", now);
  /^\d{4}-\d{2}$/.test(m.periodKey)
    ? ok("oylik kalit formati", m.periodKey)
    : bad("oylik kalit formati", m.periodKey);

  // Bir xil `now` → bir xil kalit (idempotentlikning sharti).
  eq("kunlik kalit barqaror", periodMeta("daily", now).periodKey, d.periodKey);
  eq("oylik kalit barqaror", periodMeta("monthly", now).periodKey, m.periodKey);

  // ── MAHALLIY KUN CHEGARASI (UTC emas!) ──
  //
  // Toshkent = UTC+5, ya'ni mahalliy 30-iyul UTC bo'yicha
  // 29-iyul 19:00 dan 30-iyul 19:00 gacha cho'ziladi. Kalit AYNAN shu
  // oyna ichida barqaror bo'lishi va chegarada sakrashi kerak.
  //
  // NEGA MUHIM: agar kalit UTC kuni bo'yicha hisoblansa, kechqurun
  // ishga tushgan job "ertangi" hisobotni yozib qo'yardi va bir kun
  // ikki marta qamralardi. Kodbazada bu xato allaqachon bir marta
  // bo'lgan (localDayGuard testiga qarang).
  const sameDayEarly = periodMeta("daily", new Date("2026-07-29T19:30:00Z")); // 00:30 (30-iyul)
  const sameDayLate = periodMeta("daily", new Date("2026-07-30T18:30:00Z")); // 23:30 (30-iyul)
  eq(
    "kalit mahalliy kun ichida barqaror",
    sameDayLate.periodKey,
    sameDayEarly.periodKey,
  );

  const nextDay = periodMeta("daily", new Date("2026-07-30T19:30:00Z")); // 00:30 (31-iyul)
  nextDay.periodKey !== sameDayEarly.periodKey
    ? ok("mahalliy yarim tunda kalit suriladi", `${sameDayEarly.periodKey} → ${nextDay.periodKey}`)
    : bad("mahalliy yarim tunda kalit suriladi", `ikkalasi ham ${nextDay.periodKey}`);

  // Oyna: boshlanish tugashdan oldin.
  d.start < d.end ? ok("kunlik oyna to'g'ri") : bad("kunlik oyna", "start >= end");
  m.start < m.end ? ok("oylik oyna to'g'ri") : bad("oylik oyna", "start >= end");

  // Sarlavha bo'sh bo'lmasligi kerak - u UI da ro'yxat qatori.
  d.title && m.title ? ok("sarlavhalar to'ldirilgan") : bad("sarlavhalar", "bo'sh");

  try {
    periodMeta("yearly", now);
    bad("noma'lum davr xato beradi", "xato tashlanmadi");
  } catch {
    ok("noma'lum davr xato beradi");
  }
};

// ════════════════════════════════════════════════════════════════
// DB QISMI
// ════════════════════════════════════════════════════════════════
const seedInsight = async (Insight, buildInsight, over = {}) => {
  const doc = buildInsight({
    branchId: over.branchId,
    kind: over.kind,
    subjectId: over.subjectId || new mongoose.Types.ObjectId(),
    subjectLabel: over.subjectLabel || "Sinov subyekti",
    title: over.title || "Sinov",
    severity: over.severity || "medium",
    score: over.score ?? 0.8,
    confidence: over.confidence ?? 0.9,
    expectedImpact: over.expectedImpact || { amount: 100000, currency: "UZS", label: "" },
    now: over.now || new Date(),
  });
  Object.assign(doc, over.raw || {});
  return Insight.create(doc);
};

const runDbTests = async () => {
  const Insight = (await import("../src/models/insight.model.js")).default;
  const Branch = (await import("../src/models/branch.model.js")).default;
  const AiReport = (await import("../src/models/aiReport.model.js")).default;
  const { buildInsight } = await import("../src/modules/ai/services/insightWriter.service.js");
  const insightService = await import("../src/modules/ai/services/insight.service.js");
  const { openCounts } = await import("../src/modules/ai/services/recompute.service.js");
  const { buildBriefing } = await import("../src/modules/ai/services/briefing.service.js");
  const { buildReport, listReports } = await import(
    "../src/modules/ai/services/report.service.js"
  );
  const lifecycle = await import("../src/modules/ai/services/lifecycle.service.js");
  const { runWithBranchContext } = await import(
    "../src/helpers/branchContext.helper.js"
  );

  const inBranch = (branchId, fn) =>
    runWithBranchContext(
      {
        branchId: String(branchId),
        allowedBranchIds: [String(branchId)],
        canSeeAllBranches: false,
        userId: null,
      },
      fn,
    );

  // ── Ikkita filial: A (sinov ostida) va B (begona) ──
  const A = await Branch.create({ name: "Filial A", isActive: true });
  const B = await Branch.create({ name: "Filial B", isActive: true });

  // ════════════════════════════════════════════════════════════
  // 5. IMKONIYAT/XAVF AJRATILISHI  ← ASOSIY REGRESSIYA TESTI
  //
  // Ilgari actionCenter imkoniyatni `kind === "course_opportunity"`
  // bo'yicha ajratardi - bunday tur taksonomiyada YO'Q. Natijada
  // BARCHA imkoniyatlar "o'rta ustuvorlikdagi muammo" bo'lib
  // ko'rinardi va yashil ro'yxat DOIM bo'sh edi.
  // ════════════════════════════════════════════════════════════
  head("5. IMKONIYAT / XAVF AJRATILISHI (regressiya)");

  await seedInsight(Insight, buildInsight, {
    branchId: A._id,
    kind: "student_churn_risk",
    severity: "high",
    expectedImpact: { amount: 500000, currency: "UZS", label: "500 ming" },
  });
  await seedInsight(Insight, buildInsight, {
    branchId: A._id,
    kind: "overdue_payments",
    severity: "medium",
    expectedImpact: { amount: 200000, currency: "UZS", label: "200 ming" },
  });
  // Uchta HAR XIL imkoniyat turi - "bitta tur qattiq yozilgan" xatosi
  // qaytsa, uchalasi ham tushib qoladi.
  await seedInsight(Insight, buildInsight, {
    branchId: A._id,
    kind: "course_demand",
    severity: "low",
    expectedImpact: { amount: 300000, currency: "UZS", label: "300 ming" },
  });
  await seedInsight(Insight, buildInsight, {
    branchId: A._id,
    kind: "teacher_top_performer",
    severity: "low",
    expectedImpact: { amount: 0, currency: "UZS", label: "" },
  });
  await seedInsight(Insight, buildInsight, {
    branchId: A._id,
    kind: "slot_opportunity",
    severity: "low",
    expectedImpact: { amount: 150000, currency: "UZS", label: "150 ming" },
  });

  const ac = await inBranch(A._id, () => insightService.actionCenter({ limit: 20 }));

  eq("Imkoniyatlar alohida ro'yxatga tushdi", ac.opportunities.length, 3);
  eq("Yuqori ustuvorlik ro'yxati", ac.high.length, 1);
  eq("O'rta ustuvorlik ro'yxati", ac.medium.length, 1);

  // Imkoniyat xavf ro'yxatiga SIZIB O'TMASLIGI kerak.
  const leaked = [...ac.high, ...ac.medium].filter((i) => i.stance === "opportunity");
  eq("Imkoniyat xavf ro'yxatiga sizmadi", leaked.length, 0);

  eq("summary.opportunities", ac.summary.opportunities, 3);
  eq("summary.high", ac.summary.high, 1);
  eq("summary.medium", ac.summary.medium, 1);

  // PUL AJRATILISHI: imkoniyat summasi "xavf ostidagi pul" ga
  // qo'shilmasligi kerak - aks holda owner'ga yo'q xavf ko'rsatiladi.
  eq("impactAtRisk faqat xavflardan", ac.summary.impactAtRisk, 700000);
  eq("upside faqat imkoniyatlardan", ac.summary.upside, 450000);

  // openCounts() ham AYNAN shunday ajratishi kerak - u boshqa
  // funksiya, lekin bir xil qoidaga bo'ysunadi.
  const counts = await inBranch(A._id, () => openCounts());
  eq("openCounts.opportunities mos", counts.opportunities, ac.summary.opportunities);
  eq("openCounts.impactAtRisk mos", counts.impactAtRisk, ac.summary.impactAtRisk);
  eq("openCounts.upside mos", counts.upside, ac.summary.upside);

  // ════════════════════════════════════════════════════════════
  // 6. MODUL PANELI (byDomain)
  // ════════════════════════════════════════════════════════════
  head("6. MODUL PANELI (byDomain)");

  const fin = await inBranch(A._id, () => insightService.byDomain("finance", {}));
  eq("moliya: xavflar", fin.risks.length, 1);
  eq("moliya: imkoniyatlar", fin.opportunities.length, 0);
  eq("moliya: domen qaytdi", fin.domain, "finance");

  const courses = await inBranch(A._id, () => insightService.byDomain("courses", {}));
  eq("kurslar: imkoniyat topildi", courses.opportunities.length, 1);
  eq("kurslar: xavf yo'q", courses.risks.length, 0);

  const students = await inBranch(A._id, () => insightService.byDomain("students", {}));
  eq("o'quvchilar: xavf topildi", students.risks.length, 1);

  // Bo'sh domen xato bermasligi kerak - panel shunchaki chizilmaydi.
  const leads = await inBranch(A._id, () => insightService.byDomain("leads", {}));
  eq("bo'sh domen xato bermaydi", leads.risks.length + leads.opportunities.length, 0);

  // limit hurmat qilinadi.
  const limited = await inBranch(A._id, () =>
    insightService.byDomain("groups", { limit: 1 }),
  );
  limited.opportunities.length <= 1
    ? ok("limit hurmat qilinadi")
    : bad("limit", `${limited.opportunities.length} ta qaytdi`);

  // ════════════════════════════════════════════════════════════
  // 7. FILIAL IZOLYATSIYASI  ← eng xavfli sizish
  // ════════════════════════════════════════════════════════════
  head("7. FILIAL IZOLYATSIYASI");

  // B filialiga ataylab KO'P ma'lumot qo'yamiz.
  const bIds = [];
  for (const kind of ["student_churn_risk", "overdue_payments", "course_demand"]) {
    const doc = await seedInsight(Insight, buildInsight, {
      branchId: B._id,
      kind,
      severity: "high",
      subjectLabel: "BEGONA-FILIAL-B",
      expectedImpact: { amount: 9_000_000, currency: "UZS", label: "begona" },
    });
    bIds.push(String(doc._id));
  }

  const hasForeign = (payload) => {
    const json = JSON.stringify(payload);
    if (json.includes("BEGONA-FILIAL-B")) return "subjectLabel";
    if (json.includes(String(B._id))) return "branchId";
    for (const id of bIds) if (json.includes(id)) return "insight _id";
    return null;
  };

  const checks = [
    ["actionCenter", () => insightService.actionCenter({ limit: 50 })],
    ["list", () => insightService.list({ limit: 100 })],
    ["byDomain(students)", () => insightService.byDomain("students", { limit: 20 })],
    ["byDomain(finance)", () => insightService.byDomain("finance", { limit: 20 })],
    ["byDomain(courses)", () => insightService.byDomain("courses", { limit: 20 })],
    ["bySubjects", () => insightService.bySubjects(bIds)],
    ["openCounts", () => openCounts()],
    ["listReports", () => listReports({})],
  ];

  for (const [name, fn] of checks) {
    try {
      const res = await inBranch(A._id, fn);
      const leak = hasForeign(res);
      leak ? bad(`${name} sizmaydi`, `B filiali izi: ${leak}`) : ok(`${name} sizmaydi`);
    } catch (err) {
      bad(`${name} sizmaydi`, `xato: ${err.message}`);
    }
  }

  // SON SIZISHI: A da 700k xavf bor, B da 27M. Agar filtr ishlamasa,
  // summa keskin oshadi.
  const aCounts = await inBranch(A._id, () => openCounts());
  aCounts.impactAtRisk === 700000
    ? ok("son sizishi yo'q", "impactAtRisk = 700 000")
    : bad("son sizishi", `impactAtRisk = ${aCounts.impactAtRisk}, kutilgan 700000`);

  // Teskari yo'nalish: B kontekstida A ko'rinmasin.
  const bView = await inBranch(B._id, () => insightService.actionCenter({ limit: 50 }));
  const aLeak = JSON.stringify(bView).includes(String(A._id));
  aLeak ? bad("teskari sizish yo'q", "A filiali B da ko'rindi") : ok("teskari sizish yo'q");

  // ════════════════════════════════════════════════════════════
  // 8. DEDUP INDEKSI
  //
  // Bir subyekt + bir tur uchun FAQAT BITTA ochiq insight bo'lishi
  // kerak. Buzilsa, Action Center bir xil vazifani takror ko'rsatadi.
  // ════════════════════════════════════════════════════════════
  head("8. DEDUP INDEKSI");

  const subj = new mongoose.Types.ObjectId();
  await seedInsight(Insight, buildInsight, {
    branchId: A._id,
    kind: "attendance_anomaly",
    subjectId: subj,
  });
  try {
    await seedInsight(Insight, buildInsight, {
      branchId: A._id,
      kind: "attendance_anomaly",
      subjectId: subj,
    });
    bad("takroriy ochiq insight bloklanadi", "ikkinchisi yaratildi");
  } catch (err) {
    err.code === 11000
      ? ok("takroriy ochiq insight bloklanadi", "unique indeks ishladi")
      : bad("takroriy ochiq insight bloklanadi", `boshqa xato: ${err.message}`);
  }

  // Yopilgandan keyin YANGISI ochilishi KERAK (partial indeks).
  await Insight.updateOne(
    { subjectId: subj, kind: "attendance_anomaly" },
    { $set: { status: "done", resolvedAt: new Date() } },
  );
  try {
    await seedInsight(Insight, buildInsight, {
      branchId: A._id,
      kind: "attendance_anomaly",
      subjectId: subj,
    });
    ok("yopilgandan keyin yangisi ochiladi", "partial indeks to'g'ri");
  } catch (err) {
    bad("yopilgandan keyin yangisi ochiladi", err.message);
  }

  // ════════════════════════════════════════════════════════════
  // 9. HAYOT SIKLI
  // ════════════════════════════════════════════════════════════
  head("9. HAYOT SIKLI");

  const now = new Date();
  await Insight.deleteMany({ branchId: A._id });

  // (a) muddati o'tgan ochiq
  const expiredOne = await seedInsight(Insight, buildInsight, {
    branchId: A._id,
    kind: "lead_hot",
    raw: { expiresAt: new Date(now.getTime() - DAY) },
  });
  // (b) muddati kelmagan ochiq
  const freshOne = await seedInsight(Insight, buildInsight, {
    branchId: A._id,
    kind: "lead_stale",
    raw: { expiresAt: new Date(now.getTime() + 10 * DAY) },
  });
  // (c) muddatsiz ochiq
  const noExpiry = await seedInsight(Insight, buildInsight, {
    branchId: A._id,
    kind: "cashflow_warning",
    raw: { expiresAt: null },
  });

  const expiredCount = await lifecycle.expireStale(now);
  eq("faqat muddati o'tgani yopildi", expiredCount, 1);

  const afterExpire = await Insight.findById(expiredOne._id).lean();
  eq("yopilgan status", afterExpire.status, "expired");
  // "prevented" EMAS: e'tibor berilmagan insight uchun "xavf oldi
  // olindi" deyish yopiq halqa statistikasini yolg'on qilardi.
  eq("natija 'unknown' (yolg'on ijobiy emas)", afterExpire.outcome, "unknown");

  eq(
    "muddati kelmagani tegilmadi",
    (await Insight.findById(freshOne._id).lean()).status,
    "open",
  );
  eq(
    "muddatsizi tegilmadi",
    (await Insight.findById(noExpiry._id).lean()).status,
    "open",
  );

  // ── PRUNE: eski yopiqlar o'chadi, "dismissed" SAQLANADI ──
  await Insight.deleteMany({ branchId: A._id });
  const old = new Date(now.getTime() - 400 * DAY);

  const doneOld = await seedInsight(Insight, buildInsight, {
    branchId: A._id,
    kind: "lead_hot",
    raw: { status: "done", resolvedAt: old, outcome: "prevented" },
  });
  const dismissedOld = await seedInsight(Insight, buildInsight, {
    branchId: A._id,
    kind: "lead_stale",
    raw: { status: "dismissed", resolvedAt: old, outcome: "prevented", dismissReason: "x" },
  });
  const pendingOld = await seedInsight(Insight, buildInsight, {
    branchId: A._id,
    kind: "cashflow_warning",
    raw: { status: "expired", resolvedAt: old, outcome: "pending" },
  });

  const pruned = await lifecycle.pruneOld(now);
  eq("faqat bitta eski yozuv o'chdi", pruned, 1);
  eq(
    "tugatilgan eski yozuv o'chdi",
    await Insight.countDocuments({ _id: doneOld._id }),
    0,
  );
  // Bu QASDDAN: "bu noto'g'ri" degan har bir holat modelni kalibrlash
  // uchun eng qimmatli signal. Uni o'chirish - o'rganishni yo'qotish.
  eq(
    "'dismissed' SAQLANADI",
    await Insight.countDocuments({ _id: dismissedOld._id }),
    1,
  );
  eq(
    "natijasi aniqlanmagani saqlanadi",
    await Insight.countDocuments({ _id: pendingOld._id }),
    1,
  );

  // ════════════════════════════════════════════════════════════
  // 10. BRIFING
  // ════════════════════════════════════════════════════════════
  head("10. BRIFING (to'rtta savol)");

  await Insight.deleteMany({ branchId: A._id });

  const briefing = await inBranch(A._id, () => buildBriefing({ now }));

  for (const key of ["yesterday", "today", "next", "now"]) {
    briefing[key] !== undefined
      ? ok(`"${key}" bo'limi mavjud`)
      : bad(`"${key}" bo'limi mavjud`, "undefined");
  }

  Array.isArray(briefing.yesterday?.metrics) && briefing.yesterday.metrics.length === 4
    ? ok("kecha: 4 ta ko'rsatkich")
    : bad("kecha: 4 ta ko'rsatkich", `${briefing.yesterday?.metrics?.length}`);
  Array.isArray(briefing.today?.metrics) && briefing.today.metrics.length === 4
    ? ok("bugun: 4 ta ko'rsatkich")
    : bad("bugun: 4 ta ko'rsatkich", `${briefing.today?.metrics?.length}`);

  // Har bir ko'rsatkichda `key` bo'lishi SHART - frontend uni React
  // key sifatida va polyarlik (yashil/qizil) uchun ishlatadi.
  const allMetrics = [
    ...(briefing.yesterday?.metrics || []),
    ...(briefing.today?.metrics || []),
    ...(briefing.next?.metrics || []),
  ];
  const keyless = allMetrics.filter((m) => !m.key).length;
  eq("har bir ko'rsatkichda key bor", keyless, 0);

  // YANGI XULQ: ma'lumot yo'q bo'lsa izoh YOZILMAYDI (null).
  // Ilgari bu yerda kartalarni takrorlaydigan matn turardi.
  briefing.yesterday?.narration == null
    ? ok("bo'sh bazada 'kecha' izohi yo'q", "null")
    : bad("bo'sh bazada 'kecha' izohi yo'q", `"${briefing.yesterday.narration}"`);
  briefing.today?.narration == null
    ? ok("bo'sh bazada 'bugun' izohi yo'q", "null")
    : bad("bo'sh bazada 'bugun' izohi yo'q", `"${briefing.today.narration}"`);
  briefing.now?.narration == null
    ? ok("bo'sh bazada 'hozir' izohi yo'q", "null")
    : bad("bo'sh bazada 'hozir' izohi yo'q", `"${briefing.now.narration}"`);

  // Filial aniqlangan bo'lsa bashorat bo'limi bo'lishi kerak.
  briefing.next !== null
    ? ok("filial kontekstida bashorat hisoblandi")
    : bad("filial kontekstida bashorat", "null qaytdi");

  // Izoh bor bo'lsa - u KARTA SONINI takrorlamasligi kerak.
  // Bo'sh bazada izoh yo'q, shuning uchun bu shart bajarilgan.
  briefing.now?.counts
    ? ok("'hozir' bo'limida sanoq bor")
    : bad("'hozir' bo'limida sanoq bor", "counts yo'q");

  // ════════════════════════════════════════════════════════════
  // 11. HISOBOT IDEMPOTENTLIGI
  //
  // Job qayta ishga tushsa (restart, retry) hisobot IKKILANMASLIGI
  // kerak - aks holda ro'yxat bir xil kunning nusxalariga to'ladi.
  // ════════════════════════════════════════════════════════════
  head("11. HISOBOT IDEMPOTENTLIGI");

  const r1 = await inBranch(A._id, () => buildReport(A._id, "daily", now));
  const r2 = await inBranch(A._id, () => buildReport(A._id, "daily", now));

  eq("ikki marta chaqirilganda bitta hujjat", String(r1._id), String(r2._id));
  eq(
    "bazada bitta kunlik hisobot",
    await AiReport.countDocuments({ branchId: A._id, period: "daily" }),
    1,
  );
  eq("davr kaliti bir xil", r1.periodKey, r2.periodKey);

  r1.sections?.length > 0
    ? ok("hisobotda bo'limlar bor", `${r1.sections.length} ta`)
    : bad("hisobotda bo'limlar bor", "bo'sh");

  // Har bir bo'limda sarlavha va izoh bo'lishi kerak.
  const badSections = (r1.sections || []).filter((s) => !s.key || !s.title).length;
  eq("har bir bo'limda key va title bor", badSections, 0);

  r1.summary ? ok("xulosa yozilgan") : bad("xulosa yozilgan", "bo'sh");

  // Haftalik va oylik ham buziladimi?
  const w1 = await inBranch(A._id, () => buildReport(A._id, "weekly", now));
  const m1 = await inBranch(A._id, () => buildReport(A._id, "monthly", now));
  w1?.periodKey ? ok("haftalik hisobot tuzildi", w1.periodKey) : bad("haftalik", "yo'q");
  m1?.periodKey ? ok("oylik hisobot tuzildi", m1.periodKey) : bad("oylik", "yo'q");

  // Oylik hisobotda BASHORAT va YOPIQ HALQA bo'limlari bo'lishi kerak -
  // aynan shular uni "o'tgan oy hisoboti" dan "qaror hujjati" ga
  // aylantiradi.
  const mKeys = (m1.sections || []).map((s) => s.key);
  mKeys.includes("forecast")
    ? ok("oylikda bashorat bo'limi bor")
    : bad("oylikda bashorat bo'limi", mKeys.join(","));
  mKeys.includes("outcomes")
    ? ok("oylikda yopiq halqa bo'limi bor")
    : bad("oylikda yopiq halqa bo'limi", mKeys.join(","));

  // Kunlikda kurs kesimi BO'LMASLIGI kerak (bir kunda ma'nosiz shovqin).
  const dKeys = (r1.sections || []).map((s) => s.key);
  !dKeys.includes("courses")
    ? ok("kunlikda kurs kesimi yo'q (ataylab)")
    : bad("kunlikda kurs kesimi yo'q", "bor ekan");
  !dKeys.includes("forecast")
    ? ok("kunlikda bashorat yo'q (ataylab)")
    : bad("kunlikda bashorat yo'q", "bor ekan");

  // Hisobot ham filialga bog'langanmi?
  const bReport = await inBranch(B._id, () => buildReport(B._id, "daily", now));
  String(bReport.branchId) === String(B._id)
    ? ok("hisobot to'g'ri filialga yozildi")
    : bad("hisobot filiali", String(bReport.branchId));

  const aReports = await inBranch(A._id, () => listReports({}));
  const foreignReport = aReports.items.some((r) => String(r.branchId) !== String(A._id));
  foreignReport
    ? bad("hisobot ro'yxati sizmaydi", "begona filial hisoboti ko'rindi")
    : ok("hisobot ro'yxati sizmaydi");

  // ════════════════════════════════════════════════════════════
  // 12. RECOMPUTE QUVURI (haqiqiy detektorlar)
  //
  // Bu eng katta yuza: quvur 5 bosqichdan iborat va har biri o'nlab
  // aggregation qiladi. Bo'sh filialda ham YIQILMASLIGI kerak -
  // yangi markazda ma'lumot bo'lmaydi, va birinchi kuniyoq
  // yiqiladigan AI hech kimga kerak emas.
  // ════════════════════════════════════════════════════════════
  head("12. RECOMPUTE QUVURI");

  const AiRun = (await import("../src/models/aiRun.model.js")).default;
  const { recomputeBranch, FULL_PIPELINE, FAST_PIPELINE } = await import(
    "../src/modules/ai/services/recompute.service.js"
  );

  try {
    const full = await recomputeBranch(A._id, { scope: "full", trigger: "manual", now });
    ok("to'liq quvur bo'sh filialda yiqilmadi");

    const run = await AiRun.findById(full.runId).lean();
    eq("AiRun yozuvi 'ok'", run.status, "ok");
    eq("AiRun scope", run.scope, "full");
    run.durationMs != null
      ? ok("AiRun davomiylik yozildi", `${run.durationMs}ms`)
      : bad("AiRun davomiylik", "null");

    // Har bir bosqich statistika qoldirishi kerak - qoldirmasa, u
    // jimgina o'tkazib yuborilgan bo'ladi va buni hech kim sezmaydi.
    const missing = FULL_PIPELINE.filter((s) => full.stats[s] === undefined);
    eq("har bir bosqich statistika qoldirdi", missing.length, 0);
    if (missing.length) bad("  yo'q bosqichlar", missing.join(", "));

    // Og'ir ichki ma'lumot AiRun ga YOZILMASLIGI kerak (Map'lar,
    // to'liq hujjatlar) - u jurnal, ma'lumotlar ombori emas.
    !full.stats.groups?.signals
      ? ok("guruh signallari AiRun dan tozalandi")
      : bad("guruh signallari tozalandi", "signals qoldi");
  } catch (err) {
    bad("to'liq quvur bo'sh filialda yiqilmadi", err.message);
  }

  try {
    const fast = await recomputeBranch(A._id, {
      scope: "fast",
      trigger: "intraday",
      now,
    });
    ok("tez quvur ishladi");
    const missingFast = FAST_PIPELINE.filter((s) => fast.stats[s] === undefined);
    eq("tez quvurning har bosqichi ishladi", missingFast.length, 0);

    // Tez quvur og'ir bosqichlarni ATAYLAB o'tkazib yuboradi.
    fast.stats.courses === undefined
      ? ok("tez quvur kurs tahlilini o'tkazib yubordi (ataylab)")
      : bad("tez quvur kurs tahlili", "ishlab ketdi — qimmat");
  } catch (err) {
    bad("tez quvur ishladi", err.message);
  }

  // ════════════════════════════════════════════════════════════
  // 13. IZOH MATNI SIFATI
  //
  // Shablon satrlaridagi eng keng tarqalgan xato - qiymat null
  // bo'lganda matnga "null%" yoki "undefined so'm" tushib qolishi.
  // Bunday matn owner ko'zida butun tizimni buzuq qilib ko'rsatadi.
  // ════════════════════════════════════════════════════════════
  head("13. IZOH MATNI SIFATI");

  // "Hozir" izohi ishga tushishi uchun xavf ostidagi pul kerak.
  await seedInsight(Insight, buildInsight, {
    branchId: A._id,
    kind: "revenue_forecast_drop",
    severity: "high",
    expectedImpact: { amount: 1_250_000, currency: "UZS", label: "1.25 mln" },
  });

  const b2 = await inBranch(A._id, () => buildBriefing({ now }));

  b2.now?.narration
    ? ok("xavf bo'lganda 'hozir' izohi yozildi")
    : bad("xavf bo'lganda 'hozir' izohi", "null qoldi");

  // Barcha izohlarni bitta qopga yig'ib, buzuq belgilarni qidiramiz.
  const r3 = await inBranch(A._id, () => buildReport(A._id, "monthly", now));
  const texts = [
    b2.yesterday?.narration,
    b2.today?.narration,
    b2.next?.narration,
    b2.now?.narration,
    r3.summary,
    ...(r3.sections || []).flatMap((s) => [s.narration, s.headline]),
  ].filter(Boolean);

  const BROKEN = /\bnull\b|\bundefined\b|\bNaN\b|\[object Object\]/;
  const dirty = texts.filter((t) => BROKEN.test(t));
  eq("izohlarda null/undefined/NaN yo'q", dirty.length, 0);
  for (const d of dirty) bad("  buzuq matn", d.slice(0, 120));

  ok("tekshirilgan izoh matnlari", `${texts.length} ta`);

  // Izoh KARTA SONINI takrorlamasligi kerak. To'liq tekshirish
  // qiyin, lekin eng aniq holatni tutamiz: "hozir" izohi faqat
  // pul haqida gapirishi va vazifa SANOG'ini qaytarmasligi kerak
  // (sanoq bo'lim sarlavhasida turadi).
  const nowText = b2.now.narration;
  /vazifa e'tibor kutmoqda|Eng muhimi:/.test(nowText)
    ? bad("'hozir' izohi sarlavha bilan takrorlanmaydi", nowText.slice(0, 80))
    : ok("'hozir' izohi sarlavha bilan takrorlanmaydi");

  // ════════════════════════════════════════════════════════════
  // 16. REYTINGLAR  ← "HECH TO'LAMAGANLAR TUZOG'I" REGRESSIYASI
  //
  // Eng jiddiy modellashtirish xatosi shu yerda qulflanadi:
  //
  // Kechikish nisbati TRANZAKSIYALARDAN hisoblanadi, ya'ni faqat
  // TO'LAGAN o'quvchi o'lchanadi. Umuman to'lamagan o'quvchining
  // tranzaksiyasi yo'q → lateRatio = 0 → u "eng intizomli" bo'lib
  // ko'rinadi va reyting TAGIGA tushadi.
  //
  // Ya'ni "eng ko'p to'lovni kechiktirganlar" ro'yxati eng yomon
  // to'lovchini KO'RSATMAY qo'yardi - reyting aynan teskarisini
  // qilardi. Test buni aniq ushlaydi: hech to'lamagan o'quvchi
  // ba'zan kechiktirgandan YUQORIDA turishi shart.
  // ════════════════════════════════════════════════════════════
  head("16. REYTINGLAR (hech to'lamaganlar tuzog'i)");

  const User = (await import("../src/models/user.model.js")).default;
  const Group = (await import("../src/models/group.model.js")).default;
  const GroupMembership = (await import("../src/models/groupMembership.model.js")).default;
  const StudentPayment = (await import("../src/models/studentPayment.model.js")).default;
  const PaymentTransaction = (await import("../src/models/paymentTransaction.model.js")).default;
  const { recomputeRankings, readAllRankings } = await import(
    "../src/modules/ai/services/ranking.service.js"
  );

  const rankNow = new Date();
  const rankGroup = await Group.create({
    name: "Reyting guruhi",
    branchId: A._id,
    isActive: true,
  });

  /** Test o'quvchisi + a'zoligi. */
  const mkStudent = async (firstName) => {
    const u = await User.create({
      firstName,
      lastName: "Testov",
      username: `rank_${firstName.toLowerCase()}_${Date.now()}`,
      phone: `9989${Math.floor(Math.random() * 100000000)}`,
      passwordHash: "x",
      role: "student",
      homeBranchId: A._id,
      enrolledAt: new Date(rankNow.getTime() - 400 * DAY),
      isActive: true,
    });
    await GroupMembership.create({ student: u._id, group: rankGroup._id, leftAt: null });
    return u;
  };

  /** Oylik to'lov yozuvi (+ ixtiyoriy tranzaksiya). */
  const mkPayment = async (student, monthsAgo, { paid, paidLateDays }) => {
    const d = new Date(
      Date.UTC(rankNow.getUTCFullYear(), rankNow.getUTCMonth() - monthsAgo, 1),
    );
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth() + 1;
    const expected = 500000;
    const p = await StudentPayment.create({
      branchId: A._id,
      student: student._id,
      group: rankGroup._id,
      year,
      month,
      baseFee: expected,
      expectedAmount: expected,
      paidAmount: paid ? expected : 0,
      status: paid ? "paid" : "unpaid",
      writtenOff: false,
    });
    if (paid) {
      const periodEnd = new Date(Date.UTC(year, month, 0));
      await PaymentTransaction.create({
        branchId: A._id,
        payment: p._id,
        student: student._id,
        group: rankGroup._id,
        year,
        month,
        amount: expected,
        source: "direct",
        method: "cash",
        paidAt: new Date(periodEnd.getTime() + paidLateDays * DAY),
      });
    }
  };

  // "Hech to'lamagan": 6 oy yozuv bor, birontasi ham to'lanmagan.
  // Tranzaksiyasi YO'Q → eski kodda lateRatio = 0 chiqardi.
  const neverPays = await mkStudent("Hechto");
  for (let m = 1; m <= 6; m++) await mkPayment(neverPays, m, { paid: false });

  // "Ba'zan kechiktiradi": hammasini to'lagan, 2 tasi kechikkan.
  const sometimesLate = await mkStudent("Bazan");
  for (let m = 1; m <= 6; m++) {
    await mkPayment(sometimesLate, m, { paid: true, paidLateDays: m <= 2 ? 20 : 1 });
  }

  // "Har doim o'z vaqtida": nazorat guruhi - reytingga umuman kirmasligi kerak.
  const alwaysOnTime = await mkStudent("Vaqtida");
  for (let m = 1; m <= 6; m++) {
    await mkPayment(alwaysOnTime, m, { paid: true, paidLateDays: 1 });
  }

  await inBranch(A._id, () => recomputeRankings(A._id));
  const ranks = await readAllRankings(A._id);
  const payRows = ranks.payment_delay?.rows || [];

  const posOf = (u) => payRows.findIndex((r) => String(r.subjectId) === String(u._id));
  const iNever = posOf(neverPays);
  const iSometimes = posOf(sometimesLate);
  const iAlways = posOf(alwaysOnTime);

  iNever >= 0
    ? ok("hech to'lamagan o'quvchi reytingda bor", `${iNever + 1}-o'rin`)
    : bad("hech to'lamagan o'quvchi reytingda bor", "ro'yxatda yo'q");

  iNever >= 0 && iSometimes >= 0 && iNever < iSometimes
    ? ok("hech to'lamagan ba'zan kechiktirgandan YUQORIDA")
    : bad(
        "hech to'lamagan ba'zan kechiktirgandan YUQORIDA",
        `hech: ${iNever}, ba'zan: ${iSometimes}`,
      );

  iAlways === -1
    ? ok("o'z vaqtida to'lovchi reytingga kirmaydi")
    : bad("o'z vaqtida to'lovchi reytingga kirmaydi", `${iAlways + 1}-o'rin`);

  // Ishonch: 6 davrlik dalili bor o'quvchi "ma'lumot yetarli emas"
  // bo'lib chiqmasligi kerak. Eski kodda bashorat ishonchi olinardi va
  // u tranzaksiyasiz o'quvchida 0 ga tushardi - ya'ni UI ballni
  // butunlay yashirardi.
  const neverRow = payRows[iNever];
  neverRow && neverRow.confidence >= 0.4
    ? ok("hech to'lamaganning ishonchi yetarli", `${Math.round(neverRow.confidence * 100)}%`)
    : bad(
        "hech to'lamaganning ishonchi yetarli",
        `${neverRow ? Math.round(neverRow.confidence * 100) : "?"}%`,
      );

  // Har bir qator profil havolasiga ega bo'lishi shart - bu reytingning
  // asosiy qiymati (ismni bosib odamga o'tish).
  payRows.every((r) => r.href?.startsWith("/owner/users/"))
    ? ok("har bir reyting qatorida profil havolasi bor")
    : bad("har bir reyting qatorida profil havolasi bor", "havolasiz qator bor");

  // Filial izolyatsiyasi: B filialida reyting bo'sh bo'lishi kerak.
  await inBranch(B._id, () => recomputeRankings(B._id));
  const bRanks = await readAllRankings(B._id);
  (bRanks.payment_delay?.rows || []).length === 0
    ? ok("reyting begona filialga sizmaydi")
    : bad("reyting begona filialga sizmaydi", `${bRanks.payment_delay.rows.length} qator`);
};

// ════════════════════════════════════════════════════════════════
// 14. O'QITUVCHI KOMPOZIT BAHOSI + MAOSH TAVSIYASI (DB kerak emas)
//
// Ikkita REGRESSIYA shu yerda qulflanadi:
//
//  a) "Qiyin guruh jazosi" - ball XOM O'RTACHADAN emas, filial
//     bazasidan FARQdan chiqishi shart. Aks holda kuchli guruh olgan
//     o'qituvchi doim yuqorida, qiyin guruh olgani doim pastda bo'ladi
//     va reyting o'qituvchini emas, unga berilgan guruhni baholaydi.
//
//  b) "Yetib bo'lmaydigan chegara" - maosh tavsiyasi MUTLAQ chegara
//     (score >= 0.72) bilan qo'yilgan edi va real ma'lumotda HECH
//     QACHON ishlamadi: 40 o'qituvchilik filialda eng yaxshisi 0.69
//     to'plagan. Sabab tuzilmaviy - ball tarqalishi filialning bir
//     xilligiga bog'liq, ya'ni mutlaq chegara o'qituvchini emas,
//     JAMOANING TARQOQLIGINI o'lchaydi. Endi chegara NISBIY (yuqori 10%).
// ════════════════════════════════════════════════════════════════
const testTeacherScoring = async () => {
  head("14. O'QITUVCHI BAHOSI VA MAOSH GATE'I");

  const { scoreTeacher, qualifiesForRaise, RAISE_GATE } = await import(
    "../src/modules/ai/scoring/teacher.scoring.js"
  );

  const baseline = {
    attendanceRate: 0.8,
    gradeImprovement: 0.1,
    paymentOnTimeRatio: 0.7,
    sampleSize: 10,
  };

  // --- (a) Xom o'rtacha EMAS, lift ---
  //
  // Ikki o'qituvchi: birinchisining XOM ko'rsatkichi yuqori, lekin u
  // filial o'rtachasida turibdi. Ikkinchisiniki past ko'rinadi, lekin
  // u o'z bazasidan YUQORI. Ball ikkinchisiga ustunlik berishi kerak.
  const atBaseline = scoreTeacher({
    outcome: { attendanceRate: 0.8, gradeImprovement: 0.1, gradeSamples: 200, lessons: 300 },
    payment: { onTimeRatio: 0.7, periods: 50 },
    baseline,
  });
  const aboveBaseline = scoreTeacher({
    outcome: { attendanceRate: 0.88, gradeImprovement: 0.35, gradeSamples: 200, lessons: 300 },
    payment: { onTimeRatio: 0.85, periods: 50 },
    baseline,
  });

  Math.abs(atBaseline.score - 0.5) < 0.01
    ? ok("bazadagi o'qituvchi aynan 0.5 oladi", atBaseline.score.toFixed(3))
    : bad("bazadagi o'qituvchi aynan 0.5 oladi", `kelgan ${atBaseline.score}`);

  aboveBaseline.score > atBaseline.score
    ? ok("bazadan yuqori o'qituvchi yuqoriroq ball oladi")
    : bad("bazadan yuqori o'qituvchi yuqoriroq ball oladi", `${aboveBaseline.score} <= ${atBaseline.score}`);

  eq("uchala o'lchov ham o'lchandi", aboveBaseline.measured, 3);

  // --- O'lchanmagan o'qituvchi: null, 0 EMAS ---
  //
  // 0 berish uni ro'yxat TAGIGA tushirardi, ya'ni "yomon ishlayapti"
  // degan yolg'on xabar. null = "o'lchanmagan" va u reytingga kirmaydi.
  const unmeasured = scoreTeacher({
    outcome: { attendanceRate: null, gradeImprovement: null, gradeSamples: 0, lessons: 0 },
    payment: { onTimeRatio: null, periods: 0 },
    baseline,
  });
  unmeasured.score === null
    ? ok("ma'lumotsiz o'qituvchi ball olmaydi (null, 0 emas)")
    : bad("ma'lumotsiz o'qituvchi ball olmaydi", `kelgan ${unmeasured.score}`);

  // --- Bir o'lchov yo'q bo'lsa qolganlari bo'yicha to'liq baholanadi ---
  const noGrades = scoreTeacher({
    outcome: { attendanceRate: 0.88, gradeImprovement: null, gradeSamples: 0, lessons: 300 },
    payment: { onTimeRatio: 0.85, periods: 50 },
    baseline,
  });
  noGrades.score != null && noGrades.measured === 2
    ? ok("bahosi yo'q o'qituvchi qolgan 2 o'lchov bo'yicha baholandi")
    : bad("bahosi yo'q o'qituvchi qolgan 2 o'lchov bo'yicha baholandi", JSON.stringify(noGrades.measured));

  // --- (b) NISBIY GATE: real tarqalishda ishlashi SHART ---
  //
  // Bu aynan yiqilgan holat: eng yaxshi o'qituvchi 0.69 to'plagan.
  // Mutlaq chegara (0.72) bilan tavsiya hech kimga chiqmasdi.
  const realistic = { score: 0.66, confidence: 0.78, measured: 3 };
  qualifiesForRaise(realistic, baseline, { rank: 1, total: 40 })
    ? ok("40 o'qituvchidan 1-o'rin (0.66) maosh tavsiyasini oladi")
    : bad("40 o'qituvchidan 1-o'rin (0.66) maosh tavsiyasini oladi", "gate yetib bo'lmaydigan");

  // 5-o'rin 40 tadan = yuqori 12.5%, ya'ni 10% dan tashqarida.
  qualifiesForRaise(realistic, baseline, { rank: 5, total: 40 })
    ? bad("5-o'rin tavsiya OLMAYDI", "yuqori 10% dan tashqarida bo'lishi kerak")
    : ok("5-o'rin tavsiya olmaydi (yuqori 10% dan tashqarida)");

  // --- Mutlaq POL saqlanadi: "yomon jamoaning eng yaxshisi" ---
  //
  // Yuqori 10% da bo'lish o'rtachadan PAST bo'lishni istisno qilmaydi.
  // Hamma yomon ishlayotgan filialda 1-o'rin ham tavsiya olmasligi kerak.
  qualifiesForRaise(
    { score: 0.45, confidence: 0.9, measured: 3 },
    baseline,
    { rank: 1, total: 40 },
  )
    ? bad("bazadan past 1-o'rin tavsiya OLMAYDI", "mutlaq pol ishlamadi")
    : ok("bazadan past 1-o'rin tavsiya olmaydi (mutlaq pol)");

  // --- Kichik filialda ham ishlaydi (Math.ceil) ---
  qualifiesForRaise(realistic, baseline, { rank: 1, total: 6 })
    ? ok("6 o'qituvchilik filialda 1-o'rin tavsiya oladi")
    : bad("6 o'qituvchilik filialda 1-o'rin tavsiya oladi", "Math.ceil ishlamadi");

  // --- Tengdosh namunasi kichik bo'lsa tavsiya YO'Q ---
  qualifiesForRaise(realistic, { ...baseline, sampleSize: 2 }, { rank: 1, total: 2 })
    ? bad("2 o'qituvchilik filialda tavsiya YO'Q", "minPeerSample ishlamadi")
    : ok("2 o'qituvchilik filialda tavsiya yo'q (taqqoslash ma'nosiz)");

  // --- Ishonch past bo'lsa tavsiya YO'Q ---
  qualifiesForRaise({ score: 0.9, confidence: 0.3, measured: 3 }, baseline, { rank: 1, total: 40 })
    ? bad("ishonchsiz ball tavsiya BERMAYDI", "minConfidence ishlamadi")
    : ok("ishonchsiz ball tavsiya bermaydi");

  // --- Bitta o'lchovga tayangan baho tavsiya BERMAYDI ---
  qualifiesForRaise({ score: 0.9, confidence: 0.9, measured: 1 }, baseline, { rank: 1, total: 40 })
    ? bad("bitta o'lchovli baho tavsiya BERMAYDI", "minDimensions ishlamadi")
    : ok("bitta o'lchovli baho tavsiya bermaydi");

  RAISE_GATE.topPercentile > 0 && RAISE_GATE.minScore > 0.5
    ? ok("gate nisbiy VA mutlaq polga ega")
    : bad("gate nisbiy VA mutlaq polga ega", JSON.stringify(RAISE_GATE));
};

// ════════════════════════════════════════════════════════════════
// 15. SUBYEKT HAVOLALARI (DB kerak emas)
//
// Kartadagi ism bosilganda profilga o'tishi kerak. Eng muhim qoida:
// SAHIFASI YO'Q tur uchun havola BERILMAYDI - 404 ga olib boradigan
// havola umuman havolasizlikdan yomonroq, chunki u butun sahifaga
// ishonchni bir marotaba va butunlay yo'qotadi.
// ════════════════════════════════════════════════════════════════
const testSubjectLinks = async () => {
  head("15. SUBYEKT PROFIL HAVOLALARI");

  const { subjectHref } = await import(
    "../src/modules/ai/services/subjectLink.service.js"
  );
  const id = "6a6d0c6ade5ea2d6bbba81d5";

  eq("o'quvchi → /owner/users/:id", subjectHref("student", id), `/owner/users/${id}`);
  eq("o'qituvchi → /owner/users/:id", subjectHref("teacher", id), `/owner/users/${id}`);
  eq("guruh → /owner/groups/:id", subjectHref("group", id), `/owner/groups/${id}/o-quvchilar`);
  eq("lid → /owner/leads?leadId=", subjectHref("lead", id), `/owner/leads?leadId=${id}`);

  // Kurs sahifasi marshrutda YO'Q - havola ham bo'lmasligi kerak.
  subjectHref("course", id) === null
    ? ok("kurs uchun havola yo'q (sahifasi mavjud emas)")
    : bad("kurs uchun havola yo'q", subjectHref("course", id));

  subjectHref("student", null) === null
    ? ok("ID bo'lmasa havola yo'q")
    : bad("ID bo'lmasa havola yo'q", subjectHref("student", null));

  // BARCHA taksonomiya turlari qamrab olingan - yangi tur qo'shilsa
  // bu test uni eslatib turadi (jimgina havolasiz qolmasin).
  const uncovered = INSIGHT_SUBJECT_TYPES.filter(
    (t) => subjectHref(t, id) === undefined,
  );
  uncovered.length === 0
    ? ok("barcha subyekt turlari ko'rib chiqilgan", `${INSIGHT_SUBJECT_TYPES.length} ta`)
    : bad("barcha subyekt turlari ko'rib chiqilgan", uncovered.join(", "));
};

// ════════════════════════════════════════════════════════════════
// 17. HAVOLALAR HAQIQIY MARSHRUTGA TUSHADIMI  ← 404 REGRESSIYASI
//
// NEGA BU TEST BOR: AI kartasining butun ishonchliligi "Ishingni
// ko'rsat" havolalariga tayanadi - owner har bir raqamni bosib
// tekshira olishi kerak. Havola 404 qaytarsa, karta aynan TESKARI
// natija beradi: u tekshirib bo'lmaydigan da'vo bo'lib qoladi va
// owner butun sahifaga ishonishni to'xtatadi.
//
// HAQIQIY XATO: `/owner/students/:id?tab=finance` havolasi barcha
// to'lov insight'larida turardi, lekin marshrut jadvalida
// `students/:id` UMUMAN YO'Q - `students` ostida faqat statik tablar
// bor. Xato hech qanday testda ko'rinmasdi, chunki server tomonda
// havola shunchaki matn.
//
// USUL: marshrutlar frontend faylidan (routes/index.jsx) o'qiladi va
// AI modulidagi HAR BIR href shu jadvalga solishtiriladi. Ya'ni test
// ikki tomonni bog'laydi - marshrut o'chirilsa yoki qayta nomlansa,
// AI havolasi jimgina buzilmaydi.
// ════════════════════════════════════════════════════════════════
const ROUTES_FILE = new URL(
  "../../client/src/owner/routes/index.jsx",
  import.meta.url,
);

/**
 * routes/index.jsx dan to'liq marshrut ro'yxatini chiqaradi.
 *
 * JSX ni qo'lda o'qiymiz (parser kutubxonasiz): har `<Route` tegi
 * uchun `path` atributi olinadi va ichma-ich joylashuv stek bilan
 * kuzatiladi. `{...}` ichidagi `>` belgilari teg oxiri deb
 * hisoblanmaydi - element prop'larida JSX bo'ladi.
 */
const parseOwnerRoutes = (src) => {
  const routes = new Set();
  const stack = [];
  let i = 0;

  while (i < src.length) {
    const open = src.indexOf("<Route", i);
    const close = src.indexOf("</Route>", i);
    if (open === -1 && close === -1) break;

    if (close !== -1 && (open === -1 || close < open)) {
      stack.pop();
      i = close + 8;
      continue;
    }

    let j = open + 6;
    let depth = 0;
    let selfClose = false;
    for (; j < src.length; j += 1) {
      const c = src[j];
      if (c === "{") depth += 1;
      else if (c === "}") depth -= 1;
      else if (depth === 0 && c === ">") {
        selfClose = src[j - 1] === "/";
        break;
      }
    }

    const tag = src.slice(open, j + 1);
    const m = tag.match(/path="([^"]+)"/);
    const seg = m ? m[1] : null;
    if (seg) {
      const full = [...stack.filter(Boolean), seg].join("/");
      // YALANG'OCH `*` TASHLANADI - bu 404 sahifasining o'zi
      // (`<Route path="*" element={<NotFoundPage />} />`), manzil emas.
      //
      // Uni jadvalda qoldirish testni MA'NOSIZ qilardi: u har qanday
      // manzilga mos kelib, "hamma havola ishlaydi" deb yolg'on o'tardi.
      // Aynan shu holatni quyidagi salbiy nazorat tutdi.
      if (full !== "*") routes.add(`/owner/${full}`);
    }
    if (!selfClose) stack.push(seg);
    i = j + 1;
  }
  return routes;
};

/** Haqiqiy manzil marshrut naqshiga mos keladimi (`:param` har narsani yutadi). */
const matchesRoute = (href, routes) => {
  // Query va hash tashlanadi - marshrut ularni ko'rmaydi.
  const path = href.split("?")[0].split("#")[0].replace(/\/$/, "");
  const parts = path.split("/").filter(Boolean);

  for (const pattern of routes) {
    const pp = pattern.split("/").filter(Boolean);
    // `*` splat: shu joygacha mos kelsa yetarli.
    const splat = pp[pp.length - 1] === "*";
    if (!splat && pp.length !== parts.length) continue;
    if (splat && parts.length < pp.length - 1) continue;

    let okMatch = true;
    for (let k = 0; k < pp.length; k += 1) {
      if (pp[k] === "*") break;
      if (pp[k].startsWith(":")) continue; // parametr - har narsa mos
      if (pp[k] !== parts[k]) {
        okMatch = false;
        break;
      }
    }
    if (okMatch) return true;
  }
  return false;
};

const testHrefsResolve = async () => {
  head("17. AI HAVOLALARI HAQIQIY MARSHRUTGA TUSHADI (404 regressiyasi)");

  const fs = await import("node:fs");
  const path = await import("node:path");

  if (!fs.existsSync(ROUTES_FILE)) {
    ok("frontend marshrut fayli topilmadi - test o'tkazib yuborildi");
    return;
  }

  const routes = parseOwnerRoutes(fs.readFileSync(ROUTES_FILE, "utf8"));
  routes.size > 50
    ? ok("marshrut jadvali o'qildi", `${routes.size} ta`)
    : bad("marshrut jadvali o'qildi", `faqat ${routes.size} ta - parser buzuq`);

  // `users/:id` bo'lishi SHART: subjectHref butunlay shunga tayanadi.
  routes.has("/owner/users/:id")
    ? ok("/owner/users/:id marshruti mavjud")
    : bad("/owner/users/:id marshruti mavjud", "topilmadi");

  // --- (a) subjectLink.service.js chiqaradigan havolalar ---
  const { subjectHref } = await import(
    "../src/modules/ai/services/subjectLink.service.js"
  );
  const fakeId = "507f1f77bcf86cd799439011";
  let brokenSubject = 0;
  for (const type of INSIGHT_SUBJECT_TYPES) {
    const href = subjectHref(type, fakeId);
    if (href == null) continue; // sahifasi yo'q tur - ataylab havolasiz
    if (!matchesRoute(href, routes)) {
      brokenSubject += 1;
      bad(`  subjectHref("${type}")`, `${href} — marshrut yo'q`);
    }
  }
  eq("barcha subjectHref manzillari marshrutga tushadi", brokenSubject, 0);

  // --- (b) Barcha detektorlardagi `href:` matnlari ---
  //
  // Manba KOD o'zi skanerlanadi: shu tarzda yangi detektor qo'shilganda
  // uning havolasi ham avtomatik tekshiriladi - testni yangilash
  // kerak emas va yangi buzuq havola jimgina o'tib ketmaydi.
  const aiDir = path.resolve(
    path.dirname(new URL(import.meta.url).pathname),
    "../src/modules/ai",
  );
  const walk = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
      const p = path.join(dir, e.name);
      return e.isDirectory() ? walk(p) : p.endsWith(".js") ? [p] : [];
    });

  const found = [];
  for (const file of walk(aiDir)) {
    const text = fs.readFileSync(file, "utf8");
    for (const m of text.matchAll(/href: *[`"']([^`"']+)[`"']/g)) {
      // Shablon o'zgaruvchisi (`${id}`) o'rniga soxta ID qo'yamiz.
      const href = m[1].replace(/\$\{[^}]*\}/g, fakeId);
      if (!href.startsWith("/owner/")) continue;
      found.push({ href, file: path.basename(file) });
    }
  }

  found.length > 5
    ? ok("detektor havolalari topildi", `${found.length} ta`)
    : bad("detektor havolalari topildi", `faqat ${found.length} ta - skaner buzuq`);

  const broken = found.filter((f) => !matchesRoute(f.href, routes));
  eq("barcha detektor havolalari marshrutga tushadi", broken.length, 0);
  for (const b of broken) bad(`  ${b.file}`, `${b.href} — marshrut yo'q`);

  // --- (c) Salbiy nazorat: parser haqiqatan ham buzuqni TUTADIMI ---
  //
  // Busiz test jimgina "hammasi mos" deb o'tib ketishi mumkin edi
  // (mas. matchesRoute doim true qaytarsa).
  matchesRoute("/owner/bunday-sahifa-yoq/123", routes)
    ? bad("mavjud bo'lmagan manzil RAD ETILADI", "parser hammasini qabul qilyapti")
    : ok("mavjud bo'lmagan manzil rad etiladi (nazorat)");

  matchesRoute(`/owner/students/${fakeId}?tab=finance`, routes)
    ? bad("eski buzuq havola RAD ETILADI", "students/:id yo'q edi, lekin mos keldi")
    : ok("eski buzuq havola rad etiladi (students/:id yo'q)");
};

// ════════════════════════════════════════════════════════════════
const main = async () => {
  console.log("\n\x1b[1m AI MASLAHATCHI — TO'LIQ TEST\x1b[0m");

  // DB kerak bo'lmagan testlar
  testTaxonomy();
  testValidators();
  testRouteOrder();
  await testPeriodMeta();
  await testTeacherScoring();
  await testSubjectLinks();
  await testHrefsResolve();

  // DB testlari
  await mongoose.connect(TEST_DB);
  await mongoose.connection.dropDatabase();
  // Partial-unique indeks avtomatik qurilishini kutamiz - aks holda
  // dedup testi indekssiz ishlab, yolg'on "o'tdi" berardi.
  const Insight = (await import("../src/models/insight.model.js")).default;
  await Insight.syncIndexes();

  try {
    await runDbTests();
  } catch (err) {
    bad("DB testlari", `kutilmagan xato: ${err.message}`);
    console.error(err);
  } finally {
    await mongoose.connection.dropDatabase();
    await mongoose.disconnect();
  }

  const total = R.pass + R.fail;
  console.log(
    `\n\x1b[1mNATIJA:\x1b[0m ${R.pass}/${total} o'tdi` +
      (R.fail ? `, \x1b[31m${R.fail} yiqildi\x1b[0m` : ", \x1b[32mhammasi joyida\x1b[0m"),
  );
  if (R.failures.length) {
    console.log("\n\x1b[31mYIQILGANLAR:\x1b[0m");
    for (const f of R.failures) console.log(`  • ${f}`);
  }
  process.exit(R.fail ? 1 : 0);
};

main();
