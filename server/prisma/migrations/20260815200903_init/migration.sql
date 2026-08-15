-- CreateEnum
CREATE TYPE "AccountKind" AS ENUM ('cash', 'terminal', 'click', 'payme', 'bank', 'transit', 'due_from', 'due_to', 'deposit', 'equity', 'revenue', 'expense', 'shortage');

-- CreateEnum
CREATE TYPE "EntryKind" AS ENUM ('payment', 'deposit_in', 'deposit_out', 'deposit_apply', 'expense', 'salary', 'opening', 'shift_close', 'transfer_send', 'transfer_receive', 'inter_branch', 'adjustment');

-- CreateEnum
CREATE TYPE "HttpMethod" AS ENUM ('GET', 'POST', 'PATCH', 'PUT', 'DELETE');

-- CreateEnum
CREATE TYPE "RankingType" AS ENUM ('payment_delay', 'absence', 'teacher');

-- CreateEnum
CREATE TYPE "RankingSeverity" AS ENUM ('high', 'medium', 'low');

-- CreateEnum
CREATE TYPE "AiReportPeriod" AS ENUM ('daily', 'weekly', 'monthly');

-- CreateEnum
CREATE TYPE "AiRunTrigger" AS ENUM ('nightly', 'intraday', 'manual');

-- CreateEnum
CREATE TYPE "AiRunScope" AS ENUM ('fast', 'full');

-- CreateEnum
CREATE TYPE "AiRunStatus" AS ENUM ('running', 'ok', 'failed');

-- CreateEnum
CREATE TYPE "AiUsageKind" AS ENUM ('narration', 'digest', 'report', 'assistant');

-- CreateEnum
CREATE TYPE "AiUsageProvider" AS ENUM ('gemini', 'openai');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('pending', 'approved', 'executed', 'rejected', 'canceled', 'failed');

-- CreateEnum
CREATE TYPE "ApprovalCategory" AS ENUM ('financial', 'configuration');

-- CreateEnum
CREATE TYPE "ApprovalKind" AS ENUM ('salary_payment', 'deposit_withdraw', 'salary_terms', 'discount_set', 'group_fee_set', 'staff_hire', 'teacher_compensation_set', 'membership_backdate', 'expense_create', 'staff_salary_payment');

-- CreateEnum
CREATE TYPE "ArchiveAction" AS ENUM ('archive', 'restore');

-- CreateEnum
CREATE TYPE "DeliveryStatus" AS ENUM ('pending', 'delivered', 'blocked', 'no_bot', 'failed');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('present', 'absent', 'excused', 'exempt');

-- CreateEnum
CREATE TYPE "AttendanceSource" AS ENUM ('teacher', 'admin', 'auto-exempt');

-- CreateEnum
CREATE TYPE "WeekDay" AS ENUM ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun');

-- CreateEnum
CREATE TYPE "DelegationMode" AS ENUM ('auto', 'threshold', 'approval', 'forbidden');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('in_transit', 'received', 'disputed', 'canceled');

-- CreateEnum
CREATE TYPE "DepositTxType" AS ENUM ('topup', 'withdraw', 'refund');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('cash', 'card');

-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('fixed', 'percent');

-- CreateEnum
CREATE TYPE "DiscountScope" AS ENUM ('permanent', 'monthly');

-- CreateEnum
CREATE TYPE "ExpenseAllocation" AS ENUM ('none', 'revenue', 'students', 'equal');

-- CreateEnum
CREATE TYPE "ExpenseMethod" AS ENUM ('cash', 'card', 'bank', 'transfer');

-- CreateEnum
CREATE TYPE "ExpenseCurrency" AS ENUM ('UZS', 'USD');

-- CreateEnum
CREATE TYPE "ExpenseCategoryKind" AS ENUM ('operating', 'payroll', 'tax', 'capital');

-- CreateEnum
CREATE TYPE "FeedbackStatus" AS ENUM ('new', 'in_review', 'resolved', 'rejected');

-- CreateEnum
CREATE TYPE "GradeSource" AS ENUM ('teacher', 'admin');

-- CreateEnum
CREATE TYPE "EntryBilling" AS ENUM ('prorated', 'full');

-- CreateEnum
CREATE TYPE "FeeSource" AS ENUM ('auto', 'manual');

-- CreateEnum
CREATE TYPE "LeftReason" AS ENUM ('transferred', 'removed', 'graduated');

-- CreateEnum
CREATE TYPE "HolidayAudience" AS ENUM ('all', 'students', 'teachers');

-- CreateEnum
CREATE TYPE "ImportMode" AS ENUM ('file', 'rows');

-- CreateEnum
CREATE TYPE "ImportStatus" AS ENUM ('queued', 'running', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "InsightSubjectType" AS ENUM ('student', 'teacher', 'group', 'lead', 'course', 'branch');

-- CreateEnum
CREATE TYPE "InsightDomain" AS ENUM ('students', 'attendance', 'finance', 'teachers', 'leads', 'groups', 'courses');

-- CreateEnum
CREATE TYPE "InsightStance" AS ENUM ('risk', 'watch', 'opportunity');

-- CreateEnum
CREATE TYPE "InsightKind" AS ENUM ('student_churn_risk', 'student_improving', 'attendance_anomaly', 'payment_risk', 'overdue_payments', 'revenue_forecast_drop', 'expense_anomaly', 'cashflow_warning', 'teacher_attendance_issue', 'teacher_low_load', 'teacher_top_performer', 'lead_hot', 'lead_stale', 'lead_conversion_drop', 'group_underfilled', 'group_complaints', 'slot_opportunity', 'course_attendance_drop', 'course_demand', 'course_marketing');

-- CreateEnum
CREATE TYPE "InsightSeverity" AS ENUM ('high', 'medium', 'low');

-- CreateEnum
CREATE TYPE "InsightStatus" AS ENUM ('open', 'acked', 'done', 'dismissed', 'expired');

-- CreateEnum
CREATE TYPE "InsightOutcome" AS ENUM ('pending', 'prevented', 'occurred', 'unknown');

-- CreateEnum
CREATE TYPE "KpiTrigger" AS ENUM ('lead_created', 'lead_converted', 'student_first_payment', 'student_retained', 'payments_collected', 'employee_attendance');

-- CreateEnum
CREATE TYPE "KpiRewardType" AS ENUM ('fixed', 'per_unit', 'percent');

-- CreateEnum
CREATE TYPE "LeadStatus" AS ENUM ('new', 'info_given', 'trial', 'trial_attended', 'enrolled', 'recontacted', 'rejected');

-- CreateEnum
CREATE TYPE "LeadOptionKind" AS ENUM ('source', 'direction', 'rejection');

-- CreateEnum
CREATE TYPE "CancellationReason" AS ENUM ('teacher_absent', 'facility', 'weather', 'other');

-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('payment_reminder', 'debt_warning', 'class_cancel', 'announcement', 'admin_personal', 'teacher_message', 'feedback_status', 'holiday', 'attendance', 'template_based', 'other');

-- CreateEnum
CREATE TYPE "AudienceType" AS ENUM ('all_students', 'all_teachers', 'groups', 'users', 'individual', 'feedback_author', 'auto_system');

-- CreateEnum
CREATE TYPE "SenderRole" AS ENUM ('owner', 'teacher', 'system');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('inapp', 'telegram');

-- CreateEnum
CREATE TYPE "NotificationStatus" AS ENUM ('sent', 'scheduled', 'canceled');

-- CreateEnum
CREATE TYPE "TemplateCategory" AS ENUM ('payment', 'debt', 'class_cancel', 'announcement', 'holiday', 'personal', 'feedback_status', 'custom');

-- CreateEnum
CREATE TYPE "OpeningRole" AS ENUM ('student', 'teacher', 'staff');

-- CreateEnum
CREATE TYPE "OpeningSignConvention" AS ENUM ('flow', 'party');

-- CreateEnum
CREATE TYPE "OpeningKind" AS ENUM ('student_credit', 'student_debt', 'teacher_credit', 'teacher_debt', 'staff_credit', 'staff_debt');

-- CreateEnum
CREATE TYPE "OpeningPendingReason" AS ENUM ('', 'awaiting_group');

-- CreateEnum
CREATE TYPE "PaymentSource" AS ENUM ('direct', 'deposit');

-- CreateEnum
CREATE TYPE "PayStatus" AS ENUM ('unpaid', 'partial', 'paid');

-- CreateEnum
CREATE TYPE "RoleType" AS ENUM ('owner', 'staff', 'teacher', 'student');

-- CreateEnum
CREATE TYPE "ShiftStatus" AS ENUM ('open', 'closed');

-- CreateEnum
CREATE TYPE "StaffSalaryType" AS ENUM ('fixed', 'fixed_plus_kpi', 'kpi_only');

-- CreateEnum
CREATE TYPE "StaffAdjustmentKind" AS ENUM ('bonus', 'penalty', 'opening_credit', 'opening_debt');

-- CreateEnum
CREATE TYPE "PayrollSource" AS ENUM ('auto', 'generated', 'manual', 'imported', 'migrated');

-- CreateEnum
CREATE TYPE "PayrollLifecycle" AS ENUM ('draft', 'finalized');

-- CreateEnum
CREATE TYPE "CleanupFrequency" AS ENUM ('weekly', 'monthly', 'semiannual');

-- CreateEnum
CREATE TYPE "FilePurpose" AS ENUM ('assignment');

-- CreateEnum
CREATE TYPE "TeacherAttendanceStatus" AS ENUM ('present', 'absent', 'excused');

-- CreateEnum
CREATE TYPE "CompBaseType" AS ENUM ('none', 'fixed_monthly');

-- CreateEnum
CREATE TYPE "CompVariableType" AS ENUM ('none', 'percent', 'per_student', 'per_lesson_hour', 'per_group');

-- CreateEnum
CREATE TYPE "CompPercentBase" AS ENUM ('billed', 'collected');

-- CreateEnum
CREATE TYPE "SalaryKind" AS ENUM ('group', 'base', 'bonus', 'deduction', 'opening');

-- CreateEnum
CREATE TYPE "SalaryRateType" AS ENUM ('fixed', 'percent', 'mixed');

-- CreateEnum
CREATE TYPE "SalarySource" AS ENUM ('auto', 'manual');

-- CreateEnum
CREATE TYPE "Gender" AS ENUM ('male', 'female');

-- CreateTable
CREATE TABLE "users" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "phone" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'student',
    "homeBranchId" VARCHAR(24),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "lastLoginAt" TIMESTAMP(3),
    "birthDate" TIMESTAMP(3),
    "gender" "Gender",
    "enrolledAt" TIMESTAMP(3),
    "leadId" VARCHAR(24),
    "completedAt" TIMESTAMP(3),
    "completedAtManual" BOOLEAN NOT NULL DEFAULT false,
    "hiredAt" TIMESTAMP(3),
    "payrollStartFrom" TIMESTAMP(3),
    "terminatedAt" TIMESTAMP(3),
    "terminationReason" TEXT NOT NULL DEFAULT '',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" VARCHAR(24),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "user_branch_assignments" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "userId" VARCHAR(24) NOT NULL,
    "branchId" VARCHAR(24) NOT NULL,
    "role" TEXT,

    CONSTRAINT "user_branch_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "roleType" "RoleType" NOT NULL DEFAULT 'staff',
    "defaultPath" TEXT NOT NULL DEFAULT '/owner',
    "isFrozen" BOOLEAN NOT NULL DEFAULT false,
    "frozenAt" TIMESTAMP(3),
    "frozenById" VARCHAR(24),
    "frozenReason" TEXT NOT NULL DEFAULT '',
    "permissionsVersion" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "group" TEXT NOT NULL DEFAULT 'general',
    "module" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "moduleLabel" TEXT,
    "moduleOrder" INTEGER NOT NULL DEFAULT 100,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "userId" VARCHAR(24) NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "branches" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "name" TEXT NOT NULL,
    "code" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "isMain" BOOLEAN NOT NULL DEFAULT false,
    "expenseApprovalThreshold" DOUBLE PRECISION,
    "delegation" JSONB,
    "areaM2" DOUBLE PRECISION,
    "openedAt" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" VARCHAR(24),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "branches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "courses" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "title" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "level" TEXT NOT NULL DEFAULT '',
    "defaultDurationMonths" INTEGER,
    "leadDirectionId" VARCHAR(24),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" VARCHAR(24),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "courses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "course_prices" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "courseId" VARCHAR(24) NOT NULL,
    "branchId" VARCHAR(24),
    "amount" DOUBLE PRECISION NOT NULL,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validTo" TIMESTAMP(3),
    "note" TEXT NOT NULL DEFAULT '',
    "createdById" VARCHAR(24),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" VARCHAR(24),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "course_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "branchId" VARCHAR(24) NOT NULL,
    "name" TEXT NOT NULL,
    "capacity" INTEGER,
    "areaM2" DOUBLE PRECISION,
    "equipment" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "note" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" VARCHAR(24),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "groups" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "branchId" VARCHAR(24) NOT NULL,
    "name" TEXT NOT NULL,
    "courseId" VARCHAR(24),
    "roomId" VARCHAR(24),
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "durationMonths" INTEGER,
    "entryBilling" "EntryBilling" NOT NULL DEFAULT 'prorated',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "archivedClosedPeriods" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "archivedClosedMemberships" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" VARCHAR(24),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_schedule_items" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "groupId" VARCHAR(24) NOT NULL,
    "day" "WeekDay" NOT NULL,
    "startTime" VARCHAR(5) NOT NULL,
    "endTime" VARCHAR(5) NOT NULL,
    "effectiveFrom" TIMESTAMP(3),

    CONSTRAINT "group_schedule_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_memberships" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "groupId" VARCHAR(24) NOT NULL,
    "studentId" VARCHAR(24) NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    "leftReason" "LeftReason",
    "leftReasonDetailId" VARCHAR(24),
    "leftReasonTitle" TEXT NOT NULL DEFAULT '',
    "removalNoticeSeenAt" TIMESTAMP(3),
    "transferredToId" VARCHAR(24),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" VARCHAR(24),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendances" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "groupId" VARCHAR(24) NOT NULL,
    "studentId" VARCHAR(24) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "dateKey" VARCHAR(10) NOT NULL,
    "status" "AttendanceStatus" NOT NULL,
    "slot" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT '',
    "lateMinutes" INTEGER NOT NULL DEFAULT 0,
    "recordedById" VARCHAR(24),
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "AttendanceSource" NOT NULL DEFAULT 'teacher',
    "history" JSONB NOT NULL DEFAULT '[]',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" VARCHAR(24),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_exemptions" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "studentId" VARCHAR(24) NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "daysOfWeek" "WeekDay"[] DEFAULT ARRAY[]::"WeekDay"[],
    "reason" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" VARCHAR(24),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" VARCHAR(24),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_exemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "lowAttendanceThreshold" INTEGER NOT NULL DEFAULT 60,
    "consecutiveAbsencesAlert" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grades" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "groupId" VARCHAR(24) NOT NULL,
    "studentId" VARCHAR(24) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "dateKey" VARCHAR(10) NOT NULL,
    "slot" TEXT NOT NULL DEFAULT '',
    "value" INTEGER NOT NULL,
    "comment" TEXT NOT NULL DEFAULT '',
    "recordedById" VARCHAR(24) NOT NULL,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "source" "GradeSource" NOT NULL DEFAULT 'teacher',
    "history" JSONB NOT NULL DEFAULT '[]',
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" VARCHAR(24),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "grades_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lesson_cancellations" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "groupId" VARCHAR(24) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "dateKey" VARCHAR(10) NOT NULL,
    "slot" TEXT NOT NULL DEFAULT '',
    "reason" "CancellationReason" NOT NULL DEFAULT 'other',
    "note" TEXT NOT NULL DEFAULT '',
    "billable" BOOLEAN NOT NULL DEFAULT false,
    "makeupDate" TIMESTAMP(3),
    "createdById" VARCHAR(24),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" VARCHAR(24),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lesson_cancellations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_absences" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "groupId" VARCHAR(24) NOT NULL,
    "teacherId" VARCHAR(24),
    "date" TIMESTAMP(3) NOT NULL,
    "dateKey" VARCHAR(10) NOT NULL,
    "recordedById" VARCHAR(24) NOT NULL,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" VARCHAR(24),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_absences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_attendances" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "teacherId" VARCHAR(24) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "dateKey" VARCHAR(10) NOT NULL,
    "status" "TeacherAttendanceStatus" NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "recordedById" VARCHAR(24),
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" VARCHAR(24),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_attendances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_payments" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "branchId" VARCHAR(24) NOT NULL,
    "studentId" VARCHAR(24) NOT NULL,
    "groupId" VARCHAR(24) NOT NULL,
    "membershipId" VARCHAR(24),
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "baseFee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "prorationFactor" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "discountApplied" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expectedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "PayStatus" NOT NULL DEFAULT 'unpaid',
    "writtenOff" BOOLEAN NOT NULL DEFAULT false,
    "writeOffAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "writeOffAt" TIMESTAMP(3),
    "recalculatedAt" TIMESTAMP(3),
    "isOpening" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_transactions" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "branchId" VARCHAR(24) NOT NULL,
    "paymentId" VARCHAR(24) NOT NULL,
    "studentId" VARCHAR(24) NOT NULL,
    "groupId" VARCHAR(24) NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "source" "PaymentSource" NOT NULL DEFAULT 'direct',
    "method" "PaymentMethod" NOT NULL DEFAULT 'cash',
    "paidAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "idempotencyKey" TEXT,
    "batchId" VARCHAR(24),
    "createdById" VARCHAR(24),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" VARCHAR(24),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_deposits" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "studentId" VARCHAR(24) NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_deposits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "deposit_transactions" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "branchId" VARCHAR(24),
    "studentId" VARCHAR(24) NOT NULL,
    "depositId" VARCHAR(24) NOT NULL,
    "type" "DepositTxType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "method" "PaymentMethod" NOT NULL DEFAULT 'cash',
    "balanceAfter" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "note" TEXT NOT NULL DEFAULT '',
    "isOpening" BOOLEAN NOT NULL DEFAULT false,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "createdById" VARCHAR(24),
    "expenseApprovalId" VARCHAR(24),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" VARCHAR(24),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "deposit_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "discounts" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "studentId" VARCHAR(24) NOT NULL,
    "groupId" VARCHAR(24) NOT NULL,
    "type" "DiscountType" NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "scope" "DiscountScope" NOT NULL,
    "year" INTEGER,
    "month" INTEGER,
    "reason" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" VARCHAR(24),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" VARCHAR(24),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "group_fees" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "groupId" VARCHAR(24) NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "source" "FeeSource" NOT NULL DEFAULT 'auto',
    "createdById" VARCHAR(24),
    "updatedById" VARCHAR(24),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "group_fees_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debt_write_offs" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "studentId" VARCHAR(24) NOT NULL,
    "groupId" VARCHAR(24) NOT NULL,
    "membershipId" VARCHAR(24),
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reasonTitle" TEXT NOT NULL DEFAULT '',
    "studentName" TEXT NOT NULL DEFAULT '',
    "groupName" TEXT NOT NULL DEFAULT '',
    "createdById" VARCHAR(24),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "debt_write_offs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "debt_write_off_breakdown" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "writeOffId" VARCHAR(24) NOT NULL,
    "paymentId" VARCHAR(24),
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "debt_write_off_breakdown_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_freezes" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "studentId" VARCHAR(24) NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "reason" TEXT NOT NULL DEFAULT '',
    "createdById" VARCHAR(24),
    "endedById" VARCHAR(24),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" VARCHAR(24),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_freezes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_categories" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "name" TEXT NOT NULL,
    "code" TEXT,
    "kind" "ExpenseCategoryKind" NOT NULL DEFAULT 'operating',
    "branchId" VARCHAR(24),
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" VARCHAR(24),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" VARCHAR(24),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expenses" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "branchId" VARCHAR(24),
    "allocation" "ExpenseAllocation" NOT NULL DEFAULT 'none',
    "categoryId" VARCHAR(24) NOT NULL,
    "categoryName" TEXT NOT NULL DEFAULT '',
    "categoryKind" TEXT NOT NULL DEFAULT 'operating',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" "ExpenseCurrency" NOT NULL DEFAULT 'UZS',
    "originalAmount" DOUBLE PRECISION,
    "exchangeRate" DOUBLE PRECISION,
    "rateSource" TEXT NOT NULL DEFAULT '',
    "spentAt" TIMESTAMP(3) NOT NULL,
    "accrualYear" INTEGER NOT NULL,
    "accrualMonth" INTEGER NOT NULL,
    "method" "ExpenseMethod" NOT NULL DEFAULT 'cash',
    "vendor" TEXT NOT NULL DEFAULT '',
    "receiptId" VARCHAR(24),
    "isCapital" BOOLEAN NOT NULL DEFAULT false,
    "depreciationMonths" INTEGER,
    "expenseApprovalId" VARCHAR(24),
    "createdById" VARCHAR(24),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" VARCHAR(24),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_approvals" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "branchId" VARCHAR(24) NOT NULL,
    "kind" "ApprovalKind" NOT NULL,
    "category" "ApprovalCategory" NOT NULL DEFAULT 'financial',
    "amount" DOUBLE PRECISION,
    "thresholdAtRequest" DOUBLE PRECISION,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "subjectKey" TEXT,
    "subjectName" TEXT NOT NULL DEFAULT '',
    "contextName" TEXT NOT NULL DEFAULT '',
    "status" "ApprovalStatus" NOT NULL DEFAULT 'pending',
    "requestedById" VARCHAR(24) NOT NULL,
    "requestNote" TEXT NOT NULL DEFAULT '',
    "decidedById" VARCHAR(24),
    "decidedAt" TIMESTAMP(3),
    "decisionNote" TEXT NOT NULL DEFAULT '',
    "resultTransactionId" VARCHAR(24),
    "executedAt" TIMESTAMP(3),
    "failureReason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_compensations" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "teacherId" VARCHAR(24) NOT NULL,
    "branchId" VARCHAR(24),
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "baseType" "CompBaseType" NOT NULL DEFAULT 'none',
    "baseAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "variableType" "CompVariableType" NOT NULL DEFAULT 'none',
    "variableRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "percentBase" "CompPercentBase" NOT NULL DEFAULT 'billed',
    "note" TEXT NOT NULL DEFAULT '',
    "createdById" VARCHAR(24),
    "updatedById" VARCHAR(24),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" VARCHAR(24),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_compensations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_group_periods" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "teacherId" VARCHAR(24) NOT NULL,
    "groupId" VARCHAR(24) NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "variableType" "CompVariableType",
    "variableRate" DOUBLE PRECISION,
    "percentBase" "CompPercentBase",
    "salaryType" "SalaryRateType",
    "fixedAmount" DOUBLE PRECISION,
    "percentRate" DOUBLE PRECISION,
    "createdById" VARCHAR(24),
    "updatedById" VARCHAR(24),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" VARCHAR(24),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_group_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teacher_salaries" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "branchId" VARCHAR(24) NOT NULL,
    "teacherId" VARCHAR(24) NOT NULL,
    "groupId" VARCHAR(24),
    "kind" "SalaryKind" NOT NULL DEFAULT 'group',
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "salaryType" "SalaryRateType" NOT NULL DEFAULT 'fixed',
    "fixedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "percentRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "workStartDate" TIMESTAMP(3),
    "workEndDate" TIMESTAMP(3),
    "variableType" "CompVariableType",
    "variableRate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "percentBase" "CompPercentBase",
    "rateSource" TEXT NOT NULL DEFAULT 'none',
    "compensationId" VARCHAR(24),
    "groupRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "prorationFactor" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "payableDays" INTEGER NOT NULL DEFAULT 0,
    "totalDays" INTEGER NOT NULL DEFAULT 0,
    "proratedFixed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "percentAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "studentUnits" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "perStudentAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lessonHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "perHourAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "perGroupAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "baseEarnings" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expectedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "isOpening" BOOLEAN NOT NULL DEFAULT false,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overpaidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "PayStatus" NOT NULL DEFAULT 'unpaid',
    "isLocked" BOOLEAN NOT NULL DEFAULT false,
    "lockedAt" TIMESTAMP(3),
    "lockedById" VARCHAR(24),
    "source" "SalarySource" NOT NULL DEFAULT 'auto',
    "reason" TEXT NOT NULL DEFAULT '',
    "approvalId" VARCHAR(24),
    "createdById" VARCHAR(24),
    "recalculatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teacher_salaries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_transactions" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "branchId" VARCHAR(24) NOT NULL,
    "salaryId" VARCHAR(24) NOT NULL,
    "teacherId" VARCHAR(24) NOT NULL,
    "groupId" VARCHAR(24),
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdById" VARCHAR(24),
    "expenseApprovalId" VARCHAR(24),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" VARCHAR(24),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "salary_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_compensations" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "employeeId" VARCHAR(24) NOT NULL,
    "branchId" VARCHAR(24),
    "salaryType" "StaffSalaryType" NOT NULL DEFAULT 'fixed',
    "baseAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "effectiveTo" TIMESTAMP(3),
    "note" TEXT NOT NULL DEFAULT '',
    "createdById" VARCHAR(24),
    "updatedById" VARCHAR(24),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" VARCHAR(24),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_compensations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kpi_rules" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "trigger" "KpiTrigger" NOT NULL,
    "conditions" JSONB NOT NULL DEFAULT '{}',
    "rewardType" "KpiRewardType" NOT NULL DEFAULT 'fixed',
    "rewardValue" DOUBLE PRECISION NOT NULL,
    "applicableRoles" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "branchId" VARCHAR(24),
    "monthlyCap" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdById" VARCHAR(24),
    "updatedById" VARCHAR(24),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" VARCHAR(24),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "kpi_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_kpi_assignments" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "employeeId" VARCHAR(24) NOT NULL,
    "ruleId" VARCHAR(24) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "rewardValueOverride" DOUBLE PRECISION,
    "createdById" VARCHAR(24),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" VARCHAR(24),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_kpi_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_payrolls" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "employeeId" VARCHAR(24) NOT NULL,
    "branchId" VARCHAR(24),
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "salaryType" TEXT NOT NULL DEFAULT 'fixed',
    "baseAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "prorationFactor" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "payableDays" INTEGER NOT NULL DEFAULT 0,
    "totalDays" INTEGER NOT NULL DEFAULT 0,
    "fixedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "autoKpiTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "manualBonusTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "penaltyTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "openingCreditTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "openingDebtTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "openingDebtApplied" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "finalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "PayStatus" NOT NULL DEFAULT 'unpaid',
    "computedAt" TIMESTAMP(3),
    "source" "PayrollSource" NOT NULL DEFAULT 'auto',
    "snapshot" JSONB,
    "lifecycle" "PayrollLifecycle" NOT NULL DEFAULT 'draft',
    "finalizedAt" TIMESTAMP(3),
    "finalizedById" VARCHAR(24),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_payrolls_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_payroll_items" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "payrollId" VARCHAR(24) NOT NULL,
    "employeeId" VARCHAR(24) NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "ruleId" VARCHAR(24) NOT NULL,
    "ruleName" TEXT NOT NULL DEFAULT '',
    "trigger" TEXT NOT NULL DEFAULT '',
    "sourceType" TEXT NOT NULL,
    "sourceId" VARCHAR(24),
    "eventKey" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "unitAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_payroll_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_payroll_adjustments" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "employeeId" VARCHAR(24) NOT NULL,
    "branchId" VARCHAR(24),
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "kind" "StaffAdjustmentKind" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3),
    "carriedFromYear" INTEGER,
    "carriedFromMonth" INTEGER,
    "createdById" VARCHAR(24),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" VARCHAR(24),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_payroll_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "staff_salary_transactions" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "branchId" VARCHAR(24),
    "payrollId" VARCHAR(24) NOT NULL,
    "employeeId" VARCHAR(24) NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "method" "PaymentMethod" NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "createdById" VARCHAR(24),
    "expenseApprovalId" VARCHAR(24),
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" VARCHAR(24),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "staff_salary_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_audit_logs" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "employeeId" VARCHAR(24) NOT NULL,
    "year" INTEGER,
    "month" INTEGER,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL DEFAULT '',
    "targetId" VARCHAR(24),
    "oldValue" JSONB,
    "newValue" JSONB,
    "reason" TEXT NOT NULL DEFAULT '',
    "actorId" VARCHAR(24),
    "actorLabel" TEXT NOT NULL DEFAULT '',
    "meta" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "branchId" VARCHAR(24) NOT NULL,
    "kind" "AccountKind" NOT NULL,
    "counterpartyBranchId" VARCHAR(24),
    "name" TEXT NOT NULL DEFAULT '',
    "currency" TEXT NOT NULL DEFAULT 'UZS',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_entries" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "branchId" VARCHAR(24) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "kind" "EntryKind" NOT NULL,
    "memo" TEXT NOT NULL DEFAULT '',
    "refModel" TEXT,
    "refId" VARCHAR(24),
    "isInternal" BOOLEAN NOT NULL DEFAULT false,
    "counterpartyBranchId" VARCHAR(24),
    "totalDebit" DOUBLE PRECISION NOT NULL,
    "totalCredit" DOUBLE PRECISION NOT NULL,
    "createdById" VARCHAR(24),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "journal_lines" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "entryId" VARCHAR(24) NOT NULL,
    "accountId" VARCHAR(24) NOT NULL,
    "accountKind" TEXT NOT NULL,
    "debit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "credit" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shifts" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "branchId" VARCHAR(24) NOT NULL,
    "cashierId" VARCHAR(24) NOT NULL,
    "openedAt" TIMESTAMP(3) NOT NULL,
    "openedById" VARCHAR(24),
    "closedAt" TIMESTAMP(3),
    "closedById" VARCHAR(24),
    "openingCash" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expectedCash" DOUBLE PRECISION,
    "countedCash" DOUBLE PRECISION,
    "variance" DOUBLE PRECISION,
    "varianceNote" TEXT NOT NULL DEFAULT '',
    "status" "ShiftStatus" NOT NULL DEFAULT 'open',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shifts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_transfers" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "fromBranchId" VARCHAR(24) NOT NULL,
    "toBranchId" VARCHAR(24) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "countedOnArrival" DOUBLE PRECISION,
    "discrepancy" DOUBLE PRECISION,
    "status" "TransferStatus" NOT NULL DEFAULT 'in_transit',
    "sentById" VARCHAR(24),
    "sentAt" TIMESTAMP(3) NOT NULL,
    "receivedById" VARCHAR(24),
    "receivedAt" TIMESTAMP(3),
    "shiftId" VARCHAR(24),
    "note" TEXT NOT NULL DEFAULT '',
    "discrepancyNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cash_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "opening_balances" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "userId" VARCHAR(24) NOT NULL,
    "role" "OpeningRole" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "signConvention" "OpeningSignConvention" NOT NULL DEFAULT 'flow',
    "branchId" VARCHAR(24),
    "groupId" VARCHAR(24),
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "kind" "OpeningKind" NOT NULL,
    "materializedRefs" JSONB NOT NULL DEFAULT '[]',
    "materializedAt" TIMESTAMP(3),
    "materializeError" TEXT NOT NULL DEFAULT '',
    "pendingReason" "OpeningPendingReason" NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "importJobId" VARCHAR(24),
    "createdById" VARCHAR(24),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "opening_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leads" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "branchId" VARCHAR(24) NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL DEFAULT '',
    "age" INTEGER,
    "phone" TEXT NOT NULL,
    "parentPhone" TEXT,
    "sourceId" VARCHAR(24),
    "directionId" VARCHAR(24),
    "status" "LeadStatus" NOT NULL DEFAULT 'new',
    "rejectionReasonId" VARCHAR(24),
    "rejectionNote" TEXT NOT NULL DEFAULT '',
    "closedAt" TIMESTAMP(3),
    "trialDate" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "assignedToId" VARCHAR(24),
    "followUpAt" TIMESTAMP(3),
    "followUpNote" TEXT NOT NULL DEFAULT '',
    "followUpNotifiedAt" TIMESTAMP(3),
    "studentId" VARCHAR(24),
    "creditedToId" VARCHAR(24),
    "convertedById" VARCHAR(24),
    "convertedAt" TIMESTAMP(3),
    "statusHistory" JSONB NOT NULL DEFAULT '[]',
    "createdById" VARCHAR(24),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leads_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_options" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "kind" "LeadOptionKind" NOT NULL,
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" VARCHAR(24),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lead_routing_rules" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "branchId" VARCHAR(24) NOT NULL,
    "sourceKey" TEXT,
    "isFallback" BOOLEAN NOT NULL DEFAULT false,
    "assigneeId" VARCHAR(24),
    "priority" INTEGER NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lead_routing_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "senderId" VARCHAR(24),
    "senderRole" "SenderRole" NOT NULL DEFAULT 'system',
    "title" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL,
    "category" "NotificationCategory" NOT NULL DEFAULT 'other',
    "templateId" VARCHAR(24),
    "audienceType" "AudienceType" NOT NULL,
    "channels" "NotificationChannel"[] DEFAULT ARRAY['inapp', 'telegram']::"NotificationChannel"[],
    "status" "NotificationStatus" NOT NULL DEFAULT 'sent',
    "scheduleAt" TIMESTAMP(3),
    "recipientsCount" INTEGER NOT NULL DEFAULT 0,
    "deliveredViaBot" INTEGER NOT NULL DEFAULT 0,
    "readCount" INTEGER NOT NULL DEFAULT 0,
    "isAuto" BOOLEAN NOT NULL DEFAULT false,
    "dedupeKey" TEXT,
    "relatedFeedbackId" VARCHAR(24),
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_recipients" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "notificationId" VARCHAR(24) NOT NULL,
    "userId" VARCHAR(24) NOT NULL,
    "inapp" BOOLEAN NOT NULL DEFAULT true,
    "readAt" TIMESTAMP(3),
    "botDeliveredAt" TIMESTAMP(3),
    "botFailedReason" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notification_templates" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "name" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "category" "TemplateCategory" NOT NULL DEFAULT 'custom',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "system_notifications" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "message" TEXT NOT NULL,
    "link" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "system_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedbacks" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "authorId" VARCHAR(24),
    "authorRoleSnapshot" TEXT NOT NULL DEFAULT '',
    "isAnonymous" BOOLEAN NOT NULL DEFAULT false,
    "typeId" VARCHAR(24) NOT NULL,
    "groupId" VARCHAR(24),
    "message" TEXT NOT NULL,
    "status" "FeedbackStatus" NOT NULL DEFAULT 'new',
    "rejectionReason" TEXT NOT NULL DEFAULT '',
    "adminReply" TEXT NOT NULL DEFAULT '',
    "repliedById" VARCHAR(24),
    "repliedAt" TIMESTAMP(3),
    "reviewedById" VARCHAR(24),
    "reviewedAt" TIMESTAMP(3),
    "resolvedById" VARCHAR(24),
    "resolvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedbacks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feedback_types" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "name" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feedback_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignments" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "senderId" VARCHAR(24) NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "branchId" VARCHAR(24),
    "fileId" VARCHAR(24),
    "fileRemovedAt" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "recipientsCount" INTEGER NOT NULL DEFAULT 0,
    "deliveredCount" INTEGER NOT NULL DEFAULT 0,
    "blockedCount" INTEGER NOT NULL DEFAULT 0,
    "noBotCount" INTEGER NOT NULL DEFAULT 0,
    "failedCount" INTEGER NOT NULL DEFAULT 0,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" VARCHAR(24),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assignment_recipients" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "assignmentId" VARCHAR(24) NOT NULL,
    "studentId" VARCHAR(24) NOT NULL,
    "groupId" VARCHAR(24),
    "status" "DeliveryStatus" NOT NULL DEFAULT 'pending',
    "deliveredAt" TIMESTAMP(3),
    "failedReason" TEXT NOT NULL DEFAULT '',
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assignment_recipients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stored_files" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "originalName" TEXT NOT NULL,
    "storedName" TEXT NOT NULL,
    "relPath" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "size" DOUBLE PRECISION NOT NULL,
    "purpose" "FilePurpose" NOT NULL DEFAULT 'assignment',
    "uploadedById" VARCHAR(24),
    "telegramFileId" TEXT,
    "isDeleted" BOOLEAN NOT NULL DEFAULT false,
    "deletedAt" TIMESTAMP(3),
    "deletedBy" VARCHAR(24),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stored_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "autoCleanupEnabled" BOOLEAN NOT NULL DEFAULT false,
    "frequency" "CleanupFrequency" NOT NULL DEFAULT 'monthly',
    "olderThanDays" INTEGER NOT NULL DEFAULT 180,
    "lastRunAt" TIMESTAMP(3),
    "lastRunDeleted" INTEGER NOT NULL DEFAULT 0,
    "lastRunFreedBytes" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "storage_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "storage_usage" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "key" TEXT NOT NULL DEFAULT 'global',
    "usedBytes" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reconciledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "storage_usage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bot_users" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "telegramId" BIGINT NOT NULL,
    "chatId" BIGINT NOT NULL,
    "username" TEXT,
    "firstName" TEXT NOT NULL DEFAULT '',
    "lastName" TEXT NOT NULL DEFAULT '',
    "languageCode" TEXT NOT NULL DEFAULT 'uz',
    "isBot" BOOLEAN NOT NULL DEFAULT false,
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "userId" VARCHAR(24),
    "flowState" JSONB,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bot_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bot_locks" (
    "id" TEXT NOT NULL,
    "holder" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bot_locks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "activity_logs" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "userId" VARCHAR(24),
    "userRole" TEXT NOT NULL DEFAULT 'system',
    "actorLabel" TEXT NOT NULL DEFAULT '',
    "method" "HttpMethod" NOT NULL,
    "path" TEXT NOT NULL,
    "status" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "ip" TEXT NOT NULL DEFAULT '',
    "userAgent" TEXT NOT NULL DEFAULT '',
    "body" JSONB,
    "resourceType" TEXT NOT NULL DEFAULT '',
    "resourceId" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "activity_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "archive_reasons" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "title" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" VARCHAR(24),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "archive_reasons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "archive_logs" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "userId" VARCHAR(24) NOT NULL,
    "action" "ArchiveAction" NOT NULL,
    "reasonId" VARCHAR(24),
    "reasonTitle" TEXT NOT NULL DEFAULT '',
    "performedById" VARCHAR(24),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "archive_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "name" TEXT NOT NULL,
    "isRecurring" BOOLEAN NOT NULL DEFAULT true,
    "month" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,
    "year" INTEGER,
    "message" TEXT NOT NULL,
    "audience" "HolidayAudience" NOT NULL DEFAULT 'all',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSentAt" TIMESTAMP(3),
    "createdById" VARCHAR(24),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_jobs" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "branchId" VARCHAR(24),
    "importerKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL DEFAULT '',
    "userId" VARCHAR(24),
    "userName" TEXT NOT NULL DEFAULT '',
    "total" INTEGER NOT NULL DEFAULT 0,
    "imported" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "duplicate" INTEGER NOT NULL DEFAULT 0,
    "pending" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "mode" "ImportMode" NOT NULL DEFAULT 'file',
    "status" "ImportStatus" NOT NULL DEFAULT 'completed',
    "processed" INTEGER NOT NULL DEFAULT 0,
    "rows" JSONB NOT NULL DEFAULT '[]',
    "results" JSONB NOT NULL DEFAULT '[]',
    "scope" JSONB NOT NULL DEFAULT '{}',
    "error" TEXT NOT NULL DEFAULT '',
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "import_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "caches" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "key" TEXT NOT NULL,
    "value" JSONB,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "caches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rating_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "gradeWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.7,
    "attendanceWeight" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "rating_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_configs" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "branchId" VARCHAR(24),
    "churnWeights" JSONB NOT NULL,
    "paymentWeights" JSONB NOT NULL,
    "thresholds" JSONB NOT NULL,
    "confidenceFloor" DOUBLE PRECISION NOT NULL DEFAULT 0.4,
    "narrationEnabled" BOOLEAN NOT NULL DEFAULT true,
    "narrationModel" TEXT NOT NULL DEFAULT 'gemini-2.5-flash',
    "engineVersion" TEXT NOT NULL DEFAULT '1.0.0',
    "updatedById" VARCHAR(24),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "insights" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "branchId" VARCHAR(24) NOT NULL,
    "subjectType" "InsightSubjectType" NOT NULL,
    "subjectId" VARCHAR(24) NOT NULL,
    "subjectLabel" TEXT NOT NULL DEFAULT '',
    "subjectHref" TEXT,
    "kind" "InsightKind" NOT NULL,
    "domain" "InsightDomain" NOT NULL,
    "stance" "InsightStance" NOT NULL DEFAULT 'risk',
    "severity" "InsightSeverity" NOT NULL,
    "title" TEXT NOT NULL DEFAULT '',
    "score" DOUBLE PRECISION NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "factors" JSONB NOT NULL DEFAULT '[]',
    "sourceRefs" JSONB NOT NULL DEFAULT '[]',
    "recommendedActions" JSONB NOT NULL DEFAULT '[]',
    "expectedImpactAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "expectedImpactCurrency" TEXT NOT NULL DEFAULT 'UZS',
    "expectedImpactLabel" TEXT NOT NULL DEFAULT '',
    "priority" INTEGER NOT NULL DEFAULT 0,
    "narration" TEXT,
    "narrationHash" TEXT,
    "narrationModel" TEXT,
    "status" "InsightStatus" NOT NULL DEFAULT 'open',
    "acknowledgedById" VARCHAR(24),
    "acknowledgedAt" TIMESTAMP(3),
    "resolvedAt" TIMESTAMP(3),
    "dismissReason" TEXT NOT NULL DEFAULT '',
    "outcome" "InsightOutcome" NOT NULL DEFAULT 'pending',
    "outcomeCheckedAt" TIMESTAMP(3),
    "engineVersion" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "insights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_rankings" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "branchId" VARCHAR(24) NOT NULL,
    "type" "RankingType" NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "scanned" INTEGER NOT NULL DEFAULT 0,
    "rows" JSONB NOT NULL DEFAULT '[]',
    "totals" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_rankings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_reports" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "branchId" VARCHAR(24) NOT NULL,
    "period" "AiReportPeriod" NOT NULL,
    "periodKey" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT NOT NULL DEFAULT '',
    "sections" JSONB NOT NULL DEFAULT '[]',
    "insightHigh" INTEGER NOT NULL DEFAULT 0,
    "insightMedium" INTEGER NOT NULL DEFAULT 0,
    "insightOpportunities" INTEGER NOT NULL DEFAULT 0,
    "insightImpactAtRisk" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "outcomePrevented" INTEGER NOT NULL DEFAULT 0,
    "outcomeOccurred" INTEGER NOT NULL DEFAULT 0,
    "outcomeResolvedByOwner" INTEGER NOT NULL DEFAULT 0,
    "narrationModel" TEXT,
    "engineVersion" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_runs" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "branchId" VARCHAR(24) NOT NULL,
    "trigger" "AiRunTrigger" NOT NULL,
    "scope" "AiRunScope" NOT NULL DEFAULT 'full',
    "status" "AiRunStatus" NOT NULL DEFAULT 'running',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "stats" JSONB NOT NULL DEFAULT '{}',
    "openHigh" INTEGER NOT NULL DEFAULT 0,
    "openMedium" INTEGER NOT NULL DEFAULT 0,
    "openOpportunities" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT NOT NULL DEFAULT '',
    "engineVersion" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_runs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_usage_logs" (
    "id" VARCHAR(24) NOT NULL DEFAULT gen_object_id(),
    "branchId" VARCHAR(24),
    "monthKey" TEXT NOT NULL,
    "provider" "AiUsageProvider" NOT NULL,
    "model" TEXT NOT NULL,
    "kind" "AiUsageKind" NOT NULL,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "latencyMs" INTEGER NOT NULL DEFAULT 0,
    "ok" BOOLEAN NOT NULL DEFAULT true,
    "errorCode" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ai_usage_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "_RolePermissions" (
    "A" VARCHAR(24) NOT NULL,
    "B" VARCHAR(24) NOT NULL,

    CONSTRAINT "_RolePermissions_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_GroupTeachers" (
    "A" VARCHAR(24) NOT NULL,
    "B" VARCHAR(24) NOT NULL,

    CONSTRAINT "_GroupTeachers_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_NotificationAudienceGroups" (
    "A" VARCHAR(24) NOT NULL,
    "B" VARCHAR(24) NOT NULL,

    CONSTRAINT "_NotificationAudienceGroups_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_NotificationAudienceUsers" (
    "A" VARCHAR(24) NOT NULL,
    "B" VARCHAR(24) NOT NULL,

    CONSTRAINT "_NotificationAudienceUsers_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateTable
CREATE TABLE "_AssignmentGroups" (
    "A" VARCHAR(24) NOT NULL,
    "B" VARCHAR(24) NOT NULL,

    CONSTRAINT "_AssignmentGroups_AB_pkey" PRIMARY KEY ("A","B")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_username_key" ON "users"("username");

-- CreateIndex
CREATE INDEX "users_phone_idx" ON "users"("phone");

-- CreateIndex
CREATE INDEX "users_leadId_idx" ON "users"("leadId");

-- CreateIndex
CREATE INDEX "users_homeBranchId_isDeleted_isActive_idx" ON "users"("homeBranchId", "isDeleted", "isActive");

-- CreateIndex
CREATE INDEX "user_branch_assignments_branchId_idx" ON "user_branch_assignments"("branchId");

-- CreateIndex
CREATE UNIQUE INDEX "user_branch_assignments_userId_branchId_key" ON "user_branch_assignments"("userId", "branchId");

-- CreateIndex
CREATE UNIQUE INDEX "roles_value_key" ON "roles"("value");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_key_key" ON "permissions"("key");

-- CreateIndex
CREATE INDEX "permissions_module_idx" ON "permissions"("module");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_module_action_key" ON "permissions"("module", "action");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "refresh_tokens_expiresAt_idx" ON "refresh_tokens"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "courses_code_key" ON "courses"("code");

-- CreateIndex
CREATE INDEX "courses_leadDirectionId_idx" ON "courses"("leadDirectionId");

-- CreateIndex
CREATE INDEX "courses_isActive_title_idx" ON "courses"("isActive", "title");

-- CreateIndex
CREATE INDEX "course_prices_courseId_branchId_validTo_idx" ON "course_prices"("courseId", "branchId", "validTo");

-- CreateIndex
CREATE INDEX "rooms_branchId_idx" ON "rooms"("branchId");

-- CreateIndex
CREATE INDEX "rooms_isActive_idx" ON "rooms"("isActive");

-- CreateIndex
CREATE INDEX "groups_branchId_idx" ON "groups"("branchId");

-- CreateIndex
CREATE INDEX "groups_courseId_idx" ON "groups"("courseId");

-- CreateIndex
CREATE INDEX "groups_roomId_idx" ON "groups"("roomId");

-- CreateIndex
CREATE INDEX "groups_endDate_idx" ON "groups"("endDate");

-- CreateIndex
CREATE INDEX "groups_isActive_idx" ON "groups"("isActive");

-- CreateIndex
CREATE INDEX "groups_name_idx" ON "groups"("name");

-- CreateIndex
CREATE INDEX "group_schedule_items_day_idx" ON "group_schedule_items"("day");

-- CreateIndex
CREATE UNIQUE INDEX "group_schedule_items_groupId_day_startTime_effectiveFrom_key" ON "group_schedule_items"("groupId", "day", "startTime", "effectiveFrom");

-- CreateIndex
CREATE INDEX "group_memberships_groupId_idx" ON "group_memberships"("groupId");

-- CreateIndex
CREATE INDEX "group_memberships_studentId_idx" ON "group_memberships"("studentId");

-- CreateIndex
CREATE INDEX "group_memberships_leftReasonDetailId_idx" ON "group_memberships"("leftReasonDetailId");

-- CreateIndex
CREATE INDEX "attendances_studentId_date_idx" ON "attendances"("studentId", "date");

-- CreateIndex
CREATE INDEX "attendances_groupId_date_idx" ON "attendances"("groupId", "date");

-- CreateIndex
CREATE INDEX "attendances_studentId_dateKey_idx" ON "attendances"("studentId", "dateKey");

-- CreateIndex
CREATE INDEX "attendance_exemptions_studentId_isActive_startDate_idx" ON "attendance_exemptions"("studentId", "isActive", "startDate");

-- CreateIndex
CREATE INDEX "grades_studentId_dateKey_idx" ON "grades"("studentId", "dateKey");

-- CreateIndex
CREATE INDEX "grades_groupId_date_idx" ON "grades"("groupId", "date");

-- CreateIndex
CREATE INDEX "lesson_cancellations_groupId_date_idx" ON "lesson_cancellations"("groupId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_absences_groupId_dateKey_key" ON "teacher_absences"("groupId", "dateKey");

-- CreateIndex
CREATE INDEX "teacher_attendances_dateKey_idx" ON "teacher_attendances"("dateKey");

-- CreateIndex
CREATE UNIQUE INDEX "teacher_attendances_teacherId_dateKey_key" ON "teacher_attendances"("teacherId", "dateKey");

-- CreateIndex
CREATE INDEX "student_payments_branchId_idx" ON "student_payments"("branchId");

-- CreateIndex
CREATE INDEX "student_payments_year_month_status_idx" ON "student_payments"("year", "month", "status");

-- CreateIndex
CREATE UNIQUE INDEX "student_payments_studentId_groupId_year_month_isOpening_key" ON "student_payments"("studentId", "groupId", "year", "month", "isOpening");

-- CreateIndex
CREATE INDEX "payment_transactions_branchId_idx" ON "payment_transactions"("branchId");

-- CreateIndex
CREATE INDEX "payment_transactions_paymentId_idx" ON "payment_transactions"("paymentId");

-- CreateIndex
CREATE INDEX "payment_transactions_studentId_idx" ON "payment_transactions"("studentId");

-- CreateIndex
CREATE INDEX "payment_transactions_groupId_idx" ON "payment_transactions"("groupId");

-- CreateIndex
CREATE INDEX "payment_transactions_paidAt_idx" ON "payment_transactions"("paidAt");

-- CreateIndex
CREATE INDEX "payment_transactions_batchId_idx" ON "payment_transactions"("batchId");

-- CreateIndex
CREATE INDEX "payment_transactions_year_month_paidAt_idx" ON "payment_transactions"("year", "month", "paidAt");

-- CreateIndex
CREATE UNIQUE INDEX "student_deposits_studentId_key" ON "student_deposits"("studentId");

-- CreateIndex
CREATE INDEX "deposit_transactions_branchId_idx" ON "deposit_transactions"("branchId");

-- CreateIndex
CREATE INDEX "deposit_transactions_studentId_paidAt_idx" ON "deposit_transactions"("studentId", "paidAt");

-- CreateIndex
CREATE INDEX "deposit_transactions_depositId_idx" ON "deposit_transactions"("depositId");

-- CreateIndex
CREATE INDEX "deposit_transactions_type_idx" ON "deposit_transactions"("type");

-- CreateIndex
CREATE INDEX "deposit_transactions_isOpening_idx" ON "deposit_transactions"("isOpening");

-- CreateIndex
CREATE INDEX "discounts_studentId_groupId_scope_year_month_idx" ON "discounts"("studentId", "groupId", "scope", "year", "month");

-- CreateIndex
CREATE INDEX "discounts_isActive_idx" ON "discounts"("isActive");

-- CreateIndex
CREATE UNIQUE INDEX "group_fees_groupId_year_month_key" ON "group_fees"("groupId", "year", "month");

-- CreateIndex
CREATE INDEX "debt_write_offs_studentId_idx" ON "debt_write_offs"("studentId");

-- CreateIndex
CREATE INDEX "debt_write_offs_groupId_createdAt_idx" ON "debt_write_offs"("groupId", "createdAt");

-- CreateIndex
CREATE INDEX "debt_write_off_breakdown_writeOffId_idx" ON "debt_write_off_breakdown"("writeOffId");

-- CreateIndex
CREATE INDEX "debt_write_off_breakdown_year_month_idx" ON "debt_write_off_breakdown"("year", "month");

-- CreateIndex
CREATE INDEX "student_freezes_studentId_endDate_isDeleted_idx" ON "student_freezes"("studentId", "endDate", "isDeleted");

-- CreateIndex
CREATE INDEX "expense_categories_kind_idx" ON "expense_categories"("kind");

-- CreateIndex
CREATE INDEX "expense_categories_branchId_idx" ON "expense_categories"("branchId");

-- CreateIndex
CREATE INDEX "expense_categories_isActive_idx" ON "expense_categories"("isActive");

-- CreateIndex
CREATE INDEX "expenses_spentAt_isDeleted_idx" ON "expenses"("spentAt", "isDeleted");

-- CreateIndex
CREATE INDEX "expenses_accrualYear_accrualMonth_categoryId_idx" ON "expenses"("accrualYear", "accrualMonth", "categoryId");

-- CreateIndex
CREATE INDEX "expenses_branchId_spentAt_idx" ON "expenses"("branchId", "spentAt");

-- CreateIndex
CREATE INDEX "expenses_categoryId_idx" ON "expenses"("categoryId");

-- CreateIndex
CREATE INDEX "expenses_isCapital_idx" ON "expenses"("isCapital");

-- CreateIndex
CREATE INDEX "expense_approvals_branchId_status_createdAt_idx" ON "expense_approvals"("branchId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "expense_approvals_requestedById_createdAt_idx" ON "expense_approvals"("requestedById", "createdAt");

-- CreateIndex
CREATE INDEX "expense_approvals_category_status_createdAt_idx" ON "expense_approvals"("category", "status", "createdAt");

-- CreateIndex
CREATE INDEX "expense_approvals_kind_idx" ON "expense_approvals"("kind");

-- CreateIndex
CREATE INDEX "teacher_compensations_teacherId_effectiveFrom_idx" ON "teacher_compensations"("teacherId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "teacher_compensations_branchId_idx" ON "teacher_compensations"("branchId");

-- CreateIndex
CREATE INDEX "teacher_group_periods_groupId_startDate_idx" ON "teacher_group_periods"("groupId", "startDate");

-- CreateIndex
CREATE INDEX "teacher_group_periods_teacherId_startDate_idx" ON "teacher_group_periods"("teacherId", "startDate");

-- CreateIndex
CREATE INDEX "teacher_salaries_branchId_idx" ON "teacher_salaries"("branchId");

-- CreateIndex
CREATE INDEX "teacher_salaries_teacherId_idx" ON "teacher_salaries"("teacherId");

-- CreateIndex
CREATE INDEX "teacher_salaries_groupId_idx" ON "teacher_salaries"("groupId");

-- CreateIndex
CREATE INDEX "teacher_salaries_kind_idx" ON "teacher_salaries"("kind");

-- CreateIndex
CREATE INDEX "teacher_salaries_isOpening_idx" ON "teacher_salaries"("isOpening");

-- CreateIndex
CREATE INDEX "teacher_salaries_status_idx" ON "teacher_salaries"("status");

-- CreateIndex
CREATE INDEX "teacher_salaries_year_month_status_idx" ON "teacher_salaries"("year", "month", "status");

-- CreateIndex
CREATE INDEX "salary_transactions_branchId_idx" ON "salary_transactions"("branchId");

-- CreateIndex
CREATE INDEX "salary_transactions_salaryId_idx" ON "salary_transactions"("salaryId");

-- CreateIndex
CREATE INDEX "salary_transactions_teacherId_idx" ON "salary_transactions"("teacherId");

-- CreateIndex
CREATE INDEX "salary_transactions_groupId_idx" ON "salary_transactions"("groupId");

-- CreateIndex
CREATE INDEX "salary_transactions_paidAt_idx" ON "salary_transactions"("paidAt");

-- CreateIndex
CREATE INDEX "salary_transactions_year_month_paidAt_idx" ON "salary_transactions"("year", "month", "paidAt");

-- CreateIndex
CREATE INDEX "staff_compensations_employeeId_effectiveFrom_idx" ON "staff_compensations"("employeeId", "effectiveFrom");

-- CreateIndex
CREATE INDEX "kpi_rules_trigger_idx" ON "kpi_rules"("trigger");

-- CreateIndex
CREATE INDEX "kpi_rules_enabled_trigger_idx" ON "kpi_rules"("enabled", "trigger");

-- CreateIndex
CREATE INDEX "staff_kpi_assignments_employeeId_idx" ON "staff_kpi_assignments"("employeeId");

-- CreateIndex
CREATE INDEX "staff_kpi_assignments_ruleId_idx" ON "staff_kpi_assignments"("ruleId");

-- CreateIndex
CREATE INDEX "staff_payrolls_branchId_idx" ON "staff_payrolls"("branchId");

-- CreateIndex
CREATE INDEX "staff_payrolls_status_idx" ON "staff_payrolls"("status");

-- CreateIndex
CREATE INDEX "staff_payrolls_source_idx" ON "staff_payrolls"("source");

-- CreateIndex
CREATE INDEX "staff_payrolls_lifecycle_idx" ON "staff_payrolls"("lifecycle");

-- CreateIndex
CREATE INDEX "staff_payrolls_year_month_status_idx" ON "staff_payrolls"("year", "month", "status");

-- CreateIndex
CREATE UNIQUE INDEX "staff_payrolls_employeeId_year_month_key" ON "staff_payrolls"("employeeId", "year", "month");

-- CreateIndex
CREATE INDEX "staff_payroll_items_payrollId_idx" ON "staff_payroll_items"("payrollId");

-- CreateIndex
CREATE INDEX "staff_payroll_items_employeeId_year_month_idx" ON "staff_payroll_items"("employeeId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "staff_payroll_items_employeeId_ruleId_eventKey_key" ON "staff_payroll_items"("employeeId", "ruleId", "eventKey");

-- CreateIndex
CREATE INDEX "staff_payroll_adjustments_employeeId_year_month_idx" ON "staff_payroll_adjustments"("employeeId", "year", "month");

-- CreateIndex
CREATE INDEX "staff_salary_transactions_branchId_idx" ON "staff_salary_transactions"("branchId");

-- CreateIndex
CREATE INDEX "staff_salary_transactions_payrollId_idx" ON "staff_salary_transactions"("payrollId");

-- CreateIndex
CREATE INDEX "staff_salary_transactions_employeeId_idx" ON "staff_salary_transactions"("employeeId");

-- CreateIndex
CREATE INDEX "staff_salary_transactions_paidAt_idx" ON "staff_salary_transactions"("paidAt");

-- CreateIndex
CREATE INDEX "staff_salary_transactions_year_month_paidAt_idx" ON "staff_salary_transactions"("year", "month", "paidAt");

-- CreateIndex
CREATE INDEX "payroll_audit_logs_employeeId_createdAt_idx" ON "payroll_audit_logs"("employeeId", "createdAt");

-- CreateIndex
CREATE INDEX "payroll_audit_logs_employeeId_year_month_createdAt_idx" ON "payroll_audit_logs"("employeeId", "year", "month", "createdAt");

-- CreateIndex
CREATE INDEX "payroll_audit_logs_action_idx" ON "payroll_audit_logs"("action");

-- CreateIndex
CREATE INDEX "accounts_branchId_idx" ON "accounts"("branchId");

-- CreateIndex
CREATE INDEX "accounts_counterpartyBranchId_idx" ON "accounts"("counterpartyBranchId");

-- CreateIndex
CREATE INDEX "journal_entries_branchId_date_idx" ON "journal_entries"("branchId", "date");

-- CreateIndex
CREATE INDEX "journal_entries_date_idx" ON "journal_entries"("date");

-- CreateIndex
CREATE INDEX "journal_entries_kind_idx" ON "journal_entries"("kind");

-- CreateIndex
CREATE INDEX "journal_entries_refId_idx" ON "journal_entries"("refId");

-- CreateIndex
CREATE INDEX "journal_entries_isInternal_idx" ON "journal_entries"("isInternal");

-- CreateIndex
CREATE INDEX "journal_lines_entryId_idx" ON "journal_lines"("entryId");

-- CreateIndex
CREATE INDEX "journal_lines_accountId_idx" ON "journal_lines"("accountId");

-- CreateIndex
CREATE INDEX "shifts_branchId_openedAt_idx" ON "shifts"("branchId", "openedAt");

-- CreateIndex
CREATE INDEX "shifts_cashierId_idx" ON "shifts"("cashierId");

-- CreateIndex
CREATE INDEX "shifts_status_idx" ON "shifts"("status");

-- CreateIndex
CREATE INDEX "cash_transfers_fromBranchId_idx" ON "cash_transfers"("fromBranchId");

-- CreateIndex
CREATE INDEX "cash_transfers_toBranchId_status_idx" ON "cash_transfers"("toBranchId", "status");

-- CreateIndex
CREATE INDEX "cash_transfers_status_sentAt_idx" ON "cash_transfers"("status", "sentAt");

-- CreateIndex
CREATE UNIQUE INDEX "opening_balances_userId_key" ON "opening_balances"("userId");

-- CreateIndex
CREATE INDEX "opening_balances_branchId_idx" ON "opening_balances"("branchId");

-- CreateIndex
CREATE INDEX "opening_balances_pendingReason_idx" ON "opening_balances"("pendingReason");

-- CreateIndex
CREATE INDEX "opening_balances_importJobId_idx" ON "opening_balances"("importJobId");

-- CreateIndex
CREATE INDEX "opening_balances_materializedAt_idx" ON "opening_balances"("materializedAt");

-- CreateIndex
CREATE INDEX "leads_branchId_idx" ON "leads"("branchId");

-- CreateIndex
CREATE INDEX "leads_status_createdAt_idx" ON "leads"("status", "createdAt");

-- CreateIndex
CREATE INDEX "leads_sourceId_idx" ON "leads"("sourceId");

-- CreateIndex
CREATE INDEX "leads_directionId_idx" ON "leads"("directionId");

-- CreateIndex
CREATE INDEX "leads_closedAt_idx" ON "leads"("closedAt");

-- CreateIndex
CREATE INDEX "leads_followUpAt_followUpNotifiedAt_idx" ON "leads"("followUpAt", "followUpNotifiedAt");

-- CreateIndex
CREATE INDEX "leads_assignedToId_followUpAt_idx" ON "leads"("assignedToId", "followUpAt");

-- CreateIndex
CREATE INDEX "leads_creditedToId_convertedAt_idx" ON "leads"("creditedToId", "convertedAt");

-- CreateIndex
CREATE INDEX "leads_studentId_idx" ON "leads"("studentId");

-- CreateIndex
CREATE INDEX "leads_createdById_createdAt_idx" ON "leads"("createdById", "createdAt");

-- CreateIndex
CREATE INDEX "leads_phone_createdAt_idx" ON "leads"("phone", "createdAt");

-- CreateIndex
CREATE INDEX "lead_options_kind_isActive_idx" ON "lead_options"("kind", "isActive");

-- CreateIndex
CREATE INDEX "lead_routing_rules_branchId_idx" ON "lead_routing_rules"("branchId");

-- CreateIndex
CREATE INDEX "lead_routing_rules_isActive_idx" ON "lead_routing_rules"("isActive");

-- CreateIndex
CREATE INDEX "notifications_senderId_sentAt_idx" ON "notifications"("senderId", "sentAt");

-- CreateIndex
CREATE INDEX "notifications_category_sentAt_idx" ON "notifications"("category", "sentAt");

-- CreateIndex
CREATE INDEX "notifications_sentAt_idx" ON "notifications"("sentAt");

-- CreateIndex
CREATE INDEX "notifications_status_idx" ON "notifications"("status");

-- CreateIndex
CREATE INDEX "notifications_scheduleAt_idx" ON "notifications"("scheduleAt");

-- CreateIndex
CREATE INDEX "notification_recipients_userId_readAt_createdAt_idx" ON "notification_recipients"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "notification_recipients_notificationId_userId_key" ON "notification_recipients"("notificationId", "userId");

-- CreateIndex
CREATE INDEX "notification_templates_isActive_idx" ON "notification_templates"("isActive");

-- CreateIndex
CREATE INDEX "system_notifications_isRead_idx" ON "system_notifications"("isRead");

-- CreateIndex
CREATE INDEX "system_notifications_createdAt_idx" ON "system_notifications"("createdAt");

-- CreateIndex
CREATE INDEX "feedbacks_status_createdAt_idx" ON "feedbacks"("status", "createdAt");

-- CreateIndex
CREATE INDEX "feedbacks_authorId_createdAt_idx" ON "feedbacks"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "feedbacks_typeId_idx" ON "feedbacks"("typeId");

-- CreateIndex
CREATE INDEX "feedback_types_isActive_idx" ON "feedback_types"("isActive");

-- CreateIndex
CREATE INDEX "assignments_senderId_sentAt_idx" ON "assignments"("senderId", "sentAt");

-- CreateIndex
CREATE INDEX "assignments_branchId_idx" ON "assignments"("branchId");

-- CreateIndex
CREATE INDEX "assignments_sentAt_idx" ON "assignments"("sentAt");

-- CreateIndex
CREATE INDEX "assignment_recipients_studentId_createdAt_idx" ON "assignment_recipients"("studentId", "createdAt");

-- CreateIndex
CREATE INDEX "assignment_recipients_status_idx" ON "assignment_recipients"("status");

-- CreateIndex
CREATE UNIQUE INDEX "assignment_recipients_assignmentId_studentId_key" ON "assignment_recipients"("assignmentId", "studentId");

-- CreateIndex
CREATE UNIQUE INDEX "stored_files_storedName_key" ON "stored_files"("storedName");

-- CreateIndex
CREATE INDEX "stored_files_purpose_idx" ON "stored_files"("purpose");

-- CreateIndex
CREATE INDEX "stored_files_uploadedById_idx" ON "stored_files"("uploadedById");

-- CreateIndex
CREATE INDEX "stored_files_isDeleted_createdAt_idx" ON "stored_files"("isDeleted", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "storage_usage_key_key" ON "storage_usage"("key");

-- CreateIndex
CREATE INDEX "bot_users_telegramId_idx" ON "bot_users"("telegramId");

-- CreateIndex
CREATE INDEX "bot_users_userId_idx" ON "bot_users"("userId");

-- CreateIndex
CREATE INDEX "activity_logs_createdAt_idx" ON "activity_logs"("createdAt");

-- CreateIndex
CREATE INDEX "activity_logs_userId_createdAt_idx" ON "activity_logs"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "activity_logs_resourceType_createdAt_idx" ON "activity_logs"("resourceType", "createdAt");

-- CreateIndex
CREATE INDEX "activity_logs_method_createdAt_idx" ON "activity_logs"("method", "createdAt");

-- CreateIndex
CREATE INDEX "archive_reasons_isActive_idx" ON "archive_reasons"("isActive");

-- CreateIndex
CREATE INDEX "archive_logs_reasonId_action_createdAt_idx" ON "archive_logs"("reasonId", "action", "createdAt");

-- CreateIndex
CREATE INDEX "holidays_isActive_month_day_idx" ON "holidays"("isActive", "month", "day");

-- CreateIndex
CREATE INDEX "import_jobs_branchId_createdAt_idx" ON "import_jobs"("branchId", "createdAt");

-- CreateIndex
CREATE INDEX "import_jobs_userId_status_createdAt_idx" ON "import_jobs"("userId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "import_jobs_importerKey_idx" ON "import_jobs"("importerKey");

-- CreateIndex
CREATE INDEX "import_jobs_status_idx" ON "import_jobs"("status");

-- CreateIndex
CREATE UNIQUE INDEX "caches_key_key" ON "caches"("key");

-- CreateIndex
CREATE INDEX "caches_expiresAt_idx" ON "caches"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ai_configs_branchId_key" ON "ai_configs"("branchId");

-- CreateIndex
CREATE INDEX "insights_branchId_status_priority_idx" ON "insights"("branchId", "status", "priority");

-- CreateIndex
CREATE INDEX "insights_branchId_domain_status_priority_idx" ON "insights"("branchId", "domain", "status", "priority");

-- CreateIndex
CREATE INDEX "insights_subjectId_status_idx" ON "insights"("subjectId", "status");

-- CreateIndex
CREATE INDEX "insights_outcome_resolvedAt_idx" ON "insights"("outcome", "resolvedAt");

-- CreateIndex
CREATE INDEX "insights_generatedAt_idx" ON "insights"("generatedAt");

-- CreateIndex
CREATE INDEX "insights_expiresAt_idx" ON "insights"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "ai_rankings_branchId_type_key" ON "ai_rankings"("branchId", "type");

-- CreateIndex
CREATE INDEX "ai_reports_branchId_period_periodStart_idx" ON "ai_reports"("branchId", "period", "periodStart");

-- CreateIndex
CREATE INDEX "ai_reports_generatedAt_idx" ON "ai_reports"("generatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "ai_reports_branchId_period_periodKey_key" ON "ai_reports"("branchId", "period", "periodKey");

-- CreateIndex
CREATE INDEX "ai_runs_branchId_startedAt_idx" ON "ai_runs"("branchId", "startedAt");

-- CreateIndex
CREATE INDEX "ai_runs_status_idx" ON "ai_runs"("status");

-- CreateIndex
CREATE INDEX "ai_runs_startedAt_idx" ON "ai_runs"("startedAt");

-- CreateIndex
CREATE INDEX "ai_usage_logs_branchId_idx" ON "ai_usage_logs"("branchId");

-- CreateIndex
CREATE INDEX "ai_usage_logs_monthKey_ok_idx" ON "ai_usage_logs"("monthKey", "ok");

-- CreateIndex
CREATE INDEX "ai_usage_logs_kind_idx" ON "ai_usage_logs"("kind");

-- CreateIndex
CREATE INDEX "ai_usage_logs_ok_idx" ON "ai_usage_logs"("ok");

-- CreateIndex
CREATE INDEX "ai_usage_logs_createdAt_idx" ON "ai_usage_logs"("createdAt");

-- CreateIndex
CREATE INDEX "_RolePermissions_B_index" ON "_RolePermissions"("B");

-- CreateIndex
CREATE INDEX "_GroupTeachers_B_index" ON "_GroupTeachers"("B");

-- CreateIndex
CREATE INDEX "_NotificationAudienceGroups_B_index" ON "_NotificationAudienceGroups"("B");

-- CreateIndex
CREATE INDEX "_NotificationAudienceUsers_B_index" ON "_NotificationAudienceUsers"("B");

-- CreateIndex
CREATE INDEX "_AssignmentGroups_B_index" ON "_AssignmentGroups"("B");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_homeBranchId_fkey" FOREIGN KEY ("homeBranchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_branch_assignments" ADD CONSTRAINT "user_branch_assignments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_branch_assignments" ADD CONSTRAINT "user_branch_assignments_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_frozenById_fkey" FOREIGN KEY ("frozenById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_leadDirectionId_fkey" FOREIGN KEY ("leadDirectionId") REFERENCES "lead_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "courses" ADD CONSTRAINT "courses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_prices" ADD CONSTRAINT "course_prices_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_prices" ADD CONSTRAINT "course_prices_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "course_prices" ADD CONSTRAINT "course_prices_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_courseId_fkey" FOREIGN KEY ("courseId") REFERENCES "courses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "groups" ADD CONSTRAINT "groups_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_schedule_items" ADD CONSTRAINT "group_schedule_items_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_leftReasonDetailId_fkey" FOREIGN KEY ("leftReasonDetailId") REFERENCES "archive_reasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_memberships" ADD CONSTRAINT "group_memberships_transferredToId_fkey" FOREIGN KEY ("transferredToId") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendances" ADD CONSTRAINT "attendances_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_exemptions" ADD CONSTRAINT "attendance_exemptions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_exemptions" ADD CONSTRAINT "attendance_exemptions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grades" ADD CONSTRAINT "grades_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_cancellations" ADD CONSTRAINT "lesson_cancellations_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_cancellations" ADD CONSTRAINT "lesson_cancellations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_absences" ADD CONSTRAINT "teacher_absences_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_absences" ADD CONSTRAINT "teacher_absences_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_absences" ADD CONSTRAINT "teacher_absences_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_attendances" ADD CONSTRAINT "teacher_attendances_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_attendances" ADD CONSTRAINT "teacher_attendances_recordedById_fkey" FOREIGN KEY ("recordedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_payments" ADD CONSTRAINT "student_payments_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_payments" ADD CONSTRAINT "student_payments_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_payments" ADD CONSTRAINT "student_payments_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_payments" ADD CONSTRAINT "student_payments_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "group_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "student_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_transactions" ADD CONSTRAINT "payment_transactions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_deposits" ADD CONSTRAINT "student_deposits_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_transactions" ADD CONSTRAINT "deposit_transactions_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_transactions" ADD CONSTRAINT "deposit_transactions_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_transactions" ADD CONSTRAINT "deposit_transactions_depositId_fkey" FOREIGN KEY ("depositId") REFERENCES "student_deposits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_transactions" ADD CONSTRAINT "deposit_transactions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "deposit_transactions" ADD CONSTRAINT "deposit_transactions_expenseApprovalId_fkey" FOREIGN KEY ("expenseApprovalId") REFERENCES "expense_approvals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "discounts" ADD CONSTRAINT "discounts_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_fees" ADD CONSTRAINT "group_fees_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_fees" ADD CONSTRAINT "group_fees_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "group_fees" ADD CONSTRAINT "group_fees_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_write_offs" ADD CONSTRAINT "debt_write_offs_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_write_offs" ADD CONSTRAINT "debt_write_offs_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_write_offs" ADD CONSTRAINT "debt_write_offs_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "group_memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_write_offs" ADD CONSTRAINT "debt_write_offs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_write_off_breakdown" ADD CONSTRAINT "debt_write_off_breakdown_writeOffId_fkey" FOREIGN KEY ("writeOffId") REFERENCES "debt_write_offs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_write_off_breakdown" ADD CONSTRAINT "debt_write_off_breakdown_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "student_payments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_freezes" ADD CONSTRAINT "student_freezes_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_freezes" ADD CONSTRAINT "student_freezes_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_freezes" ADD CONSTRAINT "student_freezes_endedById_fkey" FOREIGN KEY ("endedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_categories" ADD CONSTRAINT "expense_categories_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "expense_categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_expenseApprovalId_fkey" FOREIGN KEY ("expenseApprovalId") REFERENCES "expense_approvals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_approvals" ADD CONSTRAINT "expense_approvals_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_approvals" ADD CONSTRAINT "expense_approvals_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_approvals" ADD CONSTRAINT "expense_approvals_decidedById_fkey" FOREIGN KEY ("decidedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_compensations" ADD CONSTRAINT "teacher_compensations_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_compensations" ADD CONSTRAINT "teacher_compensations_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_compensations" ADD CONSTRAINT "teacher_compensations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_compensations" ADD CONSTRAINT "teacher_compensations_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_group_periods" ADD CONSTRAINT "teacher_group_periods_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_group_periods" ADD CONSTRAINT "teacher_group_periods_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_group_periods" ADD CONSTRAINT "teacher_group_periods_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_group_periods" ADD CONSTRAINT "teacher_group_periods_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_salaries" ADD CONSTRAINT "teacher_salaries_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_salaries" ADD CONSTRAINT "teacher_salaries_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_salaries" ADD CONSTRAINT "teacher_salaries_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_salaries" ADD CONSTRAINT "teacher_salaries_compensationId_fkey" FOREIGN KEY ("compensationId") REFERENCES "teacher_compensations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_salaries" ADD CONSTRAINT "teacher_salaries_lockedById_fkey" FOREIGN KEY ("lockedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_salaries" ADD CONSTRAINT "teacher_salaries_approvalId_fkey" FOREIGN KEY ("approvalId") REFERENCES "expense_approvals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teacher_salaries" ADD CONSTRAINT "teacher_salaries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_transactions" ADD CONSTRAINT "salary_transactions_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_transactions" ADD CONSTRAINT "salary_transactions_salaryId_fkey" FOREIGN KEY ("salaryId") REFERENCES "teacher_salaries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_transactions" ADD CONSTRAINT "salary_transactions_teacherId_fkey" FOREIGN KEY ("teacherId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_transactions" ADD CONSTRAINT "salary_transactions_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_transactions" ADD CONSTRAINT "salary_transactions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_transactions" ADD CONSTRAINT "salary_transactions_expenseApprovalId_fkey" FOREIGN KEY ("expenseApprovalId") REFERENCES "expense_approvals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_compensations" ADD CONSTRAINT "staff_compensations_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_compensations" ADD CONSTRAINT "staff_compensations_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_compensations" ADD CONSTRAINT "staff_compensations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_compensations" ADD CONSTRAINT "staff_compensations_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_rules" ADD CONSTRAINT "kpi_rules_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_rules" ADD CONSTRAINT "kpi_rules_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kpi_rules" ADD CONSTRAINT "kpi_rules_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_kpi_assignments" ADD CONSTRAINT "staff_kpi_assignments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_kpi_assignments" ADD CONSTRAINT "staff_kpi_assignments_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "kpi_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_kpi_assignments" ADD CONSTRAINT "staff_kpi_assignments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_payrolls" ADD CONSTRAINT "staff_payrolls_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_payrolls" ADD CONSTRAINT "staff_payrolls_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_payrolls" ADD CONSTRAINT "staff_payrolls_finalizedById_fkey" FOREIGN KEY ("finalizedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_payroll_items" ADD CONSTRAINT "staff_payroll_items_payrollId_fkey" FOREIGN KEY ("payrollId") REFERENCES "staff_payrolls"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_payroll_items" ADD CONSTRAINT "staff_payroll_items_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_payroll_items" ADD CONSTRAINT "staff_payroll_items_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "kpi_rules"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_payroll_adjustments" ADD CONSTRAINT "staff_payroll_adjustments_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_payroll_adjustments" ADD CONSTRAINT "staff_payroll_adjustments_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_payroll_adjustments" ADD CONSTRAINT "staff_payroll_adjustments_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_salary_transactions" ADD CONSTRAINT "staff_salary_transactions_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_salary_transactions" ADD CONSTRAINT "staff_salary_transactions_payrollId_fkey" FOREIGN KEY ("payrollId") REFERENCES "staff_payrolls"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_salary_transactions" ADD CONSTRAINT "staff_salary_transactions_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_salary_transactions" ADD CONSTRAINT "staff_salary_transactions_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "staff_salary_transactions" ADD CONSTRAINT "staff_salary_transactions_expenseApprovalId_fkey" FOREIGN KEY ("expenseApprovalId") REFERENCES "expense_approvals"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_audit_logs" ADD CONSTRAINT "payroll_audit_logs_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payroll_audit_logs" ADD CONSTRAINT "payroll_audit_logs_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_counterpartyBranchId_fkey" FOREIGN KEY ("counterpartyBranchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_counterpartyBranchId_fkey" FOREIGN KEY ("counterpartyBranchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "journal_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_openedById_fkey" FOREIGN KEY ("openedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_closedById_fkey" FOREIGN KEY ("closedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_fromBranchId_fkey" FOREIGN KEY ("fromBranchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_toBranchId_fkey" FOREIGN KEY ("toBranchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_sentById_fkey" FOREIGN KEY ("sentById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_transfers" ADD CONSTRAINT "cash_transfers_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_balances" ADD CONSTRAINT "opening_balances_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_balances" ADD CONSTRAINT "opening_balances_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_balances" ADD CONSTRAINT "opening_balances_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_balances" ADD CONSTRAINT "opening_balances_importJobId_fkey" FOREIGN KEY ("importJobId") REFERENCES "import_jobs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "opening_balances" ADD CONSTRAINT "opening_balances_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "lead_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_directionId_fkey" FOREIGN KEY ("directionId") REFERENCES "lead_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_rejectionReasonId_fkey" FOREIGN KEY ("rejectionReasonId") REFERENCES "lead_options"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_assignedToId_fkey" FOREIGN KEY ("assignedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_creditedToId_fkey" FOREIGN KEY ("creditedToId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_convertedById_fkey" FOREIGN KEY ("convertedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leads" ADD CONSTRAINT "leads_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_options" ADD CONSTRAINT "lead_options_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_routing_rules" ADD CONSTRAINT "lead_routing_rules_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lead_routing_rules" ADD CONSTRAINT "lead_routing_rules_assigneeId_fkey" FOREIGN KEY ("assigneeId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "notification_templates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_relatedFeedbackId_fkey" FOREIGN KEY ("relatedFeedbackId") REFERENCES "feedbacks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_recipients" ADD CONSTRAINT "notification_recipients_notificationId_fkey" FOREIGN KEY ("notificationId") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notification_recipients" ADD CONSTRAINT "notification_recipients_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_typeId_fkey" FOREIGN KEY ("typeId") REFERENCES "feedback_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_repliedById_fkey" FOREIGN KEY ("repliedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feedbacks" ADD CONSTRAINT "feedbacks_resolvedById_fkey" FOREIGN KEY ("resolvedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignments" ADD CONSTRAINT "assignments_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "stored_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_recipients" ADD CONSTRAINT "assignment_recipients_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_recipients" ADD CONSTRAINT "assignment_recipients_studentId_fkey" FOREIGN KEY ("studentId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assignment_recipients" ADD CONSTRAINT "assignment_recipients_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bot_users" ADD CONSTRAINT "bot_users_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archive_reasons" ADD CONSTRAINT "archive_reasons_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archive_logs" ADD CONSTRAINT "archive_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archive_logs" ADD CONSTRAINT "archive_logs_reasonId_fkey" FOREIGN KEY ("reasonId") REFERENCES "archive_reasons"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "archive_logs" ADD CONSTRAINT "archive_logs_performedById_fkey" FOREIGN KEY ("performedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_configs" ADD CONSTRAINT "ai_configs_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_configs" ADD CONSTRAINT "ai_configs_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insights" ADD CONSTRAINT "insights_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "insights" ADD CONSTRAINT "insights_acknowledgedById_fkey" FOREIGN KEY ("acknowledgedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_rankings" ADD CONSTRAINT "ai_rankings_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_reports" ADD CONSTRAINT "ai_reports_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_runs" ADD CONSTRAINT "ai_runs_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ai_usage_logs" ADD CONSTRAINT "ai_usage_logs_branchId_fkey" FOREIGN KEY ("branchId") REFERENCES "branches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RolePermissions" ADD CONSTRAINT "_RolePermissions_A_fkey" FOREIGN KEY ("A") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RolePermissions" ADD CONSTRAINT "_RolePermissions_B_fkey" FOREIGN KEY ("B") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_GroupTeachers" ADD CONSTRAINT "_GroupTeachers_A_fkey" FOREIGN KEY ("A") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_GroupTeachers" ADD CONSTRAINT "_GroupTeachers_B_fkey" FOREIGN KEY ("B") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_NotificationAudienceGroups" ADD CONSTRAINT "_NotificationAudienceGroups_A_fkey" FOREIGN KEY ("A") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_NotificationAudienceGroups" ADD CONSTRAINT "_NotificationAudienceGroups_B_fkey" FOREIGN KEY ("B") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_NotificationAudienceUsers" ADD CONSTRAINT "_NotificationAudienceUsers_A_fkey" FOREIGN KEY ("A") REFERENCES "notifications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_NotificationAudienceUsers" ADD CONSTRAINT "_NotificationAudienceUsers_B_fkey" FOREIGN KEY ("B") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AssignmentGroups" ADD CONSTRAINT "_AssignmentGroups_A_fkey" FOREIGN KEY ("A") REFERENCES "assignments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_AssignmentGroups" ADD CONSTRAINT "_AssignmentGroups_B_fkey" FOREIGN KEY ("B") REFERENCES "groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
