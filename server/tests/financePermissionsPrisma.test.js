/**
 * MOLIYA RUXSATLARI (STEP 5.1) — PostgreSQL (Prisma) USTIDA.
 *
 * SAVOL: "moliyani ko'rish" huquqi berilgan xodim bexosdan
 * O'QITUVCHILAR MAOSHINI ko'ra oladimi?
 *
 * Ilgari javob HA edi: `/finance-analytics/teachers` marshruti
 * `finance.read` bilan ochilardi va u har bir o'qituvchining
 * tannarxini (payroll) qaytaradi.
 *
 * Bu test o'sha teshik yopilganini va ESKI ROLLAR BUZILMAGANINI
 * tekshiradi.
 *
 * ISHLATISH:  npm run test:fin-perms
 */
import "dotenv/config";
import prisma from "../src/config/prisma.js";
import { hasPermission, hasAnyPermission } from "../src/helpers/permission.helper.js";
import { PERMISSIONS } from "../src/constants/permissions.js";
import { OWNER_ONLY_PERMISSIONS, BRANCH_LOCAL_PERMISSIONS } from "../src/constants/permissionScope.js";
import router from "../src/modules/financeAnalytics/financeAnalytics.routes.js";

const R = { pass: 0, fail: 0, failures: [] };
const ok = (n, e = "") => { R.pass += 1; console.log(`  ✅ ${n}${e ? ` — ${e}` : ""}`); };
const bad = (n, e = "") => { R.fail += 1; R.failures.push(`${n} — ${e}`); console.log(`  ❌ ${n} — ${e}`); };
const eq = (n, a, b) => (a === b ? ok(n, String(a)) : bad(n, `kutilgan ${b}, keldi ${a}`));
const head = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

/** Marshrutga berilgan ruxsat kalitlarini middleware zanjiridan chiqaradi. */
const guardsOf = (path) => {
  const layer = router.stack.find((l) => l.route?.path === path);
  if (!layer) return null;
  // `requirePermission(...keys)` closure — kalitlarni to'g'ridan-to'g'ri
  // o'qib bo'lmaydi, shuning uchun soxta so'rov bilan SINAB ko'ramiz.
  return layer.route.stack.map((s) => s.handle);
};

/** Berilgan ruxsatlar to'plami bilan marshrutdan o'tadimi. */
const canAccess = (path, permissions) => {
  const handlers = guardsOf(path);
  if (!handlers) return null;
  let passed = true;
  for (const h of handlers) {
    if (h.length !== 3) continue; // faqat (req,res,next) middleware
    let blocked = false;
    const req = { user: { id: "x" }, permissions, query: {}, params: {} };
    try {
      h(req, {}, (err) => { if (err) blocked = true; });
    } catch { /* validate/handler — e'tiborsiz */ }
    if (blocked) { passed = false; break; }
  }
  return passed;
};

const run = async () => {
  console.log("\n=== MOLIYA RUXSATLARI / STEP 5.1 ===\n");

  // ══════════ 1) SEZGIR MARSHRUTLAR YOPIQ ══════════
  head("1) `finance.read` SEZGIR bo'limlarni OCHMAYDI");
  const readOnly = ["finance.read"];
  eq("/teachers yopiq", canAccess("/teachers", readOnly), false);
  eq("/directions yopiq", canAccess("/directions", readOnly), false);
  eq("/groups yopiq", canAccess("/groups", readOnly), false);
  eq("/rooms yopiq", canAccess("/rooms", readOnly), false);
  eq("/branches yopiq", canAccess("/branches", readOnly), false);
  eq("/cash-flow yopiq", canAccess("/cash-flow", readOnly), false);
  eq("/receivables yopiq", canAccess("/receivables", readOnly), false);

  head("1b) Lekin umumiy bo'limlar OCHIQ qoladi");
  eq("/summary ochiq", canAccess("/summary", readOnly), true);
  eq("/revenue/trend ochiq", canAccess("/revenue/trend", readOnly), true);
  eq("/expenses/breakdown ochiq", canAccess("/expenses/breakdown", readOnly), true);
  eq("/budget ochiq", canAccess("/budget", readOnly), true);
  eq("/alerts ochiq", canAccess("/alerts", readOnly), true);

  // ══════════ 2) TO'G'RI RUXSAT OCHADI ══════════
  head("2) Aniq ruxsat berilganda ochiladi");
  eq("/cash-flow + view_cashflow", canAccess("/cash-flow", ["finance.view_cashflow"]), true);
  eq("/receivables + view_receivables", canAccess("/receivables", ["finance.view_receivables"]), true);
  eq("/directions + view_profitability", canAccess("/directions", ["finance.view_profitability"]), true);

  // ══════════ 3) O'QITUVCHI KESIMI — IKKI QAVATLI ══════════
  head("3) `/teachers` — foydalilik VA maosh ruxsati (IKKALASI)");
  eq("faqat view_profitability YETARLI EMAS",
    canAccess("/teachers", ["finance.view_profitability"]), false);
  eq("faqat salary.read YETARLI EMAS",
    canAccess("/teachers", ["salary.read"]), false);
  eq("view_profitability + salary.read → ochiq",
    canAccess("/teachers", ["finance.view_profitability", "salary.read"]), true);
  eq("view_profitability + payroll.read → ochiq",
    canAccess("/teachers", ["finance.view_profitability", "payroll.read"]), true);

  // ══════════ 4) ESKI ROLLAR BUZILMADI ══════════
  head("4) Moslik — eski kalitlar yangi nomlarni qamraydi");
  eq("expenses.create → finance.create_expense",
    hasPermission(["expenses.create"], PERMISSIONS.FINANCE_CREATE_EXPENSE), true);
  eq("expenses.manage → finance.manage_expense",
    hasPermission(["expenses.manage"], PERMISSIONS.FINANCE_MANAGE_EXPENSE), true);
  eq("finance.manage → finance.manage_accounts",
    hasPermission(["finance.manage"], PERMISSIONS.FINANCE_MANAGE_ACCOUNTS), true);
  eq("finance.manage → finance.manage_refunds",
    hasPermission(["finance.manage"], PERMISSIONS.FINANCE_MANAGE_REFUNDS), true);
  eq("finance.pay → finance.manage_transfers",
    hasPermission(["finance.pay"], PERMISSIONS.FINANCE_MANAGE_TRANSFERS), true);

  head("4b) Lekin moslik SEZGIR kalitga TARQALMAYDI");
  eq("finance.read ⇏ view_profitability",
    hasPermission(["finance.read"], PERMISSIONS.FINANCE_VIEW_PROFITABILITY), false);
  eq("finance.manage ⇏ view_profitability",
    hasPermission(["finance.manage"], PERMISSIONS.FINANCE_VIEW_PROFITABILITY), false);
  eq("expenses.manage ⇏ view_cashflow",
    hasPermission(["expenses.manage"], PERMISSIONS.FINANCE_VIEW_CASHFLOW), false);

  // ══════════ 5) KATALOG BUTUNLIGI ══════════
  head("5) Katalog butunligi");
  const NEW_KEYS = [
    PERMISSIONS.FINANCE_CREATE_EXPENSE, PERMISSIONS.FINANCE_MANAGE_EXPENSE,
    PERMISSIONS.FINANCE_MANAGE_ACCOUNTS, PERMISSIONS.FINANCE_MANAGE_REFUNDS,
    PERMISSIONS.FINANCE_MANAGE_TRANSFERS, PERMISSIONS.FINANCE_VIEW_PROFITABILITY,
    PERMISSIONS.FINANCE_VIEW_CASHFLOW, PERMISSIONS.FINANCE_VIEW_RECEIVABLES,
  ];
  const inDb = await prisma.permission.findMany({
    where: { key: { in: NEW_KEYS } }, select: { key: true },
  });
  eq("8 ta yangi ruxsat bazada", inDb.length, 8);

  const ownerRole = await prisma.role.findUnique({
    where: { value: "owner" }, include: { permissions: { select: { key: true } } } });
  const ownerKeys = ownerRole.permissions.map((p) => p.key);
  eq("owner hammasiga ega", NEW_KEYS.every((k) => ownerKeys.includes(k)), true);

  const dirRole = await prisma.role.findUnique({
    where: { value: "director" }, include: { permissions: { select: { key: true } } } });
  const dirKeys = dirRole.permissions.map((p) => p.key);
  eq("direktor hammasiga ega (filial ichi)", NEW_KEYS.every((k) => dirKeys.includes(k)), true);

  // Direktorga owner-only kalit SIZIB KIRMAGAN
  const leaked = OWNER_ONLY_PERMISSIONS.filter((k) => dirKeys.includes(k));
  eq("direktorda owner-only kalit yo'q", leaked.length, 0);
  eq("yangi kalitlar filial-ichi ro'yxatida",
    NEW_KEYS.every((k) => BRANCH_LOCAL_PERMISSIONS.includes(k)), true);

  // ══════════ 6) RUXSATSIZ FOYDALANUVCHI ══════════
  head("6) Ruxsatsiz foydalanuvchi");
  eq("bo'sh ruxsat — /summary yopiq", canAccess("/summary", []), false);
  eq("bo'sh ruxsat — /teachers yopiq", canAccess("/teachers", []), false);
  eq("`*` (superuser) hammasini ochadi", hasAnyPermission(["*"], [PERMISSIONS.FINANCE_VIEW_PROFITABILITY]), true);

  console.log(`\n=== NATIJA: ${R.pass} o'tdi, ${R.fail} yiqildi ===\n`);
  if (R.failures.length) { console.log("Muammolar:"); for (const f of R.failures) console.log("  • " + f); }
};

run()
  .catch((err) => { console.error("\nTEST YIQILDI:", err); R.fail += 1; })
  .finally(async () => { await prisma.$disconnect(); process.exit(R.fail ? 1 : 0); });
