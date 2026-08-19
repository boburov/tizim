import { parseRange } from "./analyticsFilter.js";
import * as summarySvc from "./summary.service.js";
import * as expenseSvc from "./expense.service.js";
import * as revenueSvc from "./revenue.service.js";
import * as discountSvc from "./discount.service.js";
import * as receivablesSvc from "./receivables.service.js";
import * as profitSvc from "./profitability.service.js";

/**
 * ══════════════════════════════════════════════════════════════════════
 * MOLIYAVIY OGOHLANTIRISHLAR — QOIDA ASOSIDA (AI EMAS)
 * ══════════════════════════════════════════════════════════════════════
 *
 * Har ogohlantirish HAQIQIY ikki raqamdan tug'iladi: joriy qiymat va
 * taqqoslash qiymati. Matn shu raqamlardan YIG'ILADI — hech narsa
 * "generatsiya" qilinmaydi.
 *
 * NEGA BU MUHIM: o'ylab topilgan izoh bir marta noto'g'ri chiqsa,
 * foydalanuvchi BUTUN bo'limga ishonishni to'xtatadi. Shuning uchun
 * har ogohtarishda `metric`, `currentValue` va `comparisonValue`
 * ochiq beriladi — foydalanuvchi xulosani O'ZI tekshira oladi.
 *
 * CHEGARALAR (threshold) shu yerda, bitta joyda. Ular biznes qarori,
 * shuning uchun ochiq nomlangan va o'zgartirish oson.
 */

export const THRESHOLDS = Object.freeze({
  expenseGrowthPercent: 20,       // chiqim shundan ko'p o'ssa
  profitDropPercent: -10,         // hissa foydasi shuncha tushsa
  collectionRateDropPoints: 5,    // undirish darajasi shuncha PUNKT tushsa
  collectionRateFloor: 85,        // mutlaq quyi chegara
  overdue60plusAmount: 1_000_000, // 60+ kunlik qarz shundan oshsa
  discountVsRevenueGapPoints: 15, // chegirma o'sishi daromaddan shuncha oshsa
  refundMultiplier: 2,            // qaytarim oldingi davrdan shuncha barobar
  roomUtilizationFloor: 40,       // bandlik shundan past bo'lsa
  budgetOverPercent: 10,          // byudjetdan shuncha % oshsa
  marginFloorPercent: 20,         // yo'nalish marjasi shundan past bo'lsa
});

const SEVERITY = { HIGH: "high", MEDIUM: "medium", LOW: "low", GOOD: "good" };

const money = (v) => new Intl.NumberFormat("uz-UZ").format(Math.round(v || 0));
const pct = (v) => (v === null || v === undefined ? "—" : `${v > 0 ? "+" : ""}${v}%`);

const alert = ({
  code, severity, title, explanation, metric,
  currentValue, comparisonValue, action, entities = {},
}) => ({
  code, severity, title, explanation, metric,
  currentValue, comparisonValue, recommendedAction: action, entities,
});

/**
 * OGOHLANTIRISHLARNI HISOBLAYDI.
 *
 * Barcha manba hisobotlar PARALLEL o'qiladi — ketma-ket bo'lsa
 * sahifa ochilishi sekinlashardi.
 */
export const getFinancialAlerts = async (filters = {}) => {
  const range = parseRange(filters);
  const out = [];

  const [summary, expenses, discounts, refunds, recv, rooms, directions, budget] =
    await Promise.all([
      summarySvc.getSummary(filters),
      expenseSvc.getExpenseBreakdown(filters),
      discountSvc.getDiscountAnalytics(filters),
      revenueSvc.getRefundAnalytics(filters),
      receivablesSvc.getReceivables(filters),
      profitSvc.getRoomRevenue(filters),
      profitSvc.getDirectionProfitability(filters),
      expenseSvc.getBudgetPerformance(filters),
    ]);

  // ── 1) CHIQIM O'SISHI (kategoriya darajasida — sabab ko'rinsin) ──
  for (const cat of expenses.topGrowing) {
    if (cat.changePercent === null || cat.changePercent < THRESHOLDS.expenseGrowthPercent) continue;
    out.push(alert({
      code: "expense_growth",
      severity: cat.changePercent >= 50 ? SEVERITY.HIGH : SEVERITY.MEDIUM,
      title: `"${cat.name}" chiqimi ${pct(cat.changePercent)} oshdi`,
      explanation: `Joriy davr ${money(cat.current)} so'm, oldingi davr ${money(cat.previous)} so'm `
        + `(farq ${money(cat.change)} so'm).`,
      metric: "expense_by_category",
      currentValue: cat.current,
      comparisonValue: cat.previous,
      action: "review_expense_category",
      entities: { expenseCategoryId: cat.categoryId },
    }));
  }

  // ── 2) UNDIRISH DARAJASINING PASAYISHI ──
  const crNow = summary.receivables.collectionRate.current;
  const crPrev = summary.receivables.collectionRate.previous;
  if (crNow !== null && crPrev !== null && crPrev - crNow >= THRESHOLDS.collectionRateDropPoints) {
    out.push(alert({
      code: "collection_drop",
      severity: SEVERITY.HIGH,
      title: `Undirish darajasi ${crPrev}% dan ${crNow}% ga tushdi`,
      explanation: `Kutilgan ${money(summary.receivables.expected.current)} so'mdan `
        + `${money(summary.receivables.collected.current)} so'm undirildi.`,
      metric: "collection_rate",
      currentValue: crNow, comparisonValue: crPrev,
      action: "contact_debtors",
    }));
  } else if (crNow !== null && crNow < THRESHOLDS.collectionRateFloor) {
    out.push(alert({
      code: "collection_low",
      severity: SEVERITY.MEDIUM,
      title: `Undirish darajasi past: ${crNow}%`,
      explanation: `Qoldiq ${money(summary.receivables.outstanding.current)} so'm.`,
      metric: "collection_rate",
      currentValue: crNow, comparisonValue: THRESHOLDS.collectionRateFloor,
      action: "contact_debtors",
    }));
  }

  // ── 3) ESKI QARZ (60+ kun) ──
  if (recv.aging.d60plus >= THRESHOLDS.overdue60plusAmount) {
    out.push(alert({
      code: "aged_receivables",
      severity: SEVERITY.HIGH,
      title: `${money(recv.aging.d60plus)} so'm 60 kundan ortiq muddati o'tgan`,
      explanation: `Jami qarz ${money(recv.totals.outstanding)} so'm, shundan `
        + `${money(recv.aging.d60plus)} so'mi 60+ kunlik. Qarzdor o'quvchilar: ${recv.totals.debtorStudents}.`,
      metric: "receivables_aging_60plus",
      currentValue: recv.aging.d60plus,
      comparisonValue: THRESHOLDS.overdue60plusAmount,
      action: "escalate_collection",
    }));
  }

  // ── 4) HISSA FOYDASINING PASAYISHI ──
  const cp = summary.contributionProfit;
  if (cp.changePercent !== null && cp.changePercent <= THRESHOLDS.profitDropPercent) {
    out.push(alert({
      code: "profit_drop",
      severity: SEVERITY.HIGH,
      title: `Hissa foydasi ${pct(cp.changePercent)} kamaydi`,
      explanation: `${money(cp.previous)} so'mdan ${money(cp.current)} so'mga tushdi. `
        + `Daromad ${pct(summary.revenue.changePercent)}, to'g'ridan-to'g'ri xarajat `
        + `${pct(summary.directCosts.changePercent)} o'zgardi.`,
      metric: "contribution_profit",
      currentValue: cp.current, comparisonValue: cp.previous,
      action: "review_costs",
    }));
  }

  // ── 5) CHEGIRMA ANOMALIYASI ──
  const dGrowth = discounts.total.changePercent;
  const rGrowth = summary.revenue.changePercent;
  if (dGrowth !== null && rGrowth !== null && dGrowth - rGrowth >= THRESHOLDS.discountVsRevenueGapPoints) {
    out.push(alert({
      code: "discount_anomaly",
      severity: SEVERITY.MEDIUM,
      title: `Chegirmalar ${pct(dGrowth)}, daromad esa ${pct(rGrowth)} o'zgardi`,
      explanation: `Chegirma ${money(discounts.total.current)} so'mga yetdi. `
        + `Chegirma daromaddan tezroq o'sayapti.`,
      metric: "discount_vs_revenue_growth",
      currentValue: dGrowth, comparisonValue: rGrowth,
      action: "review_discount_policy",
    }));
  }

  // ── 6) QAYTARIM ANOMALIYASI ──
  const rf = refunds.amount;
  if (rf.previous > 0 && rf.current >= rf.previous * THRESHOLDS.refundMultiplier) {
    const times = Math.round((rf.current / rf.previous) * 10) / 10;
    out.push(alert({
      code: "refund_spike",
      severity: SEVERITY.HIGH,
      title: `Qaytarimlar ${times}× oshdi`,
      explanation: `${money(rf.previous)} so'mdan ${money(rf.current)} so'mga. `
        + `Qaytarim darajasi ${refunds.refundRatePercent.current ?? "—"}%.`,
      metric: "refund_amount",
      currentValue: rf.current, comparisonValue: rf.previous,
      action: "investigate_refunds",
    }));
  }

  // ── 7) BO'SH TURGAN XONA ──
  for (const room of rooms.rankings.lowestUtilization || []) {
    if (room.utilizationPercent === null || room.utilizationPercent >= THRESHOLDS.roomUtilizationFloor) continue;
    out.push(alert({
      code: "room_underutilized",
      severity: SEVERITY.LOW,
      title: `"${room.name}" xonasi ${room.utilizationPercent}% band`,
      explanation: `${room.occupiedHours} soat band, ${room.availableHours} soat mavjud `
        + `(mavjud soat taxminiy — qarang availableHoursBasis).`,
      metric: "room_utilization",
      currentValue: room.utilizationPercent,
      comparisonValue: THRESHOLDS.roomUtilizationFloor,
      action: "schedule_more_groups",
      entities: { roomId: room.roomId },
    }));
  }

  // ── 8) YO'NALISH MARJASI ──
  for (const d of directions.items) {
    if (d.contributionMarginPercent === null || d.revenue <= 0) continue;
    if (d.contributionMarginPercent >= THRESHOLDS.marginFloorPercent) continue;
    out.push(alert({
      code: "direction_low_margin",
      severity: SEVERITY.MEDIUM,
      title: `"${d.name}" hissa marjasi ${d.contributionMarginPercent}%`,
      explanation: `Daromad ${money(d.revenue)} so'm, to'g'ridan-to'g'ri xarajat `
        + `${money(d.directCosts)} so'm, hissa foydasi ${money(d.contributionProfit)} so'm.`,
      metric: "contribution_margin",
      currentValue: d.contributionMarginPercent,
      comparisonValue: THRESHOLDS.marginFloorPercent,
      action: "review_pricing_or_cost",
      entities: { courseId: d.courseId },
    }));
  }

  // ── 9) BYUDJETDAN OSHISH ──
  if (budget.hasBudget) {
    for (const line of budget.overBudget) {
      if (line.variancePercent === null || line.variancePercent < THRESHOLDS.budgetOverPercent) continue;
      out.push(alert({
        code: "budget_overspend",
        severity: line.variancePercent >= 40 ? SEVERITY.HIGH : SEVERITY.MEDIUM,
        title: `"${line.label}" byudjetdan ${pct(line.variancePercent)} oshdi`,
        explanation: `Byudjet ${money(line.budget)} so'm, fakt ${money(line.actual)} so'm `
          + `(farq ${money(line.variance)} so'm).`,
        metric: "budget_variance",
        currentValue: line.actual, comparisonValue: line.budget,
        action: "review_budget",
        entities: { expenseCategoryId: line.categoryId, budgetId: budget.budgetId },
      }));
    }
  }

  // ── IJOBIY SIGNAL ──
  if (cp.changePercent !== null && cp.changePercent >= 15) {
    out.push(alert({
      code: "profit_growth",
      severity: SEVERITY.GOOD,
      title: `Hissa foydasi ${pct(cp.changePercent)} o'sdi`,
      explanation: `${money(cp.previous)} so'mdan ${money(cp.current)} so'mga.`,
      metric: "contribution_profit",
      currentValue: cp.current, comparisonValue: cp.previous,
      action: "none",
    }));
  }

  const order = { high: 0, medium: 1, low: 2, good: 3 };
  out.sort((a, b) => order[a.severity] - order[b.severity]);

  return {
    period: { from: range.from, to: range.to },
    thresholds: THRESHOLDS,
    counts: {
      high: out.filter((a) => a.severity === "high").length,
      medium: out.filter((a) => a.severity === "medium").length,
      low: out.filter((a) => a.severity === "low").length,
      good: out.filter((a) => a.severity === "good").length,
    },
    alerts: out,
  };
};
