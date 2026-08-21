/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MAOSH AUDIT JURNALI — amal turlari va yorliqlari.
 *
 * `server/src/constants/payrollAudit.js` dan node orqali O'QIB
 * generatsiya qilindi (qo'lda emas — bitta harf xatosi audit yozuvini
 * jimgina nomsiz qoldirardi).
 *
 * `test/constants-parity.test.mjs` ikkala tomonni har yurishda solishtiradi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const PAYROLL_AUDIT_ACTIONS = Object.freeze({
  "GENERATED": "payroll.generated",
  "RECALCULATED": "payroll.recalculated",
  "LOCKED": "payroll.locked",
  "UNLOCKED": "payroll.unlocked",
  "PAID": "payroll.paid",
  "PAYMENT_REVERSED": "payroll.payment_reversed",
  "BONUS_ADDED": "bonus.added",
  "BONUS_REMOVED": "bonus.removed",
  "PENALTY_ADDED": "penalty.added",
  "PENALTY_REMOVED": "penalty.removed",
  "SALARY_CHANGED": "salary.changed",
  "ACTIVATION_CHANGED": "payroll.activation_changed",
  "EMPLOYMENT_DATE_CHANGED": "hr.employment_date_changed",
  "IMPORTED": "payroll.imported",
  "BLOCKED": "payroll.blocked"
} as const);

export const PAYROLL_AUDIT_ACTION_LABELS: Readonly<Record<string, string>> =
  Object.freeze({
  "payroll.generated": "Maosh yaratildi",
  "payroll.recalculated": "Maosh qayta hisoblandi",
  "payroll.locked": "Maosh qulflandi",
  "payroll.unlocked": "Qulf ochildi",
  "payroll.paid": "Maosh to'landi",
  "payroll.payment_reversed": "To'lov bekor qilindi",
  "bonus.added": "Bonus qo'shildi",
  "bonus.removed": "Bonus o'chirildi",
  "penalty.added": "Jarima qo'shildi",
  "penalty.removed": "Jarima o'chirildi",
  "salary.changed": "Maosh shartnomasi o'zgardi",
  "payroll.activation_changed": "Maosh boshlanish sanasi o'zgardi",
  "hr.employment_date_changed": "Ishga olingan sana o'zgardi",
  "payroll.imported": "Maosh import qilindi",
  "payroll.blocked": "Amal rad etildi (o'zgarmas davr)"
});
