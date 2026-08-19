-- ═══════════════════════════════════════════════════════════════════════════
-- MOLIYA YADROSI: o'lchovlar, takrorlanuvchi chiqim, byudjet, qaytarim, audit
--
-- QAMROV
--   • 5 mavjud enum kengaytirildi (AccountKind, EntryKind, PaymentMethod,
--     ExpenseMethod, FilePurpose) — faqat QO'SHISH, mavjud qiymatlarga
--     tegilmadi.
--   • 9 yangi enum (CostType, RecurringInterval, DiscountKind, RefundStatus,
--     BudgetPeriodType/Status/LineScope, RecurringOccurrenceStatus,
--     FinancialAuditAction).
--   • journal_entries ga 13 NULLABLE o'lchov ustuni — Faza 16-19 shu
--     ustunlar ustida oddiy GROUP BY ga aylanadi.
--   • 6 yangi jadval: recurring_expenses, recurring_expense_occurrences,
--     budgets, budget_lines, refunds, financial_audit_logs.
--
-- XAVFSIZLIK
--   Hech qanday DROP / RENAME / NOT NULL qo'shilmagan. Barcha yangi
--   ustunlar NULLABLE yoki DEFAULT bilan — mavjud qatorlar o'zgarmaydi
--   va eski so'rovlar aynan eski natijani beradi.
--
--   PaymentTransaction.feeAmount DEFAULT 0 → mavjud to'lovlarda komissiya
--   yo'q deb hisoblanadi, ya'ni netto = brutto (eski xulq-atvor).
--
-- POSTGRES ESLATMASI
--   `ALTER TYPE ... ADD VALUE` va o'sha qiymatni BIR tranzaksiyada
--   ISHLATISH mumkin emas. Bu yerda muammo yo'q: yangi qiymatlar
--   DEFAULT sifatida faqat SHU migratsiyada CREATE TYPE bilan
--   yaratilgan enumlarda ishlatilgan. Kengaytirilgan eski enumlarning
--   yangi qiymatlari bu migratsiyada ISHLATILMAYDI.
--   (PostgreSQL 16 — ADD VALUE tranzaksiya ichida ruxsat etilgan.)
-- ═══════════════════════════════════════════════════════════════════════════

-- CreateEnum
CREATE TYPE "CostType" AS ENUM ('fixed', 'variable');

-- CreateEnum
CREATE TYPE "RecurringInterval" AS ENUM ('daily', 'weekly', 'monthly', 'quarterly', 'yearly');

-- CreateEnum
CREATE TYPE "RecurringOccurrenceStatus" AS ENUM ('pending', 'paid', 'skipped', 'canceled');

-- CreateEnum
CREATE TYPE "DiscountKind" AS ENUM ('family', 'promotion', 'referral', 'scholarship', 'employee', 'manager', 'manual', 'other');

-- CreateEnum
CREATE TYPE "RefundStatus" AS ENUM ('pending', 'approved', 'executed', 'rejected', 'canceled');

-- CreateEnum
CREATE TYPE "BudgetPeriodType" AS ENUM ('month', 'quarter', 'year');

-- CreateEnum
CREATE TYPE "BudgetStatus" AS ENUM ('draft', 'active', 'closed');

-- CreateEnum
CREATE TYPE "BudgetLineScope" AS ENUM ('total', 'category', 'kind');

-- CreateEnum
CREATE TYPE "FinancialAuditAction" AS ENUM ('create', 'update', 'delete', 'restore', 'approve', 'reject', 'execute', 'cancel');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "AccountKind" ADD VALUE 'uzcard';
ALTER TYPE "AccountKind" ADD VALUE 'humo';
ALTER TYPE "AccountKind" ADD VALUE 'other';
ALTER TYPE "AccountKind" ADD VALUE 'owner_capital';
ALTER TYPE "AccountKind" ADD VALUE 'payment_fee';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "EntryKind" ADD VALUE 'refund';
ALTER TYPE "EntryKind" ADD VALUE 'owner_investment';
ALTER TYPE "EntryKind" ADD VALUE 'owner_withdrawal';
ALTER TYPE "EntryKind" ADD VALUE 'payment_fee';
ALTER TYPE "EntryKind" ADD VALUE 'account_transfer';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ExpenseMethod" ADD VALUE 'click';
ALTER TYPE "ExpenseMethod" ADD VALUE 'payme';
ALTER TYPE "ExpenseMethod" ADD VALUE 'uzcard';
ALTER TYPE "ExpenseMethod" ADD VALUE 'humo';
ALTER TYPE "ExpenseMethod" ADD VALUE 'terminal';

-- AlterEnum
ALTER TYPE "FilePurpose" ADD VALUE 'receipt';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentMethod" ADD VALUE 'click';
ALTER TYPE "PaymentMethod" ADD VALUE 'payme';
ALTER TYPE "PaymentMethod" ADD VALUE 'uzcard';
ALTER TYPE "PaymentMethod" ADD VALUE 'humo';
ALTER TYPE "PaymentMethod" ADD VALUE 'bank';
ALTER TYPE "PaymentMethod" ADD VALUE 'transfer';

-- AlterTable
ALTER TABLE "accounts" ADD COLUMN     "openingAt" TIMESTAMP(3),
ADD COLUMN     "openingBalance" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "discounts" ADD COLUMN     "approvedAt" TIMESTAMP(3),
ADD COLUMN     "approvedById" VARCHAR(24),
ADD COLUMN     "kind" "DiscountKind" NOT NULL DEFAULT 'other';

-- AlterTable
ALTER TABLE "expense_categories" ADD COLUMN     "costType" "CostType" NOT NULL DEFAULT 'variable';

-- AlterTable
ALTER TABLE "expenses" ADD COLUMN     "costType" "CostType",
ADD COLUMN     "personId" VARCHAR(24),
ADD COLUMN     "recurringExpenseId" VARCHAR(24);

-- AlterTable
ALTER TABLE "journal_entries" ADD COLUMN     "attachmentId" VARCHAR(24),
ADD COLUMN     "costType" "CostType",
ADD COLUMN     "courseId" VARCHAR(24),
ADD COLUMN     "expenseCategoryId" VARCHAR(24),
ADD COLUMN     "groupId" VARCHAR(24),
ADD COLUMN     "membershipId" VARCHAR(24),
ADD COLUMN     "paymentMethod" "PaymentMethod",
ADD COLUMN     "periodMonth" INTEGER,
ADD COLUMN     "periodYear" INTEGER,
ADD COLUMN     "roomId" VARCHAR(24),
ADD COLUMN     "staffId" VARCHAR(24),
ADD COLUMN     "studentId" VARCHAR(24),
ADD COLUMN     "teacherId" VARCHAR(24);

-- AlterTable
ALTER TABLE "payment_transactions" ADD COLUMN     "feeAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
ADD COLUMN     "provider" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "recurring_expenses" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "branchId" VARCHAR(24),
    "categoryId" VARCHAR(24) NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "expectedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "currency" "ExpenseCurrency" NOT NULL DEFAULT 'UZS',
    "method" "ExpenseMethod" NOT NULL DEFAULT 'cash',
    "vendor" TEXT NOT NULL DEFAULT '',
    "personId" VARCHAR(24),
    "costType" "CostType" NOT NULL DEFAULT 'fixed',
    "interval" "RecurringInterval" NOT NULL DEFAULT 'monthly',
    "intervalCount" INTEGER NOT NULL DEFAULT 1,
    "dayOfMonth" INTEGER,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "nextDueAt" TIMESTAMP(3),
    "lastGeneratedAt" TIMESTAMP(3),
    "autoGenerate" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT NOT NULL DEFAULT '',
    "createdById" VARCHAR(24),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" VARCHAR(24),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_expense_occurrences" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "recurringExpenseId" VARCHAR(24) NOT NULL,
    "branchId" VARCHAR(24),
    "dueDate" TIMESTAMP(3) NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "expectedAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "status" "RecurringOccurrenceStatus" NOT NULL DEFAULT 'pending',
    "expenseId" VARCHAR(24),
    "paidAt" TIMESTAMP(3),
    "paidAmount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL DEFAULT '',
    "createdById" VARCHAR(24),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_expense_occurrences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budgets" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "name" TEXT NOT NULL DEFAULT '',
    "branchId" VARCHAR(24),
    "periodType" "BudgetPeriodType" NOT NULL DEFAULT 'month',
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL DEFAULT 0,
    "quarter" INTEGER NOT NULL DEFAULT 0,
    "status" "BudgetStatus" NOT NULL DEFAULT 'draft',
    "note" TEXT NOT NULL DEFAULT '',
    "createdById" VARCHAR(24),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" VARCHAR(24),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_lines" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "budgetId" VARCHAR(24) NOT NULL,
    "scope" "BudgetLineScope" NOT NULL DEFAULT 'category',
    "categoryId" VARCHAR(24),
    "categoryKind" "ExpenseCategoryKind",
    "amount" DECIMAL(18,2) NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "budget_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refunds" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "branchId" VARCHAR(24) NOT NULL,
    "studentId" VARCHAR(24) NOT NULL,
    "groupId" VARCHAR(24),
    "membershipId" VARCHAR(24),
    "originalTransactionId" VARCHAR(24),
    "paymentId" VARCHAR(24),
    "amount" DECIMAL(18,2) NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'cash',
    "reason" TEXT NOT NULL DEFAULT '',
    "status" "RefundStatus" NOT NULL DEFAULT 'pending',
    "requestedById" VARCHAR(24) NOT NULL,
    "approvedById" VARCHAR(24),
    "approvedAt" TIMESTAMP(3),
    "executedAt" TIMESTAMP(3),
    "decisionNote" TEXT NOT NULL DEFAULT '',
    "approvalId" VARCHAR(24),
    "journalEntryId" VARCHAR(24),
    "receiptId" VARCHAR(24),
    "note" TEXT NOT NULL DEFAULT '',
    "createdById" VARCHAR(24),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" VARCHAR(24),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "financial_audit_logs" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "entityType" TEXT NOT NULL,
    "entityId" VARCHAR(24) NOT NULL,
    "action" "FinancialAuditAction" NOT NULL,
    "branchId" VARCHAR(24),
    "actorId" VARCHAR(24),
    "actorLabel" TEXT NOT NULL DEFAULT '',
    "oldValue" JSONB,
    "newValue" JSONB,
    "changedFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "reason" TEXT NOT NULL DEFAULT '',
    "amountBefore" DECIMAL(18,2),
    "amountAfter" DECIMAL(18,2),
    "ip" TEXT NOT NULL DEFAULT '',
    "userAgent" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "recurring_expenses_branchId_isActive_idx" ON "recurring_expenses"("branchId", "isActive");

-- CreateIndex
CREATE INDEX "recurring_expenses_nextDueAt_isActive_idx" ON "recurring_expenses"("nextDueAt", "isActive");

-- CreateIndex
CREATE INDEX "recurring_expenses_categoryId_idx" ON "recurring_expenses"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "recurring_expense_occurrences_expenseId_key" ON "recurring_expense_occurrences"("expenseId");

-- CreateIndex
CREATE INDEX "recurring_expense_occurrences_status_dueDate_idx" ON "recurring_expense_occurrences"("status", "dueDate");

-- CreateIndex
CREATE INDEX "recurring_expense_occurrences_branchId_periodYear_periodMon_idx" ON "recurring_expense_occurrences"("branchId", "periodYear", "periodMonth");

-- CreateIndex
CREATE UNIQUE INDEX "recurring_expense_occurrences_recurringExpenseId_dueDate_key" ON "recurring_expense_occurrences"("recurringExpenseId", "dueDate");

-- CreateIndex
CREATE INDEX "budgets_year_month_idx" ON "budgets"("year", "month");

-- CreateIndex
CREATE INDEX "budgets_branchId_status_idx" ON "budgets"("branchId", "status");

-- CreateIndex
CREATE INDEX "budget_lines_budgetId_idx" ON "budget_lines"("budgetId");

-- CreateIndex
CREATE INDEX "budget_lines_categoryId_idx" ON "budget_lines"("categoryId");

-- CreateIndex
CREATE INDEX "refunds_branchId_createdAt_idx" ON "refunds"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX "refunds_studentId_createdAt_idx" ON "refunds"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "refunds_status_createdAt_idx" ON "refunds"("status", "createdAt");

-- CreateIndex
CREATE INDEX "refunds_originalTransactionId_idx" ON "refunds"("originalTransactionId");

-- CreateIndex
CREATE INDEX "financial_audit_logs_entityType_entityId_createdAt_idx" ON "financial_audit_logs"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "financial_audit_logs_actorId_createdAt_idx" ON "financial_audit_logs"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "financial_audit_logs_branchId_createdAt_idx" ON "financial_audit_logs"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX "financial_audit_logs_action_createdAt_idx" ON "financial_audit_logs"("action", "createdAt");

-- CreateIndex
CREATE INDEX "journal_entries_teacherId_date_idx" ON "journal_entries"("teacherId", "date");

-- CreateIndex
CREATE INDEX "journal_entries_studentId_date_idx" ON "journal_entries"("studentId", "date");

-- CreateIndex
CREATE INDEX "journal_entries_staffId_date_idx" ON "journal_entries"("staffId", "date");

-- CreateIndex
CREATE INDEX "journal_entries_groupId_date_idx" ON "journal_entries"("groupId", "date");

-- CreateIndex
CREATE INDEX "journal_entries_courseId_date_idx" ON "journal_entries"("courseId", "date");

-- CreateIndex
CREATE INDEX "journal_entries_roomId_date_idx" ON "journal_entries"("roomId", "date");

-- CreateIndex
CREATE INDEX "journal_entries_expenseCategoryId_date_idx" ON "journal_entries"("expenseCategoryId", "date");

-- CreateIndex
CREATE INDEX "journal_entries_periodYear_periodMonth_idx" ON "journal_entries"("periodYear", "periodMonth");

-- AddForeignKey
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_personId_fkey" FOREIGN KEY ("personId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_recurringExpenseId_fkey" FOREIGN KEY ("recurringExpenseId") REFERENCES "recurring_expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "group_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_expenseCategoryId_fkey" FOREIGN KEY ("expenseCategoryId") REFERENCES "expense_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_attachmentId_fkey" FOREIGN KEY ("attachmentId") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_personId_fkey" FOREIGN KEY ("personId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_expense_occurrences" ADD CONSTRAINT "recurring_expense_occurrences_recurringExpenseId_fkey" FOREIGN KEY ("recurringExpenseId") REFERENCES "recurring_expenses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_expense_occurrences" ADD CONSTRAINT "recurring_expense_occurrences_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_expense_occurrences" ADD CONSTRAINT "recurring_expense_occurrences_expenseId_fkey" FOREIGN KEY ("expenseId") REFERENCES "expenses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_expense_occurrences" ADD CONSTRAINT "recurring_expense_occurrences_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "expense_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "group_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_originalTransactionId_fkey" FOREIGN KEY ("originalTransactionId") REFERENCES "payment_transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "student_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "expense_approvals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refunds" ADD CONSTRAINT "refunds_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_audit_logs" ADD CONSTRAINT "financial_audit_logs_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "financial_audit_logs" ADD CONSTRAINT "financial_audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

