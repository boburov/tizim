/**
 * MOLIYA UI SHARTNOMASI TEKSHIRUVI.
 *
 * ═══════════════════════════════════════════════════════════════════
 * NEGA BU TEKSHIRUV KERAK
 *
 * Moliya sahifasidagi xato YIQILMAYDI — u ekranga YOLG'ON RAQAM
 * chiqaradi. `value || 0` bitta belgidan iborat, lekin server `null`
 * qaytarganda (o'lchanmagan, taqqoslab bo'lmaydi) ekranda ishonchli
 * "0 so'm" paydo bo'ladi va owner uni FAKT deb o'qiydi.
 *
 * Client'da test freymvorki yo'q, shuning uchun qo'shni skriptlar
 * naqshiga ergashamiz (check-contrast, check-data-contract,
 * check-permission-keys): oddiy node skripti, nolga teng bo'lmagan
 * exit kod.
 * ═══════════════════════════════════════════════════════════════════
 *
 * ISHLATISH:  npm run check:finance-ui
 */
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("../src", import.meta.url).pathname;
const SERVER = new URL("../../server/src", import.meta.url).pathname;
const FEATURE = join(ROOT, "owner/features/financeAnalytics");

const problems = [];
const checks = [];
const ok = (n, extra = "") => checks.push({ n, extra, pass: true });
const fail = (n, why) => { checks.push({ n, extra: why, pass: false }); problems.push(`${n} — ${why}`); };

const walk = (dir, out = []) => {
  if (!existsSync(dir)) return out;
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.(js|jsx)$/.test(e)) out.push(p);
  }
  return out;
};

const files = walk(FEATURE);
const read = (p) => readFileSync(p, "utf8");

// ── 1) MODUL MAVJUD ──
if (!files.length) fail("Modul mavjud", "financeAnalytics papkasi bo'sh");
else ok("Modul mavjud", `${files.length} fayl`);

// ── 2) SOXTA QIYMAT NAQSHLARI ──
//
// Moliyaviy qiymat `|| 0` bilan to'ldirilsa, `null` (o'lchanmagan)
// ekranda "0" bo'lib chiqadi. Qiymat FAQAT MetricValue orqali
// ko'rsatilishi kerak — u `null` ni "—" ga aylantiradi.
const MONEY_WORDS = /(revenue|profit|amount|balance|outstanding|expected|collected|margin|payroll|fees|expense|discount|refund|variance|budget|actual|utilization)/i;
//
// ── FOYDALANUVCHI KIRITGAN QIYMAT ISTISNO ──
// Qoida SERVERDAN KELGAN o'lchovlarga tegishli: u yerda `null`
// "o'lchanmagan" degani va uni `0` bilan almashtirish YOLG'ON.
//
// Forma maydonida esa `null` degan tushuncha YO'Q — foydalanuvchi
// hali yozmagan bo'lsa bu haqiqatan ham nol summa va tasdiq matnida
// "0 so'm" ko'rsatish TO'G'RI. Shuning uchun `form.` dan kelgan
// qiymatlar chiqarib tashlanadi.
const badFallback = [];
for (const f of files) {
  const src = read(f);
  src.split("\n").forEach((line, i) => {
    const t = line.trim();
    if (t.startsWith("//") || t.startsWith("*")) return;
    if (!/(\|\||\?\?)\s*0\b/.test(line) || !MONEY_WORDS.test(line)) return;
    // Foydalanuvchi kiritgan qiymat (forma holati) — istisno.
    if (/\bform\.|\bdraft\.|\bvalues\./.test(line)) return;
    // OCHIQ BELGI: `// draft-input` — qator foydalanuvchi terayotgan
    // qoralama qiymat ustida ishlaydi, server o'lchovi emas.
    // Belgi ATAYLAB ochiq yoziladi: uni qo'yish ongli qaror bo'lsin
    // va kod ko'rigida ko'zga tashlansin.
    if (/draft-input/.test(line)) return;
    badFallback.push(`${relative(ROOT, f)}:${i + 1}  ${t.slice(0, 80)}`);
  });
}
if (badFallback.length) {
  fail("Soxta `|| 0` yo'q", `${badFallback.length} joyda:\n      ` + badFallback.join("\n      "));
} else ok("Soxta `|| 0` yo'q", "moliyaviy qiymatlar null-xavfsiz");

// ── 3) MOCK MA'LUMOT YO'Q ──
const mock = [];
for (const f of files) {
  const src = read(f);
  if (/\b(mockData|fakeData|dummyData|sampleData|MOCK_|FAKE_)\b/.test(src)) {
    mock.push(relative(ROOT, f));
  }
}
if (mock.length) fail("Mock ma'lumot yo'q", mock.join(", "));
else ok("Mock ma'lumot yo'q", "hamma raqam API dan");

// ── 4) FRONTEND'DA MOLIYAVIY HISOB-KITOB YO'Q ──
//
// `reduce` bilan "jami" chiqarish eng keng tarqalgan drift manbai:
// u backend jamisidan farq qiladi (backend qaytarim va ichki
// o'tkazmani boshqacha hisoblaydi). Ruxsat etilgan yagona joy —
// diagramma uchun ulush/maksimum hisoblash.
const calc = [];
for (const f of files) {
  const src = read(f);
  src.split("\n").forEach((line, i) => {
    if (/draft-input/.test(line)) return;
    if (/\.reduce\(/.test(line) && MONEY_WORDS.test(line)) {
      calc.push(`${relative(ROOT, f)}:${i + 1}  ${line.trim().slice(0, 70)}`);
    }
  });
}
// Aging diagrammasidagi yig'indi ruxsat etilgan (u faqat ulush foizi
// uchun, ekranga alohida raqam sifatida chiqmaydi).
const disallowed = calc.filter((c) => !/agingTotal|ReceivablesSection/.test(c));
if (disallowed.length) {
  fail("Frontend moliyaviy hisob qilmaydi", disallowed.join("\n      "));
} else ok("Frontend moliyaviy hisob qilmaydi", calc.length ? `${calc.length} ta ruxsat etilgan (diagramma ulushi)` : "toza");

// ── 5) ENDPOINT'LAR MAVJUD ──
const endpointsSrc = read(join(ROOT, "shared/api/endpoints.js"));
const REQUIRED_ENDPOINTS = [
  "summary", "alerts", "revenueTrend", "revenueBy", "paymentMethods", "refunds",
  "discounts", "expenseTrend", "expenseBreakdown", "costStructure", "recurring",
  "budget", "cashFlow", "accounts", "cashTrend", "receivables", "receivablesBy",
  "teachers", "directions", "groups", "rooms", "branches",
];
const analyticsBlock = endpointsSrc.slice(
  endpointsSrc.indexOf("financeAnalytics:"),
  endpointsSrc.indexOf("financeReport:"),
);
const missingEp = REQUIRED_ENDPOINTS.filter((k) => !new RegExp(`\\b${k}\\s*:`).test(analyticsBlock));
if (missingEp.length) fail("22 tahlil endpoint'i", `yo'q: ${missingEp.join(", ")}`);
else ok("22 tahlil endpoint'i", `${REQUIRED_ENDPOINTS.length} ta`);

// ── 6) SERVER MARSHRUTLARI BILAN MOSLIK ──
const serverRoutes = read(join(SERVER, "modules/financeAnalytics/financeAnalytics.routes.js"));
const norm = (p) => p.replace(/:[A-Za-z]+/g, ":p").replace(/\$\{[^}]+\}/g, ":p");
const serverPaths = [...serverRoutes.matchAll(/router\.get\("([^"]+)"/g)].map((m) => norm(m[1]));
const clientPaths = [...analyticsBlock.matchAll(/"\/finance-analytics([^"`]*)"/g)].map((m) => norm(m[1]));
const clientTemplates = [...analyticsBlock.matchAll(/`\/finance-analytics([^`]*)`/g)].map((m) => norm(m[1]));
const allClient = [...clientPaths, ...clientTemplates];
const unmatched = serverPaths.filter((sp) => !allClient.includes(sp));
if (unmatched.length) fail("Server marshrutlari qoplangan", `client'da yo'q: ${unmatched.join(", ")}`);
else ok("Server marshrutlari qoplangan", `${serverPaths.length} marshrut`);

// ── 7) RUXSAT MOSLIGI (client ↔ server) ──
//
// Bu ENG QIMMAT drift: client `PERMISSION_IMPLIES` serverdan orqada
// qolsa, huquqi BOR foydalanuvchida tugma yashirinadi — va buni
// hech qanday xato ko'rsatmaydi.
const clientImplies = read(join(ROOT, "shared/hooks/usePermissions.js"));
const serverImplies = read(join(SERVER, "helpers/permission.helper.js"));
const parseImplies = (src) => {
  const block = src.slice(src.indexOf("PERMISSION_IMPLIES"), src.indexOf("};", src.indexOf("PERMISSION_IMPLIES")));
  const out = {};
  for (const m of block.matchAll(/"([a-z_.]+)":\s*\[([^\]]*)\]/g)) {
    out[m[1]] = [...m[2].matchAll(/"([a-z_.]+)"/g)].map((x) => x[1]).sort();
  }
  return out;
};
const ci = parseImplies(clientImplies);
const si = parseImplies(serverImplies);
const impliesDiff = [];
for (const k of new Set([...Object.keys(ci), ...Object.keys(si)])) {
  const a = (ci[k] || []).join(",");
  const b = (si[k] || []).join(",");
  if (a !== b) impliesDiff.push(`${k}: client=[${a}] server=[${b}]`);
}
if (impliesDiff.length) fail("Ruxsat iyerarxiyasi mos", impliesDiff.join("; "));
else ok("Ruxsat iyerarxiyasi mos", `${Object.keys(si).length} qoida`);

// ── 8) SEZGIR BO'LIMLAR QO'RIQLANGAN ──
const pageSrc = read(join(FEATURE, "pages/FinanceCommandPage.jsx"));
const profitSrc = read(join(FEATURE, "components/sections/ProfitabilitySection.jsx"));
const gates = [
  ["FINANCE_VIEW_PROFITABILITY", profitSrc],
  ["FINANCE_VIEW_CASHFLOW", pageSrc],
  ["FINANCE_VIEW_RECEIVABLES", pageSrc],
  ["FINANCE_READ", pageSrc],
];
const ungated = gates.filter(([k, src]) => !src.includes(k)).map(([k]) => k);
if (ungated.length) fail("Sezgir bo'limlar qo'riqlangan", `tekshiruvsiz: ${ungated.join(", ")}`);
else ok("Sezgir bo'limlar qo'riqlangan", "4 ruxsat");

// O'qituvchi foydaliligi maosh ruxsatini HAM talab qilishi kerak
if (!/SALARY_READ|PAYROLL_READ/.test(profitSrc)) {
  fail("O'qituvchi kesimi maosh ruxsatini talab qiladi", "salary.read/payroll.read tekshiruvi yo'q");
} else ok("O'qituvchi kesimi maosh ruxsatini talab qiladi");

// ── 9) HOLAT KO'RINISHLARI ──
const stateSrc = read(join(FEATURE, "components/StateBlock.jsx"));
const states = ["LoadingBlock", "EmptyBlock", "ErrorBlock", "DeniedBlock"];
const missingState = states.filter((s) => !stateSrc.includes(`export const ${s}`));
if (missingState.length) fail("To'rt holat mavjud", missingState.join(", "));
else ok("To'rt holat mavjud", states.join(", "));

// ── 10) NULL-XAVFSIZ KO'RSATISH ──
const metricSrc = read(join(FEATURE, "components/MetricValue.jsx"));
if (!metricSrc.includes("isMissing") || !metricSrc.includes("Dash")) {
  fail("MetricValue null-xavfsiz", "isMissing/Dash topilmadi");
} else ok("MetricValue null-xavfsiz", "null → '—'");

// ── NATIJA ──
console.log("\nMOLIYA UI SHARTNOMASI\n");
for (const c of checks) {
  console.log(`  ${c.pass ? "✅" : "❌"} ${c.n}${c.extra ? ` — ${c.extra}` : ""}`);
}
console.log(`\n${checks.filter((c) => c.pass).length}/${checks.length} tekshiruv o'tdi\n`);
if (problems.length) process.exit(1);
