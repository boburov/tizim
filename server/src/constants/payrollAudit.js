/**
 * MAOSH AUDIT JURNALI - amal turlari va ularning yorliqlari.
 *
 * NEGA `models/payrollAuditLog.model.js` DAN KO'CHIRILDI: bu qiymatlar
 * BAZAGA bog'liq emas, ular domen lug'ati. Mongoose model fayllari
 * migratsiya oxirida o'chiriladi, konstantalar esa qolishi kerak -
 * aks holda model o'chirilgan kuni audit yozuvlari nomsiz qolardi.
 *
 * Jadval tuzilmasi endi `prisma/schema.prisma` da: model PayrollAuditLog.
 *
 * NEGA ALOHIDA JADVAL (mavjud ActivityLog yetmaydi):
 *   • ActivityLog HTTP darajasida ishlaydi (method + path + body) va
 *     DOMEN ma'nosini bilmaydi - "qaysi oy, qancha edi, qancha bo'ldi"
 *     degan savolga javob bera olmaydi;
 *   • u faqat POST/PATCH/PUT/DELETE ni yozadi, ya'ni job ichida yoki
 *     servis qatlamida sodir bo'lgan hisob-kitob unga tushmaydi;
 *   • u foydalanuvchi qattiq o'chirilganda birga o'chadi
 *     (userRelations.helper.js), moliyaviy iz esa QOLISHI kerak.
 *
 * QOIDA: hech narsa jimgina o'zgarmaydi. Har yozuvda kim, qachon,
 * nima edi, nima bo'ldi va (muhim amallarda) NEGA - hammasi bor.
 */
export const PAYROLL_AUDIT_ACTIONS = Object.freeze({
  GENERATED: "payroll.generated",
  RECALCULATED: "payroll.recalculated",
  LOCKED: "payroll.locked",
  UNLOCKED: "payroll.unlocked",
  PAID: "payroll.paid",
  PAYMENT_REVERSED: "payroll.payment_reversed",
  BONUS_ADDED: "bonus.added",
  BONUS_REMOVED: "bonus.removed",
  PENALTY_ADDED: "penalty.added",
  PENALTY_REMOVED: "penalty.removed",
  SALARY_CHANGED: "salary.changed",
  ACTIVATION_CHANGED: "payroll.activation_changed",
  EMPLOYMENT_DATE_CHANGED: "hr.employment_date_changed",
  IMPORTED: "payroll.imported",
  BLOCKED: "payroll.blocked",
});

export const PAYROLL_AUDIT_ACTION_LABELS = Object.freeze({
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
  "payroll.blocked": "Amal rad etildi (o'zgarmas davr)",
});
