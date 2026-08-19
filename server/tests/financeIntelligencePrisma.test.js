/**
 * MOLIYAVIY INTELLEKT — QOIDA TESTLARI (STEP 8).
 *
 * ═══════════════════════════════════════════════════════════════════
 * QOIDALAR SOF FUNKSIYA — SHUNING UCHUN CHEGARA SINOVI MUMKIN
 *
 * Har qoida tayyor tahlil natijasini oladi va tuzilmali signal
 * qaytaradi. Bazaga ham, LLM ga ham murojaat qilmaydi. Shu sababli
 * bu yerda AYNAN chegaraviy qiymatlar sinaladi: chegaraning o'zi,
 * undan bir birlik past, nol, null.
 *
 * MOLIYAVIY TO'G'RILIK LLM GA BOG'LIQ EMAS — bu testlar buni
 * isbotlaydi: birorta test LLM chaqirmaydi.
 * ═══════════════════════════════════════════════════════════════════
 *
 * ISHLATISH:  npm run test:fin-intel
 */
import "dotenv/config";
import prisma from "../src/config/prisma.js";
import * as R from "../src/modules/financeAnalytics/services/intelligenceRules.js";
import * as intel from "../src/modules/financeAnalytics/services/financialIntelligence.service.js";
import { deterministicExplanation } from "../src/modules/financeAnalytics/services/explanation.service.js";
import { PERMISSIONS } from "../src/constants/permissions.js";
import { runWithBranchContext } from "../src/helpers/branchContext.helper.js";

const T = R.THRESHOLDS;
const Res = { pass: 0, fail: 0, failures: [] };
const ok = (n, e = "") => { Res.pass += 1; console.log(`  ✅ ${n}${e ? ` — ${e}` : ""}`); };
const bad = (n, e = "") => { Res.fail += 1; Res.failures.push(`${n} — ${e}`); console.log(`  ❌ ${n} — ${e}`); };
const eq = (n, a, b) => (a === b ? ok(n, String(a)) : bad(n, `kutilgan ${b}, keldi ${a}`));
const head = (t) => console.log(`\n\x1b[1m${t}\x1b[0m`);

const cmp = (current, previous, changePercent) => ({ current, previous, change: current - previous, changePercent });

const run = async () => {
  console.log("\n=== MOLIYAVIY INTELLEKT / QOIDALAR ===\n");

  // ══════════ 1) CHIQIM O'SISHI ══════════
  head("1) Chiqim o'sishi");
  const expCtx = (changePercent) => ({
    expenses: { topGrowing: [{ categoryId: "a".repeat(24), name: "Marketing", current: 7_200_000, previous: 5_500_000, change: 1_700_000, changePercent }] },
    summary: { revenue: cmp(84_200_000, 78_000_000, 8) },
  });
  eq("chegarada ishlaydi", R.ruleExpenseGrowth(expCtx(T.expenseGrowthPercent)).length, 1);
  eq("chegaradan past — signal YO'Q", R.ruleExpenseGrowth(expCtx(T.expenseGrowthPercent - 0.1)).length, 0);
  eq("50%+ → URGENT", R.ruleExpenseGrowth(expCtx(55))[0].severity, R.SEVERITY.URGENT);
  eq("20-49% → WATCH", R.ruleExpenseGrowth(expCtx(30))[0].severity, R.SEVERITY.WATCH);
  eq("null o'zgarish — signal yo'q", R.ruleExpenseGrowth(expCtx(null)).length, 0);
  const eg = R.ruleExpenseGrowth(expCtx(30.9))[0];
  eq("dalilda daromad ham bor", eg.evidence.length, 2);
  eq("dalil mashina o'qiy oladigan", typeof eg.evidence[0].current, "number");
  eq("tavsiya turi", eg.recommendedActionType, R.ACTION.REVIEW_EXPENSE);
  eq("subyekt ID bor", eg.entityId, "a".repeat(24));
  eq("barqaror ID", eg.id, `expense_growth:${"a".repeat(24)}`);

  // ══════════ 2) UNDIRISH ══════════
  head("2) Undirish darajasi");
  const colCtx = (cur, prev) => ({
    summary: { receivables: {
      collectionRate: { current: cur, previous: prev },
      expected: cmp(10_000_000, 9_000_000, 11), collected: cmp(8_500_000, 8_200_000, 4),
      outstanding: cmp(1_500_000, 800_000, 87),
    } },
    receivables: { totals: { debtorStudents: 7 } },
  });
  eq("5 punkt tushish → signal", R.ruleCollection(colCtx(90, 95)).length, 1);
  eq("5 punkt tushish → URGENT", R.ruleCollection(colCtx(90, 95))[0].severity, R.SEVERITY.URGENT);
  eq("4.9 punkt — chegaradan past", R.ruleCollection(colCtx(90.1, 95)).length, 0);
  eq("85% dan past → WATCH", R.ruleCollection(colCtx(84, 84))[0].severity, R.SEVERITY.WATCH);
  eq("sog'lom holat — signal yo'q", R.ruleCollection(colCtx(95, 96)).length, 0);
  eq("null daraja — signal yo'q", R.ruleCollection(colCtx(null, 95)).length, 0);
  eq("oldingi davr null — faqat quyi chegara", R.ruleCollection(colCtx(80, null)).length, 1);

  // ══════════ 3) QARZ YOSHI ══════════
  head("3) Qarz yoshi");
  const agCtx = (d60) => ({ receivables: { aging: { d60plus: d60, d31_60: 400_000 }, totals: { outstanding: 3_000_000, debtorStudents: 9 } } });
  eq("chegarada", R.ruleReceivableAging(agCtx(T.overdue60plusAmount)).length, 1);
  eq("chegaradan 1 so'm past", R.ruleReceivableAging(agCtx(T.overdue60plusAmount - 1)).length, 0);
  eq("nol", R.ruleReceivableAging(agCtx(0)).length, 0);
  eq("har doim URGENT", R.ruleReceivableAging(agCtx(5_000_000))[0].severity, R.SEVERITY.URGENT);

  // ══════════ 4) BYUDJET ══════════
  head("4) Byudjetdan oshish");
  const bCtx = (vp) => ({ budget: { hasBudget: true, overBudget: [{ id: "x", label: "Marketing", categoryId: "b".repeat(24), budget: 5_000_000, actual: 7_200_000, variance: 2_200_000, variancePercent: vp }] } });
  eq("chegarada", R.ruleBudgetOverspend(bCtx(T.budgetOverPercent)).length, 1);
  eq("chegaradan past", R.ruleBudgetOverspend(bCtx(T.budgetOverPercent - 1)).length, 0);
  eq("40%+ → URGENT", R.ruleBudgetOverspend(bCtx(44))[0].severity, R.SEVERITY.URGENT);
  eq("byudjet yo'q — signal yo'q", R.ruleBudgetOverspend({ budget: { hasBudget: false } }).length, 0);
  eq("byudjet null — yiqilmaydi", R.ruleBudgetOverspend({}).length, 0);

  // ══════════ 5) CHEGIRMA ══════════
  head("5) Chegirma anomaliyasi");
  const dCtx = (dG, rG) => ({
    discounts: { total: cmp(3_000_000, 2_300_000, dG), discountRatePercent: { current: 4.2, previous: 3.1 } },
    summary: { revenue: cmp(84_200_000, 78_000_000, rG) },
  });
  eq("farq chegarada", R.ruleDiscountAnomaly(dCtx(23, 8)).length, 1);
  eq("farq chegaradan past", R.ruleDiscountAnomaly(dCtx(22.9, 8)).length, 0);
  eq("chegirma sekinroq — signal yo'q", R.ruleDiscountAnomaly(dCtx(3, 8)).length, 0);
  eq("null — signal yo'q", R.ruleDiscountAnomaly(dCtx(null, 8)).length, 0);

  // ══════════ 6) QAYTARIM ══════════
  head("6) Qaytarim anomaliyasi");
  const rCtx = (cur, prev, rate) => ({ refunds: { amount: cmp(cur, prev, prev ? Math.round(((cur - prev) / prev) * 100) : null), count: { current: 4 }, refundRatePercent: { current: rate } } });
  eq("2× o'sish → URGENT", R.ruleRefundAnomaly(rCtx(1_000_000, 500_000, 2))[0].severity, R.SEVERITY.URGENT);
  eq("1.9× — signal yo'q", R.ruleRefundAnomaly(rCtx(950_000, 500_000, 2)).length, 0);
  eq("yuqori daraja → WATCH", R.ruleRefundAnomaly(rCtx(600_000, 500_000, T.refundRatePercent))[0].severity, R.SEVERITY.WATCH);
  eq("qaytarim yo'q — signal yo'q", R.ruleRefundAnomaly(rCtx(0, 0, null)).length, 0);
  eq("oldingi davr nol — daraja bo'yicha", R.ruleRefundAnomaly(rCtx(700_000, 0, 6)).length, 1);

  // ══════════ 7) YO'NALISH ══════════
  head("7) Yo'nalish foydaliligi");
  const dirCtx = (cur, prev) => ({
    directions: { items: [{ courseId: "c".repeat(24), name: "IELTS", revenue: 50_000_000, directCosts: 20_000_000, contributionProfit: 30_000_000, contributionMarginPercent: cur, students: 90 }] },
    directionsPrev: { items: [{ courseId: "c".repeat(24), contributionMarginPercent: prev }] },
  });
  eq("10 punkt tushish → signal", R.ruleDirectionRisk(dirCtx(45, 55)).length, 1);
  eq("9 punkt — signal yo'q", R.ruleDirectionRisk(dirCtx(46, 55)).length, 0);
  eq("20% dan past → signal", R.ruleDirectionRisk(dirCtx(15, 16)).length, 1);
  eq("tushish + past → URGENT", R.ruleDirectionRisk(dirCtx(10, 25))[0].severity, R.SEVERITY.URGENT);
  eq("daromad nol — o'tkazib yuboriladi", R.ruleDirectionRisk({ directions: { items: [{ courseId: "c", revenue: 0, contributionMarginPercent: 5 }] }, directionsPrev: { items: [] } }).length, 0);
  eq("marja null — o'tkazib yuboriladi", R.ruleDirectionRisk(dirCtx(null, 55)).length, 0);

  // ══════════ 8) O'QITUVCHI ══════════
  head("8) O'qituvchi foydaliligi");
  const tCtx = (cur, prev, coverage = 100) => ({
    teachers: { items: [{ teacherId: "d".repeat(24), name: "Aziz", contributionProfit: cur, revenue: 20_000_000, directCosts: 5_000_000, students: 40 }], attribution: { coveragePercent: coverage } },
    teachersPrev: { items: [{ teacherId: "d".repeat(24), contributionProfit: prev, revenue: 22_000_000, directCosts: 5_000_000, students: 44 }] },
  });
  eq("20% tushish → signal", R.ruleTeacherRisk(tCtx(8_000_000, 10_000_000)).length, 1);
  eq("19% tushish — signal yo'q", R.ruleTeacherRisk(tCtx(8_100_000, 10_000_000)).length, 0);
  eq("40% tushish → URGENT", R.ruleTeacherRisk(tCtx(5_000_000, 10_000_000))[0].severity, R.SEVERITY.URGENT);
  eq("oldingi davr yo'q — signal yo'q", R.ruleTeacherRisk({ teachers: { items: [{ teacherId: "d", contributionProfit: 1 }] }, teachersPrev: { items: [] } }).length, 0);
  const lowCov = R.ruleTeacherRisk(tCtx(5_000_000, 10_000_000, 66))[0];
  eq("past qamrov → ishonch sababi", lowCov.confidenceReasons.length > 0, true);
  eq("to'liq qamrov → sabab yo'q", R.ruleTeacherRisk(tCtx(5_000_000, 10_000_000, 100))[0].confidenceReasons.length, 0);

  // ══════════ 9) XONA ══════════
  head("9) Xona bandligi");
  const roomCtx = (u, assumption = true) => ({
    rooms: { items: [{ roomId: "e".repeat(24), name: "104-xona", utilizationPercent: u, occupiedHours: 30, availableHours: 100, revenue: 5_000_000 }],
      availableHoursBasis: { assumption, workingHoursPerDay: 12, workingDaysPerWeek: 7 } },
  });
  eq("chegaradan past → signal", R.ruleRoomCapacity(roomCtx(T.roomUtilizationFloor - 0.1)).length, 1);
  eq("chegarada — signal yo'q", R.ruleRoomCapacity(roomCtx(T.roomUtilizationFloor)).length, 0);
  eq("null bandlik — signal yo'q", R.ruleRoomCapacity(roomCtx(null)).length, 0);
  eq("taxmin → ishonch sababi", R.ruleRoomCapacity(roomCtx(20))[0].confidenceReasons.length, 1);
  eq("taxmin emas → sabab yo'q", R.ruleRoomCapacity(roomCtx(20, false))[0].confidenceReasons.length, 0);

  // ══════════ 10) KONSENTRATSIYA ══════════
  head("10) Foyda konsentratsiyasi");
  const mkGroups = (profits) => ({ groups: { items: profits.map((p, i) => ({ groupId: `g${i}`, name: `G${i}`, contributionProfit: p })) } });
  eq("yuqori konsentratsiya → signal", R.ruleConcentration(mkGroups([50, 30, 15, 3, 2])).length, 1);
  // 5 ta TENG guruhda eng yirik 3 tasi tabiiy ravishda 60% — bu
  // konsentratsiya EMAS. Qoida tekis taqsimot bazasi bilan
  // solishtiradi (aynan shu test o'sha yolg'on signalni topgan edi).
  eq("teng taqsimot — signal yo'q", R.ruleConcentration(mkGroups([20, 20, 20, 20, 20])).length, 0);
  eq("ko'p teng guruh — signal yo'q", R.ruleConcentration(mkGroups(Array(10).fill(10))).length, 0);
  const conc2 = R.ruleConcentration(mkGroups([50, 30, 15, 3, 2]))[0];
  eq("dalilda tekis baza ko'rsatilgan",
    conc2.evidence.some((e) => e.label.includes("Tekis taqsimotda")), true);
  eq("guruh kam — signal yo'q", R.ruleConcentration(mkGroups([90, 10])).length, 0);
  eq("hammasi nol — signal yo'q", R.ruleConcentration(mkGroups([0, 0, 0, 0, 0])).length, 0);
  const conc = R.ruleConcentration(mkGroups([50, 30, 15, 3, 2]))[0];
  eq("ulush hisoblandi", conc.currentValue, 95);

  // ══════════ 11) IJOBIY ══════════
  head("11) Ijobiy signallar");
  const posCtx = (cp) => ({
    summary: { contributionProfit: cmp(cp, 10_000_000, Math.round(((cp - 10_000_000) / 10_000_000) * 100)), revenue: cmp(50_000_000, 45_000_000, 11) },
    directions: { items: [] }, directionsPrev: { items: [] },
  });
  eq("15% o'sish → ijobiy", R.rulePositive(posCtx(11_500_000)).length, 1);
  eq("14% — signal yo'q", R.rulePositive(posCtx(11_400_000)).length, 0);
  eq("ijobiy severity", R.rulePositive(posCtx(13_000_000))[0].severity, R.SEVERITY.POSITIVE);

  // ══════════ 12) DETERMINISTIK IZOH ══════════
  head("12) Deterministik izoh (LLM'siz)");
  const sig = R.ruleExpenseGrowth(expCtx(30.9))[0];
  const text = deterministicExplanation(sig);
  eq("izoh bo'sh emas", text.length > 40, true);
  eq("izohda haqiqiy raqam bor", /7\s?200\s?000/.test(text), true);
  eq("izohda o'zgarish foizi bor", /30\.9%/.test(text), true);
  ok("izoh namunasi", text.slice(0, 95));

  // ══════════ 13) RUXSAT (haqiqiy servis) ══════════
  head("13) Maosh ruxsati — qoida umuman ishlamaydi");
  const br = await prisma.branch.findFirst({ where: { name: { startsWith: "DEMO" } } });
  if (br) {
    const scope = { branchId: br.id, allowedBranchIds: [br.id], canSeeAllBranches: true, userId: null };
    const F = { branchId: br.id };
    const withPayroll = await runWithBranchContext(scope, () =>
      intel.getIntelligence(F, [PERMISSIONS.FINANCE_READ, PERMISSIONS.SALARY_READ]));
    const without = await runWithBranchContext(scope, () =>
      intel.getIntelligence(F, [PERMISSIONS.FINANCE_READ]));
    eq("ruxsatsiz o'qituvchi signali yo'q",
      without.alerts.filter((a) => a.type === "teacher_risk").length, 0);
    eq("ruxsatsiz — sabab ko'rsatiladi",
      without.dataQuality.reasons.some((r) => r.includes("Maosh")), true);
    eq("ruxsat bilan qamrov ko'rinadi",
      withPayroll.dataQuality.teacherAttributionCoverage !== null, true);
    eq("taqqoslash asosi har doim bor", Boolean(without.comparison.label), true);
    // Dalillar ichida maosh raqami sizib chiqmaganini tekshiramiz
    const leak = JSON.stringify(without.alerts).match(/teacher/i);
    eq("ruxsatsiz javobda o'qituvchi izlari yo'q", leak, null);
  } else ok("DEMO filial yo'q — ruxsat testi o'tkazib yuborildi");

  console.log(`\n=== NATIJA: ${Res.pass} o'tdi, ${Res.fail} yiqildi ===\n`);
  if (Res.failures.length) { console.log("Muammolar:"); for (const f of Res.failures) console.log("  • " + f); }
};

run()
  .catch((e) => { console.error("\nTEST YIQILDI:", e); Res.fail += 1; })
  .finally(async () => { await prisma.$disconnect(); process.exit(Res.fail ? 1 : 0); });
