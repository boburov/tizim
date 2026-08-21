import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requirePermission from "../../middleware/requirePermission.js";
import validate from "../../middleware/validate.js";
import { PERMISSIONS } from "../../constants/permissions.js";
import ApiError from "../../utils/ApiError.js";
import { hasAnyPermission } from "../../helpers/permission.helper.js";

import {
  analyticsFilterSchema,
  breakdownSchema,
  expenseBreakdownSchema,
  receivablesBreakdownSchema,
  entryIdSchema,
  alertIdSchema,
  studentIdSchema,
} from "./validators/analytics.validator.js";

import summary from "./handlers/summary.handler.js";
import revenueTrend from "./handlers/revenueTrend.handler.js";
import revenueBy from "./handlers/revenueBy.handler.js";
import paymentMethods from "./handlers/paymentMethods.handler.js";
import refunds from "./handlers/refunds.handler.js";
import expenseTrend from "./handlers/expenseTrend.handler.js";
import expenseBreakdown from "./handlers/expenseBreakdown.handler.js";
import expenseBy from "./handlers/expenseBy.handler.js";
import studentProfile from "./handlers/studentProfile.handler.js";
import costStructure from "./handlers/costStructure.handler.js";
import recurringSplit from "./handlers/recurringSplit.handler.js";
import budget from "./handlers/budget.handler.js";
import cashFlow from "./handlers/cashFlow.handler.js";
import accounts from "./handlers/accounts.handler.js";
import cashTrend from "./handlers/cashTrend.handler.js";
import receivables from "./handlers/receivables.handler.js";
import receivablesBy from "./handlers/receivablesBy.handler.js";
import teachers from "./handlers/teachers.handler.js";
import directions from "./handlers/directions.handler.js";
import groups from "./handlers/groups.handler.js";
import rooms from "./handlers/rooms.handler.js";
import branches from "./handlers/branches.handler.js";
import discounts from "./handlers/discounts.handler.js";
import alerts from "./handlers/alerts.handler.js";
import entryDetail from "./handlers/entryDetail.handler.js";
import entryList from "./handlers/entryList.handler.js";
import * as intelligence from "./handlers/intelligence.handler.js";

/**
 * MOLIYA TAHLILI — FAQAT O'QISH.
 *
 * Bu modulda birorta yozuv endpoint'i YO'Q va bo'lmasligi kerak: hisob
 * yozish `financialTransaction.service.js` da, bu yer esa uning
 * ustidagi o'qish qatlami. Aralashtirilsa ikkinchi haqiqat manbai
 * paydo bo'lardi.
 *
 * ── FILIAL KO'LAMI ──
 * Barcha so'rov `branchFilter()` ostida (analyticsFilter.js →
 * `branchClause`), ya'ni filial direktori faqat o'z raqamlarini
 * ko'radi. Bo'sh ro'yxatda `AND FALSE` — fail-closed.
 *
 * ── RUXSAT (STEP 5.1) ──
 * Granulyar model. `finance.read` — umumiy o'qish, lekin u SEZGIR
 * bo'limlarni QAMRAMAYDI:
 *
 *   /summary /revenue /expenses /budget ...  → finance.read
 *   /cash-flow*                              → finance.view_cashflow
 *   /receivables*                            → finance.view_receivables
 *   /teachers /directions /groups /rooms
 *   /branches                                → finance.view_profitability
 *
 * ⚠ `/teachers` QO'SHIMCHA ravishda maosh ruxsatini talab qiladi:
 * u har bir o'qituvchining tannarxini (payroll) ochiq ko'rsatadi.
 * Ikkala shart HAM bajarilishi kerak, shuning uchun ketma-ket
 * ikkita middleware (`requirePermission` o'zi OR ishlatadi).
 *
 * NEGA /directions /groups /rooms /branches HAM foydalilik ruxsatini
 * talab qiladi: ular ham `payroll` va `directCosts` ustunlarini
 * qaytaradi — o'qituvchi ismisiz, lekin guruh bittagina o'qituvchiga
 * tegishli bo'lsa maosh baribir kelib chiqadi.
 */
const router = Router();

const canRead = [requireAuth, requirePermission(PERMISSIONS.FINANCE_READ)];
const canViewCashflow = [requireAuth, requirePermission(PERMISSIONS.FINANCE_VIEW_CASHFLOW)];
const canViewReceivables = [requireAuth, requirePermission(PERMISSIONS.FINANCE_VIEW_RECEIVABLES)];
const canViewProfit = [requireAuth, requirePermission(PERMISSIONS.FINANCE_VIEW_PROFITABILITY)];
// O'qituvchi kesimi: foydalilik ruxsati VA maosh ruxsati — IKKALASI.
const canViewTeacherProfit = [
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_VIEW_PROFITABILITY),
  requirePermission(PERMISSIONS.SALARY_READ, PERMISSIONS.PAYROLL_READ),
];

const F = validate(analyticsFilterSchema);

/**
 * CHIQIM KESIMI — O'LCHOVGA QARAB RUXSAT.
 *
 * `category` / `costType` / `branch` — oddiy moliyaviy ko'rinish.
 * `person` / `teacher` esa MAOSHNI ODAM BO'YICHA ochadi ("O'qituvchi A
 * — 1.4 mln"), ya'ni `/teachers` jadvali bilan bir xil sezgirlikda.
 *
 * Marshrutni ikkiga bo'lish mumkin edi, lekin unda client ikkita
 * manzilni bilishi kerak bo'lardi. O'lcham bitta parametr — tekshiruv
 * ham shu yerda, so'rov servisga YETIB BORMASDAN oldin.
 */
const PAYROLL_DIMENSIONS = Object.freeze(["person", "teacher"]);

const guardExpenseDimension = (req, _res, next) => {
  if (!PAYROLL_DIMENSIONS.includes(req.params.by)) return next();
  // `hasAnyPermission` — xom `.includes()` EMAS: u PERMISSION_IMPLIES
  // iyerarxiyasini hisobga oladi, ya'ni qoida modul bo'ylab bir xil.
  const ok = hasAnyPermission(req.permissions, [
    PERMISSIONS.SALARY_READ,
    PERMISSIONS.PAYROLL_READ,
  ]);
  if (ok) return next();
  return next(new ApiError(403, "Maosh ma'lumotini ko'rish uchun ruxsat yo'q"));
};

// ── UMUMIY ──
router.get("/summary", ...canRead, F, summary);

// ── TRANZAKSIYA TAFSILOTI (STEP 7) ──
// Tahlildagi HAR QANDAY summani jurnal yozuvigacha kuzatish nuqtasi.
//
// Ruxsat: `finance.read` — bu oddiy moliyaviy hujjat. LEKIN maosh
// yozuvi (`kind = "salary"`) uchun servis QO'SHIMCHA ravishda
// `salary.read` yoki `payroll.read` talab qiladi: aks holda
// `/teachers` jadvali yopiq bo'lgan xodim maosh yozuvlarini bittalab
// ochib, o'sha ma'lumotni yig'ib olardi (yon eshik).
// RO'YXAT — jamlanma bilan tafsilot orasidagi ko'prik. Maosh
// yozuvlari ruxsatsiz foydalanuvchida ro'yxatdan CHIQARILADI.
router.get("/entries", ...canRead, F, entryList);
// O'QUVCHINING MOLIYAVIY YO'LI (talab 15) — zanjirning odam bo'g'ini.
// `finance.read`: bu o'quvchining to'lov holati, maosh emas.
router.get("/students/:id", ...canRead, validate(studentIdSchema), studentProfile);
router.get("/entries/:id", ...canRead, validate(entryIdSchema), entryDetail);
router.get("/alerts", ...canRead, F, alerts);

// ══════════════════════════════════════════════════════════════════
// MOLIYAVIY INTELLEKT (STEP 8)
//
// Determinstik qoidalar tahlil ustida ishlaydi — LLM aniqlashda
// QATNASHMAYDI. AI faqat `/alerts/:alertId?explain=true` da va
// faqat foydalanuvchi so'raganda matn yozadi.
//
// RUXSAT: `finance.read`. Maoshga bog'liq qoidalar servis ichida
// `salary.read`/`payroll.read` bo'yicha filtrlanadi — ular umuman
// hisoblanmaydi, ya'ni AI ga ham yetib bormaydi.
// ══════════════════════════════════════════════════════════════════
router.get("/intelligence", ...canRead, F, intelligence.overview);
router.get("/intelligence/alerts", ...canRead, F, intelligence.alerts);
router.get("/intelligence/briefing", ...canRead, F, intelligence.briefing);
router.get("/intelligence/alerts/:alertId", ...canRead, validate(alertIdSchema), intelligence.alertDetail);

// ── DAROMAD ──
router.get("/revenue/trend", ...canRead, F, revenueTrend);
router.get("/revenue/by/:by", ...canRead, validate(breakdownSchema), revenueBy);
router.get("/payment-methods", ...canRead, F, paymentMethods);
router.get("/refunds", ...canRead, F, refunds);
router.get("/discounts", ...canRead, F, discounts);

// ── CHIQIM ──
router.get("/expenses/trend", ...canRead, F, expenseTrend);
router.get("/expenses/breakdown", ...canRead, F, expenseBreakdown);
// "PUL QAYERGA KETDI" zanjiri: kategoriya → odam → yozuvlar (talab 10).
router.get(
  "/expenses/by/:by",
  ...canRead,
  validate(expenseBreakdownSchema),
  guardExpenseDimension,
  expenseBy,
);
router.get("/expenses/cost-structure", ...canRead, F, costStructure);
router.get("/expenses/recurring", ...canRead, F, recurringSplit);
router.get("/budget", ...canRead, F, budget);

// ── PUL ──
router.get("/cash-flow", ...canViewCashflow, F, cashFlow);
router.get("/cash-flow/accounts", ...canViewCashflow, F, accounts);
router.get("/cash-flow/trend", ...canViewCashflow, F, cashTrend);

// ── DEBITORLIK ──
router.get("/receivables", ...canViewReceivables, F, receivables);
router.get("/receivables/by/:by", ...canViewReceivables, validate(receivablesBreakdownSchema), receivablesBy);

// ── FOYDALILIK ──
router.get("/teachers", ...canViewTeacherProfit, F, teachers);
router.get("/directions", ...canViewProfit, F, directions);
router.get("/groups", ...canViewProfit, F, groups);
router.get("/rooms", ...canViewProfit, F, rooms);
router.get("/branches", ...canViewProfit, F, branches);

export default router;
