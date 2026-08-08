import mongoose from "mongoose";

/**
 * XODIM OYLIK MAOSH QATORI (xodim x yil x oy).
 *
 * Yakuniy summa:
 *   finalAmount = fixedAmount + autoKpiTotal + manualBonusTotal - penaltyTotal
 *
 * Uch summa ALOHIDA saqlanadi (bitta "jami" emas): egasi har so'm qayerdan
 * kelganini ko'rishi kerak, va qayta hisoblashda faqat avtomatik qism
 * o'zgaradi - qo'lda kiritilgan bonus/jarima tegilmaydi.
 *
 * softDelete plugin ATAYLAB YO'Q - TeacherSalary'da ham yo'q, va
 * cascadeDelete u yerda `isDeleted` yozmoqchi bo'lib jimgina ishlamay
 * qolgan. Bu yerda qator o'chirilmaydi: xodim arxivlansa maosh tarixi
 * qoladi (hisobot buzilmasin).
 */
export const STAFF_PAYROLL_STATUSES = ["unpaid", "partial", "paid"];

/**
 * QATOR QAYERDAN PAYDO BO'LGAN.
 *
 * Auditor uchun eng birinchi savol: "bu raqamni kim qo'ydi?". Manbani
 * saqlamasak, oylik job yaratgan qator bilan migratsiyada ko'chirilgan
 * qator bir xil ko'rinardi.
 *
 *   auto      - oylik job (jadval bo'yicha)
 *   generated - egasi "Hisoblash" tugmasini bosdi
 *   manual    - qo'lda tuzatilgan/qayta hisoblangan
 *   imported  - fayldan yuklangan
 *   migrated  - boshqa tizimdan ko'chirilgan
 */
export const PAYROLL_SOURCES = [
  "auto",
  "generated",
  "manual",
  "imported",
  "migrated",
];

export const PAYROLL_SOURCE_LABELS = {
  auto: "Avtomatik",
  generated: "Qo'lda yaratilgan",
  manual: "Qo'lda tuzatilgan",
  imported: "Import",
  migrated: "Ko'chirilgan",
};

const staffPayrollSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
      index: true,
    },
    year: { type: Number, required: true },
    month: { type: Number, required: true, min: 1, max: 12 },

    // --- Shartnoma snapshot'i (hisob qanday chiqqanini tushuntiradi) ---
    salaryType: { type: String, default: "fixed" },
    baseAmount: { type: Number, default: 0 },
    // Ishga kirgan/bo'shagan oyda to'liq oylik berilmaydi.
    prorationFactor: { type: Number, default: 1 },
    payableDays: { type: Number, default: 0 },
    totalDays: { type: Number, default: 0 },

    // --- Hisoblangan qismlar ---
    fixedAmount: { type: Number, default: 0 },
    autoKpiTotal: { type: Number, default: 0 },
    manualBonusTotal: { type: Number, default: 0 },
    penaltyTotal: { type: Number, default: 0 },

    // --- BOSHLANG'ICH QOLDIQ (tizim ishga tushishidagi eski hisob-kitob) ---
    //
    // JARIMADAN FARQI: jarima oylikdan katta bo'lsa ortiqchasi YO'QOLADI
    // (yuqoridagi qoida - ataylab). Boshlang'ich qarzda bunday qilib
    // bo'lmaydi: u HAQIQIY pul va uni yo'qotish balansni buzadi.
    // Shuning uchun bu yerda uch raqam alohida turadi va ushlab
    // qolinmagan qismi keyingi oyga KO'CHIRILADI.
    openingCreditTotal: { type: Number, default: 0 }, // biz qarzmiz → qo'shiladi
    openingDebtTotal: { type: Number, default: 0 }, // xodim qarz → ayriladi
    // Shu oyda HAQIQATDA ushlab qolingan qism. Ko'chirish aynan shundan
    // hisoblanadi: qoldiq = openingDebtTotal - openingDebtApplied.
    openingDebtApplied: { type: Number, default: 0 },

    // Manfiy chiqmaydi: jarima oylikdan katta bo'lsa 0 (qarz keyingi oyga
    // ko'chirilmaydi - bu ataylab, aks holda to'lov mantig'i murakkablashadi
    // va xodim "manfiy maosh" bilan qolardi).
    finalAmount: { type: Number, default: 0 },

    // --- To'lov keshi ---
    paidAmount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: STAFF_PAYROLL_STATUSES,
      default: "unpaid",
      index: true,
    },

    computedAt: { type: Date, default: null },

    source: { type: String, enum: PAYROLL_SOURCES, default: "auto", index: true },

    /**
     * MAOSH SNAPSHOT'I - hisob KUNIDAGI holat.
     *
     * Maosh qatori HECH QACHON joriy shartnomaga tayanmasligi kerak:
     * mart oyida stavka oshirilsa, yanvar qatorini ochgan odam yanvarda
     * amal qilgan stavkani ko'rishi shart. Aks holda "bu raqam qanday
     * chiqqan?" degan savolga javob yo'qoladi va tarix qayta yozilgandek
     * ko'rinadi.
     *
     * Ichida: shartnoma (tur, summa, sana), qo'llanilgan KPI qoidalari
     * (nomi, triggeri, stavkasi) va hisob paytidagi kontekst.
     */
    snapshot: { type: mongoose.Schema.Types.Mixed, default: null },

    // OYNI YOPISH.
    //
    // draft     - raqam hali o'zgarishi mumkin (davomat orqadan
    //             belgilanadi, to'lov keyin kiritiladi);
    // finalized - egasi ko'rib qabul qilgan, endi qayta hisoblash uni
    //             O'ZGARTIRMAYDI.
    //
    // NEGA KERAK: KPI kirish ma'lumotlari orqadan tahrirlanadi. Egasi 3-kuni
    // ko'rgan maosh 10-kuni boshqacha bo'lib qolsa - bu ishonchni yo'qotadi.
    // Yopilgan oyni faqat ataylab (force) qayta ochish mumkin.
    lifecycle: {
      type: String,
      enum: ["draft", "finalized"],
      default: "draft",
      index: true,
    },
    finalizedAt: { type: Date, default: null },
    finalizedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

// Bitta xodimga bir oyda bitta qator.
staffPayrollSchema.index({ employee: 1, year: 1, month: 1 }, { unique: true });
staffPayrollSchema.index({ year: 1, month: 1, status: 1 });

const StaffPayroll = mongoose.model("StaffPayroll", staffPayrollSchema);

export default StaffPayroll;
