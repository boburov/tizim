/**
 * XODIM OYLIGI (staff payroll) — domen lug'ati.
 *
 * ⚠ `server/src/constants/staffPayroll.js` DAN AYNAN KO'CHIRILGAN.
 *
 * QIYMATLAR `prisma/schema.prisma` DAGI ENUMLAR BILAN AYNAN BIR XIL
 * BO'LISHI SHART. Yangi qiymat qo'shish avval Prisma enumini
 * o'zgartirishni talab qiladi — aks holda validator qabul qilgan
 * qiymatni baza rad etadi.
 *   STAFF_SALARY_TYPES     ↔ enum StaffSalaryType
 *   KPI_TRIGGERS           ↔ enum KpiTrigger
 *   KPI_REWARD_TYPES       ↔ enum KpiRewardType
 *   STAFF_ADJUSTMENT_KINDS ↔ enum StaffAdjustmentKind
 *   PAYROLL_SOURCES        ↔ enum PayrollSource
 *   STAFF_PAYROLL_STATUSES ↔ enum PayStatus
 */

// ─── Xodim maosh shartnomasi ───
export const STAFF_SALARY_TYPES = ['fixed', 'fixed_plus_kpi', 'kpi_only'] as const;

export const STAFF_SALARY_TYPE_LABELS = Object.freeze({
  fixed: "Qat'iy oylik",
  fixed_plus_kpi: 'Oylik + KPI',
  kpi_only: 'Faqat KPI',
});

// ─── KPI qoidalari ───
export const KPI_TRIGGERS = [
  'lead_created',
  'lead_converted',
  'student_first_payment',
  'student_retained',
  'payments_collected',
  'employee_attendance',
] as const;

export const KPI_REWARD_TYPES = ['fixed', 'per_unit', 'percent'] as const;

// ─── Oylik tuzatishlari ───
export const STAFF_ADJUSTMENT_KINDS = [
  'bonus',
  'penalty',
  'opening_credit',
  'opening_debt',
] as const;

/**
 * Boshlang'ich qoldiqdan kelib chiqqan turlar. Ular QO'LDA
 * kiritilmaydi — faqat `openingBalance` materializatsiyasi yozadi va
 * aynan shu ikkitasida qisman unique indeks bor:
 * `(employeeId, year, month, kind)`.
 */
export const STAFF_OPENING_KINDS: string[] = ['opening_credit', 'opening_debt'];

// ─── Oylik yozuvi ───
export const STAFF_PAYROLL_STATUSES = ['unpaid', 'partial', 'paid'] as const;

export const PAYROLL_SOURCES = [
  'auto',
  'generated',
  'manual',
  'imported',
  'migrated',
] as const;

export const PAYROLL_SOURCE_LABELS = Object.freeze({
  auto: 'Avtomatik',
  generated: "Qo'lda yaratilgan",
  manual: "Qo'lda tuzatilgan",
  imported: 'Import',
  migrated: "Ko'chirilgan",
});
