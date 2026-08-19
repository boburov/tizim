-- ═══════════════════════════════════════════════════════════════════════════
-- PUL USTUNLARI: double precision → numeric
--
-- NEGA: `double` pulda jimgina yolg'on beradi — 0.1 + 0.2 <> 0.3, va
-- SUM() natijasi qatorlar tartibiga qarab farq qilishi mumkin. Hisobot
-- ikki marta ochilganda ikki xil raqam bergan moliya tizimiga ishonib
-- bo'lmaydi. `numeric` esa aniq (exact) arifmetika beradi.
--
-- QAMROV: 71 ustun / 30 jadval.
--   • numeric(18,2) — pul summalari (so'm + tiyin uchun joy)
--   • numeric(18,4) — STAVKALAR: valyuta kursi va foizlar. Alohida
--     aniqlik kerak, chunki 33.3333% ni 2 kasrga keltirish maoshni
--     siljitardi.
--
-- TEGILMAGAN ustunlar (bular pul EMAS): areaM2, prorationFactor,
-- studentUnits, lessonHours, quantity, size/usedBytes (baytlar),
-- gradeWeight/attendanceWeight/confidenceFloor/score/confidence,
-- hamda AiUsageLog.costUsd (USD, sent ostidagi qiymatlar — 2 kasrga
-- keltirilsa NOLGA aylanardi).
--
-- MA'LUMOT XAVFSIZLIGI: bu faqat TIP o'zgarishi (ALTER ... SET DATA TYPE).
-- Hech qanday ustun o'chirilmaydi va qayta nomlanmaydi. Mavjud qiymatlar
-- double → numeric ga kastlanadi; ular allaqachon butun so'mlar
-- (kod hamma joyda Math.round() qiladi), ya'ni yaxlitlash yo'qotishi yo'q.
--
-- JS TOMONI: `src/config/prisma.js` dagi klient kengaytmasi Decimal'ni
-- songa keltiradi — mavjud arifmetika o'zgarishsiz ishlaydi.
-- ═══════════════════════════════════════════════════════════════════════════

-- AlterTable
ALTER TABLE "ai_reports" ALTER COLUMN "insightImpactAtRisk" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "branches" ALTER COLUMN "expenseApprovalThreshold" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "cash_transfers" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "countedOnArrival" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "discrepancy" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "course_prices" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "debt_write_off_breakdown" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "debt_write_offs" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "deposit_transactions" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "balanceAfter" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "discounts" ALTER COLUMN "value" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "expense_approvals" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "thresholdAtRequest" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "expenses" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "originalAmount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "exchangeRate" SET DATA TYPE DECIMAL(18,4);

-- AlterTable
ALTER TABLE "group_fees" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "insights" ALTER COLUMN "expectedImpactAmount" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "journal_entries" ALTER COLUMN "totalDebit" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "totalCredit" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "journal_lines" ALTER COLUMN "debit" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "credit" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "kpi_rules" ALTER COLUMN "rewardValue" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "monthlyCap" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "opening_balances" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "payment_transactions" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "salary_transactions" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "shifts" ALTER COLUMN "openingCash" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "expectedCash" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "countedCash" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "variance" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "staff_compensations" ALTER COLUMN "baseAmount" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "staff_kpi_assignments" ALTER COLUMN "rewardValueOverride" SET DATA TYPE DECIMAL(18,4);

-- AlterTable
ALTER TABLE "staff_payroll_adjustments" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "staff_payroll_items" ALTER COLUMN "unitAmount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "staff_payrolls" ALTER COLUMN "baseAmount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "fixedAmount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "autoKpiTotal" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "manualBonusTotal" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "penaltyTotal" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "openingCreditTotal" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "openingDebtTotal" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "openingDebtApplied" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "finalAmount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "paidAmount" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "staff_salary_transactions" ALTER COLUMN "amount" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "student_deposits" ALTER COLUMN "balance" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "student_payments" ALTER COLUMN "baseFee" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "discountApplied" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "expectedAmount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "paidAmount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "writeOffAmount" SET DATA TYPE DECIMAL(18,2);

-- AlterTable
ALTER TABLE "teacher_compensations" ALTER COLUMN "baseAmount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "variableRate" SET DATA TYPE DECIMAL(18,4);

-- AlterTable
ALTER TABLE "teacher_group_periods" ALTER COLUMN "variableRate" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "fixedAmount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "percentRate" SET DATA TYPE DECIMAL(18,4);

-- AlterTable
ALTER TABLE "teacher_salaries" ALTER COLUMN "fixedAmount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "percentRate" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "variableRate" SET DATA TYPE DECIMAL(18,4),
ALTER COLUMN "groupRevenue" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "proratedFixed" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "percentAmount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "perStudentAmount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "perHourAmount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "perGroupAmount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "baseEarnings" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "expectedAmount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "paidAmount" SET DATA TYPE DECIMAL(18,2),
ALTER COLUMN "overpaidAmount" SET DATA TYPE DECIMAL(18,2);

