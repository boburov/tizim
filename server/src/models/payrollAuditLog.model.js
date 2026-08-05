import mongoose from "mongoose";

/**
 * MAOSH AUDIT JURNALI - moliyaviy o'zgarishlarning to'liq izi.
 *
 * NEGA ALOHIDA KOLLEKSIYA (mavjud ActivityLog yetmaydi):
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

const payrollAuditLogSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    // Qaysi oyga tegishli (shartnoma/HR o'zgarishlarida bo'sh bo'lishi mumkin).
    year: { type: Number, default: null },
    month: { type: Number, default: null, min: 1, max: 12 },

    action: { type: String, required: true, index: true },

    // Qaysi hujjatga tegishli: "staffPayroll" | "teacherSalary" |
    // "adjustment" | "compensation" | "user"
    targetType: { type: String, default: "" },
    targetId: { type: mongoose.Schema.Types.ObjectId, default: null },

    // ESKI va YANGI qiymat - erkin obyekt. Summalar, sanalar, holatlar.
    // Audit uchun eng muhimi shu ikkisi: "nima edi -> nima bo'ldi".
    oldValue: { type: mongoose.Schema.Types.Mixed, default: null },
    newValue: { type: mongoose.Schema.Types.Mixed, default: null },

    // Sabab. Muhim amallarda (qulf ochish, aktivatsiya sanasini
    // o'zgartirish) MAJBURIY - servis qatlami talab qiladi.
    reason: { type: String, trim: true, default: "", maxlength: 500 },

    // Kim. Job ichida bajarilsa null bo'ladi - shuning uchun `actorLabel`
    // ham saqlanadi ("Tizim").
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    actorLabel: { type: String, default: "" },

    // Qo'shimcha kontekst (masalan nechta oy yaratildi, qaysi qoida).
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// Xodim taymlayni - eng issiq so'rov.
payrollAuditLogSchema.index({ employee: 1, createdAt: -1 });
// Oy bo'yicha tafsilot (maosh kartasidagi "shu oy tarixi").
payrollAuditLogSchema.index({ employee: 1, year: 1, month: 1, createdAt: -1 });

// DIQQAT: softDelete plugin ATAYLAB YO'Q va o'chirish metodi ham yo'q.
// Audit yozuvi o'chirilmaydi - aks holda uning ma'nosi qolmaydi.
const PayrollAuditLog = mongoose.model("PayrollAuditLog", payrollAuditLogSchema);

export default PayrollAuditLog;
