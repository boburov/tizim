import { hasAnyPermission } from "../../../helpers/permission.helper.js";
import { PERMISSIONS } from "../../../constants/permissions.js";
import { parseRange, previousRange } from "./analyticsFilter.js";
import * as summarySvc from "./summary.service.js";
import * as expenseSvc from "./expense.service.js";
import * as revenueSvc from "./revenue.service.js";
import * as discountSvc from "./discount.service.js";
import * as receivablesSvc from "./receivables.service.js";
import * as profitSvc from "./profitability.service.js";
import { ALL_RULES, THRESHOLDS, SEVERITY } from "./intelligenceRules.js";

/**
 * ══════════════════════════════════════════════════════════════════════
 * MOLIYAVIY INTELLEKT — tahlil ustidagi QOIDA qatlami
 * ══════════════════════════════════════════════════════════════════════
 *
 *   jurnal  →  tahlil  →  QOIDALAR  →  (ixtiyoriy) LLM  →  UI
 *              ▲           ▲            ▲
 *              │           │            └── faqat SO'ZLAR
 *              │           └── taqqoslash, chegara
 *              └── barcha raqam SHU YERDA hisoblanadi
 *
 * ── BU SERVIS MOLIYAVIY RAQAM HISOBLAMAYDI ──
 * U bazaga umuman murojaat qilmaydi. Kirish — tahlil servislarining
 * natijalari, chiqish — tuzilmali signallar. Shuning uchun "AI boshqa
 * raqam ko'rsatyapti" holati TUZILMA DARAJASIDA mumkin emas.
 *
 * ── MAOSH YON ESHIGI YOPIQ (talab N) ──
 * O'qituvchi foydaliligi maosh tannarxidan kelib chiqadi. Ruxsati
 * bo'lmagan foydalanuvchi uchun:
 *   • o'qituvchi qoidasi UMUMAN ishga tushmaydi (so'rov ham yuborilmaydi)
 *   • uning dalillari LLM ga ham BERILMAYDI
 * Ya'ni filtr AI qatlamidan OLDIN, manba darajasida.
 */

const canSeePayroll = (permissions = []) =>
  hasAnyPermission(permissions, [PERMISSIONS.SALARY_READ, PERMISSIONS.PAYROLL_READ]);

/** Davr yorlig'i — taqqoslash asosi HAR DOIM ko'rsatiladi (talab K). */
const comparisonBasis = (range, prev) => {
  const days = Math.round((range.to - range.from) / 86_400_000);
  const isMonth =
    range.from.getUTCDate() === 1 &&
    range.from.getUTCMonth() === range.to.getUTCMonth();
  return {
    label: isMonth ? "Oldingi oy" : `Oldingi ${days} kun`,
    current: { from: range.from, to: range.to },
    previous: { from: prev.from, to: prev.to },
  };
};

/**
 * MA'LUMOT SIFATI (talab H).
 *
 * Ishonch "yuqori" deb aytilishi uchun ASOS bo'lishi kerak. Bu yerda
 * har cheklov OCHIQ sanaladi — foydalanuvchi tavsiyaga qanchalik
 * ishonishni O'ZI hal qiladi.
 */
const buildDataQuality = ({ teachers, rooms, summary, canPayroll }) => {
  const reasons = [];

  const coverage = teachers?.attribution?.coveragePercent ?? null;
  if (canPayroll && coverage !== null && coverage < 90) {
    reasons.push(`O'qituvchi atributsiyasi qamrovi ${coverage}% — bir qism daromad bog'lanmagan`);
  }
  if (rooms?.availableHoursBasis?.assumption) {
    reasons.push(
      `Xona bandligi taxminga tayanadi: ${rooms.availableHoursBasis.workingHoursPerDay} soat × `
      + `${rooms.availableHoursBasis.workingDaysPerWeek} kun`,
    );
  }
  if (!canPayroll) {
    reasons.push("Maosh ma'lumoti ko'rsatilmadi — o'qituvchi tahlili chiqarib tashlangan");
  }
  // Oldingi davrda ma'lumot bo'lmasa taqqoslash ma'nosiz.
  if ((summary?.revenue?.previous ?? 0) === 0) {
    reasons.push("Oldingi davrda daromad yozuvi yo'q — o'sish foizi hisoblanmadi");
  }

  return {
    level: reasons.length === 0 ? "high" : "limited",
    reasons,
    teacherAttributionCoverage: coverage,
    roomHoursAssumption: Boolean(rooms?.availableHoursBasis?.assumption),
  };
};

/**
 * BARCHA MANBA TAHLILLARINI YIG'ADI.
 *
 * Parallel — ketma-ket bo'lsa sahifa sekinlashardi. O'qituvchi
 * so'rovi ruxsat bo'lmasa UMUMAN yuborilmaydi.
 */
const collectContext = async (filters, { canPayroll }) => {
  const range = parseRange(filters);
  const prev = previousRange(range);
  const prevFilters = {
    ...filters,
    from: prev.from.toISOString().slice(0, 10),
    to: prev.to.toISOString().slice(0, 10),
    year: undefined,
    month: undefined,
  };

  const [
    summary, expenses, discounts, refunds, receivables,
    directions, directionsPrev, rooms, groups, budget,
    teachers, teachersPrev,
  ] = await Promise.all([
    summarySvc.getSummary(filters),
    expenseSvc.getExpenseBreakdown(filters),
    discountSvc.getDiscountAnalytics(filters),
    revenueSvc.getRefundAnalytics(filters),
    receivablesSvc.getReceivables(filters),
    profitSvc.getDirectionProfitability(filters),
    profitSvc.getDirectionProfitability(prevFilters),
    profitSvc.getRoomRevenue(filters),
    profitSvc.getGroupProfitability(filters),
    expenseSvc.getBudgetPerformance(filters),
    canPayroll ? profitSvc.getTeacherProfitability(filters) : Promise.resolve(null),
    canPayroll ? profitSvc.getTeacherProfitability(prevFilters) : Promise.resolve(null),
  ]);

  return {
    range, prev,
    summary, expenses, discounts, refunds, receivables,
    directions, directionsPrev, rooms, groups, budget,
    teachers, teachersPrev,
  };
};

const SEVERITY_ORDER = { urgent: 0, watch: 1, positive: 2 };

/**
 * TO'LIQ INTELLEKT NATIJASI.
 *
 * @returns {{ period, comparison, dataQuality, sections, alerts, thresholds }}
 */
export const getIntelligence = async (filters = {}, permissions = []) => {
  const canPayroll = canSeePayroll(permissions);
  const ctx = await collectContext(filters, { canPayroll });

  const alerts = [];
  for (const rule of ALL_RULES) {
    // MAOSHGA BOG'LIQ qoida — ruxsatsiz UMUMAN ishlatilmaydi.
    if (rule.payrollSensitive && !canPayroll) continue;
    try {
      const produced = rule.fn(ctx) || [];
      for (const a of produced) alerts.push({ ...a, rule: rule.key });
    } catch {
      // Bitta qoida yiqilsa qolganlari ishlashda davom etadi:
      // ogohlantirish tizimi "hammasi yoki hech nima" bo'lmasligi kerak.
    }
  }

  const dataQuality = buildDataQuality({
    teachers: ctx.teachers, rooms: ctx.rooms, summary: ctx.summary, canPayroll,
  });

  // Har signalga umumiy sifat sabablarini QO'SHAMIZ (o'zinikini yo'qotmasdan).
  const comparison = comparisonBasis(ctx.range, ctx.prev);
  const enriched = alerts.map((a) => ({
    ...a,
    comparison,
    confidence: {
      level: a.confidenceReasons?.length || dataQuality.level === "limited" ? "limited" : "high",
      reasons: [...(a.confidenceReasons || [])],
    },
    // AUDITGA YARAROQLIK (talab Q): qaysi qoida, qaysi davr, qaysi filtr.
    source: {
      rule: a.rule,
      filters: { ...filters },
      period: { from: ctx.range.from, to: ctx.range.to },
      comparedWith: { from: ctx.prev.from, to: ctx.prev.to },
    },
  }));

  enriched.sort((a, b) => {
    const s = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (s !== 0) return s;
    return Math.abs(b.changePercent ?? 0) - Math.abs(a.changePercent ?? 0);
  });

  return {
    period: { from: ctx.range.from, to: ctx.range.to },
    comparison,
    dataQuality,
    counts: {
      urgent: enriched.filter((a) => a.severity === SEVERITY.URGENT).length,
      watch: enriched.filter((a) => a.severity === SEVERITY.WATCH).length,
      positive: enriched.filter((a) => a.severity === SEVERITY.POSITIVE).length,
    },
    sections: {
      urgent: enriched.filter((a) => a.severity === SEVERITY.URGENT),
      watch: enriched.filter((a) => a.severity === SEVERITY.WATCH),
      positive: enriched.filter((a) => a.severity === SEVERITY.POSITIVE),
    },
    alerts: enriched,
    thresholds: THRESHOLDS,
    // Xulosa raqamlari — brifing va UI sarlavhasi uchun (qayta
    // so'ramaslik uchun shu yerda beriladi).
    headline: {
      revenue: ctx.summary?.revenue ?? null,
      operatingExpenses: ctx.summary?.operatingExpenses ?? null,
      contributionProfit: ctx.summary?.contributionProfit ?? null,
      collectionRate: ctx.summary?.receivables?.collectionRate ?? null,
      cashBalance: ctx.summary?.cashBalance ?? null,
    },
  };
};

/** Bitta signal — tafsilot paneli uchun. */
export const getAlertById = async (alertId, filters = {}, permissions = []) => {
  const intel = await getIntelligence(filters, permissions);
  return intel.alerts.find((a) => a.id === alertId) || null;
};

/**
 * KUNLIK BRIFING (talab J).
 *
 * AYNI SHU intellekt obyektlaridan quriladi — moliyaviy jadvallarga
 * alohida so'rov YUBORILMAYDI. Aks holda brifingdagi raqam boshqa
 * ekrandagidan farq qilib qolardi.
 */
export const getBriefing = async (filters = {}, permissions = []) => {
  const intel = await getIntelligence(filters, permissions);
  const topUrgent = intel.sections.urgent[0] || null;
  const topPositive = intel.sections.positive[0] || null;
  const topWatch = intel.sections.watch[0] || null;

  return {
    period: intel.period,
    comparison: intel.comparison,
    dataQuality: intel.dataQuality,
    headline: intel.headline,
    // "Asosiy tashvish" va "ijobiy" — ENG YUQORI signaldan olinadi,
    // alohida mantiq bilan emas.
    mainConcern: topUrgent || topWatch || null,
    positive: topPositive,
    attention: intel.sections.urgent.slice(0, 3),
    counts: intel.counts,
  };
};

export { THRESHOLDS };
