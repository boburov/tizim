import mongoose from "mongoose";

// TASDIQ SO'ROVI: direktor so'raydi, owner tasdiqlaydi. Tasdiqlanmaguncha
// HECH QANDAY holat o'zgarmaydi - so'rov faqat "buyruq jurnali" (command log).
//
// NEGA ALOHIDA KOLLEKSIYA (maqsad modelida "pending" status EMAS):
// TeacherSalary.paidAmount keshlangan summa bo'lib, recalcStatus() uni
// `SUM(amount) WHERE salary=X AND isDeleted != true` bilan qayta hisoblaydi.
// Agar "kutilmoqda" yozuvi o'sha kolleksiyada tursa, u TO'LANGAN deb
// hisoblanardi va 8 ta hisobot aggregation'iga sizib kirardi (financeReport
// 4 ta, deposit 4 ta - ularning hammasi faqat isDeleted bo'yicha filtrlaydi).
// AYNAN SHU sabab konfiguratsiya tasdiqlariga ham taalluqli: tasdiqlanmagan
// TeacherGroupPeriod hujjati yaratilsa, u maosh hisobiga darhol kirib ketardi.
// Shuning uchun so'rov ma'lumoti FAQAT `payload` ichida yashaydi.
//
// KOLLEKSIYA NOMI ATAYLAB "expenseapprovals" bo'lib qoldi: model chiqimdan
// umumiy tasdiqqa kengaytirilganda ma'lumot ko'chirish (migration) qilmaslik
// uchun. Model nomi - Approval, jismoniy kolleksiya - eski nomida.

export const APPROVAL_STATUSES = Object.freeze({
  PENDING: "pending",
  APPROVED: "approved", // tasdiqlandi, lekin hali bajarilmadi
  EXECUTED: "executed", // bajarildi - tranzaksiya/hujjat yaratildi
  REJECTED: "rejected",
  CANCELED: "canceled", // so'rovchi o'zi bekor qildi
  FAILED: "failed", // tasdiqlandi, lekin bajarishda xato (masalan balans yetmadi)
});

export const ALL_APPROVAL_STATUSES = Object.values(APPROVAL_STATUSES);

// KATEGORIYA: "pul chiqdi" va "sozlama o'zgardi" bir xil hayot siklida,
// lekin BOSHQA huquq bilan tasdiqlanadi va BOSHQA hisobotlarga tushadi.
//
// DIQQAT: moliya hisobotlari/summalari FAQAT `financial` bilan ishlashi shart.
// Aks holda summasiz konfiguratsiya so'rovlari "kutilayotgan chiqim" summasiga
// qo'shilib ketardi - yuqoridagi leakage darsining aynan takrori.
export const APPROVAL_CATEGORIES = Object.freeze({
  FINANCIAL: "financial", // pul hisobdan chiqadi
  CONFIGURATION: "configuration", // sozlama/siyosat o'zgaradi (takrorlanuvchi ta'sir)
});

export const ALL_APPROVAL_CATEGORIES = Object.values(APPROVAL_CATEGORIES);

// Tasdiq turlari. Har biri o'z payload'i va bajaruvchi funksiyasiga ega.
export const APPROVAL_KINDS = Object.freeze({
  SALARY_PAYMENT: "salary_payment", // o'qituvchiga maosh (financial)
  DEPOSIT_WITHDRAW: "deposit_withdraw", // o'quvchi depozitidan naqd yechish (financial)
  SALARY_TERMS: "salary_terms", // o'qituvchi maosh stavkasi (configuration)
  DISCOUNT_SET: "discount_set", // o'quvchi chegirmasi (configuration)
  // Guruh oylik narxi. Chegirma bilan BIR XIL iqtisodiy ta'sirga ega:
  // narxni 1 mln dan 400 ming ga tushirish barcha o'quvchiga chegirma
  // berish bilan bir xil. Shuning uchun u ham tasdiqdan o'tadi - aks holda
  // chegirma yopilib, yonidagi eshik ochiq qolardi.
  GROUP_FEE_SET: "group_fee_set", // (configuration)
  STAFF_HIRE: "staff_hire", // ishga olish (configuration)
});

export const ALL_APPROVAL_KINDS = Object.values(APPROVAL_KINDS);

// Tur -> kategoriya. Yangi tur qo'shilganda SHU YERGA ham yozilishi shart -
// aks holda `resolveCategory` xato beradi (jimgina financial'ga tushmaydi).
export const KIND_CATEGORY = Object.freeze({
  [APPROVAL_KINDS.SALARY_PAYMENT]: APPROVAL_CATEGORIES.FINANCIAL,
  [APPROVAL_KINDS.DEPOSIT_WITHDRAW]: APPROVAL_CATEGORIES.FINANCIAL,
  [APPROVAL_KINDS.SALARY_TERMS]: APPROVAL_CATEGORIES.CONFIGURATION,
  [APPROVAL_KINDS.DISCOUNT_SET]: APPROVAL_CATEGORIES.CONFIGURATION,
  [APPROVAL_KINDS.GROUP_FEE_SET]: APPROVAL_CATEGORIES.CONFIGURATION,
  [APPROVAL_KINDS.STAFF_HIRE]: APPROVAL_CATEGORIES.CONFIGURATION,
});

export const resolveCategory = (kind) => {
  const category = KIND_CATEGORY[kind];
  if (!category) throw new Error(`Noma'lum tasdiq turi: ${kind}`);
  return category;
};

// Eski nom bilan moslik (chiqim servislari shu nomni import qiladi).
export const EXPENSE_KINDS = APPROVAL_KINDS;
export const ALL_EXPENSE_KINDS = ALL_APPROVAL_KINDS;

const approvalSchema = new mongoose.Schema(
  {
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
      index: true,
    },

    kind: { type: String, enum: ALL_APPROVAL_KINDS, required: true, index: true },

    category: {
      type: String,
      enum: ALL_APPROVAL_CATEGORIES,
      // Eski yozuvlarning hammasi chiqim edi - migration'siz to'g'ri qiymat.
      default: APPROVAL_CATEGORIES.FINANCIAL,
      required: true,
      index: true,
    },

    // Chiqim summasi - limit bilan solishtiriladigan qiymat.
    // KONFIGURATSIYA so'rovlarida null: maosh stavkasi yoki chegirma
    // TAKRORLANUVCHI, uni bir martalik limitga solishtirish ma'nosiz.
    amount: { type: Number, default: null, min: 0 },

    // So'rov paytidagi limit (snapshot). Owner keyin limitni o'zgartirsa ham
    // tarixda "qaysi limit sababli tasdiq so'ralgani" ko'rinib turadi.
    thresholdAtRequest: { type: Number, default: null },

    // BAJARISH UCHUN KERAKLI MA'LUMOT.
    // Erkin obyekt: har `kind` o'z maydonlarini saqlaydi.
    //   salary_payment    -> { salaryId, method, paidAt, note }
    //   deposit_withdraw  -> { studentId, method, paidAt, note }
    //   salary_terms      -> { op: "create"|"update", group, teacher, periodId,
    //                          startDate, endDate, salaryType, fixedAmount, percentRate }
    //   discount_set      -> { op: "create"|"update", discountId, student, group,
    //                          type, value, scope, year, month, reason }
    //   group_fee_set     -> { groupId, year, month, amount, previousAmount }
    //   staff_hire        -> { role, firstName, lastName, username, phone,
    //                          password, homeBranchId, ... }
    //
    // DIQQAT: bu payload'ga KO'R-KO'RONA ISHONILMAYDI. Tasdiqlash paytida
    // barcha biznes qoidalari QAYTA tekshiriladi (maosh qoldig'i, depozit
    // balansi, guruh arxivlanmaganligi) - chunki so'rov va tasdiq orasida
    // holat o'zgargan bo'lishi mumkin.
    payload: { type: mongoose.Schema.Types.Mixed, default: {} },

    // SUBYEKT QULFI: bitta obyekt uchun bir vaqtda faqat BITTA kutilayotgan
    // so'rov bo'lishi mumkin (pastdagi partial unique indeks). Aks holda
    // ikki direktor bir o'qituvchiga ikki xil stavka so'rab, owner ikkalasini
    // tasdiqlasa - oxirgisi jimgina yutar edi (lost update).
    //
    // Moliya so'rovlarida ATAYLAB o'rnatilmaydi (undefined) - bir o'qituvchiga
    // ketma-ket ikki to'lov so'rovi mumkin. Indeks $type: "string" bo'yicha
    // filtrlanadi, shuning uchun maydonsiz hujjatlar indeksga tushmaydi.
    subjectKey: { type: String, default: undefined },

    // Ko'rsatish uchun snapshot (nomlar keyin o'zgarsa ham tarix buzilmasin)
    subjectName: { type: String, default: "" }, // o'qituvchi/o'quvchi ismi
    contextName: { type: String, default: "" }, // guruh nomi yoki izoh

    status: {
      type: String,
      enum: ALL_APPROVAL_STATUSES,
      default: APPROVAL_STATUSES.PENDING,
      required: true,
      index: true,
    },

    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    requestNote: { type: String, trim: true, default: "" },

    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    decidedAt: { type: Date, default: null },
    decisionNote: { type: String, trim: true, default: "" },

    // Bajarilgandan keyin yaratilgan tranzaksiya/hujjat (audit izi)
    resultTransactionId: { type: mongoose.Schema.Types.ObjectId, default: null },
    executedAt: { type: Date, default: null },
    failureReason: { type: String, default: "" },
  },
  { timestamps: true },
);

// Kategoriya turdan HOSILA - chaqiruvchi uni qo'lda yuborishi shart emas
// va noto'g'ri yuborsa ham model o'zi tuzatadi (yagona haqiqat manbai).
approvalSchema.pre("validate", function (next) {
  if (this.kind) {
    try {
      this.category = resolveCategory(this.kind);
    } catch (err) {
      return next(err);
    }
  }
  // Chiqim so'rovida summa MAJBURIY: limit tekshiruvining butun ma'nosi shu.
  if (this.category === APPROVAL_CATEGORIES.FINANCIAL) {
    if (this.amount === null || this.amount === undefined || this.amount < 1) {
      return next(new Error("Chiqim so'rovida summa ko'rsatilishi shart"));
    }
  }
  next();
});

// Ro'yxat: filial + holat bo'yicha, yangilari birinchi
approvalSchema.index({ branchId: 1, status: 1, createdAt: -1 });
// "Mening so'rovlarim"
approvalSchema.index({ requestedBy: 1, createdAt: -1 });
// Kategoriya bo'yicha ro'yxat (owner inbox'i ikkiga bo'linadi)
approvalSchema.index({ category: 1, status: 1, createdAt: -1 });

// SUBYEKT QULFI: bitta subyektga bitta kutilayotgan so'rov.
// $type: "string" - subjectKey yo'q (moliya) hujjatlarni indeksdan chiqaradi,
// shuning uchun ular bir-biriga to'sqinlik qilmaydi.
approvalSchema.index(
  { subjectKey: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: APPROVAL_STATUSES.PENDING,
      subjectKey: { $type: "string" },
    },
  },
);

// 3-argument: jismoniy kolleksiya nomi o'zgarmaydi (migration yo'q).
const Approval = mongoose.model("Approval", approvalSchema, "expenseapprovals");

export default Approval;
