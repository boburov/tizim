import mongoose from "mongoose";
import softDeletePlugin from "./plugins/softDelete.plugin.js";

// UMUMIY CHIQIM (ijara, kommunal, ta'mir, reklama, jihoz, soliq...).
//
// NEGA KERAK EDI: ilgari tizimda YAGONA chiqim - o'qituvchi maoshi edi
// (SalaryTransaction). Ya'ni "sof foyda" = tushum − maosh deb hisoblanardi,
// bu esa strukturaviy ravishda noto'g'ri: ijara, kommunal va ta'mir hisobga
// umuman kirmasdi. Bu model o'sha teshikni yopadi.
//
// MAOSH BU YERGA YOZILMAYDI: u SalaryTransaction'da qoladi (unga maosh
// qatoriga bog'lanish, tasdiq va clawback mantiqi kerak). Hisobot ikkalasini
// QO'SHIB ko'rsatadi - qarang financeReport.service.js.

export const EXPENSE_METHODS = ["cash", "card", "bank", "transfer"];
export const EXPENSE_CURRENCIES = ["UZS", "USD"];

const expenseSchema = new mongoose.Schema(
  {
    // FILIAL: null = MARKAZ UMUMIY chiqimi (bosh ofis ijarasi, brend reklamasi).
    //
    // NEGA null RUXSAT ETILGAN: har chiqimni zo'rlab bitta filialga yozish
    // hisobotni YOLG'ON qiladi - markaz darajasidagi reklama xarajatini
    // tasodifiy tanlangan filial "yeb" qo'yardi va o'sha filial foydasi
    // sun'iy past ko'rinardi. Taqsimlash allocation orqali OSHKORA bo'ladi.
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
      index: true,
    },
    // Markaz umumiy chiqimini filiallarga qanday bo'lish (hisobot uchun):
    //   none     - bo'linmaydi, "Umumiy" qatorida alohida turadi (standart)
    //   revenue  - filiallarning oylik tushumi ulushi bo'yicha
    //   students - faol o'quvchilar soni bo'yicha
    //   equal    - teng
    // Taqsimlash HISOBOT PAYTIDA hisoblanadi - hujjatda saqlanmaydi, chunki
    // tushum ulushi keyin o'zgaradi va saqlangan qiymat eskirardi.
    allocation: {
      type: String,
      enum: ["none", "revenue", "students", "equal"],
      default: "none",
    },

    category: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ExpenseCategory",
      required: true,
      index: true,
    },
    // Kategoriya nomi/turi SNAPSHOT - kategoriya keyin o'chsa/nomi o'zgarsa
    // ham eski hisobot buzilmaydi (GroupMembership.leftReasonTitle naqshi).
    categoryName: { type: String, default: "" },
    categoryKind: { type: String, default: "operating" },

    title: { type: String, trim: true, required: true },
    description: { type: String, trim: true, default: "" },

    // ─── PUL ───
    // amount HAR DOIM BAZA VALYUTASIDA (UZS, butun son). Barcha hisobotlar
    // faqat shu maydonni qo'shadi - konvertatsiya hisobot paytida QILINMAYDI.
    amount: { type: Number, required: true, min: 1 },
    currency: { type: String, enum: EXPENSE_CURRENCIES, default: "UZS" },
    // Valyuta UZS bo'lmasa: asl summa va o'sha KUNDAGI kurs saqlanadi.
    //
    // NEGA KURS SAQLANADI: "100$ ta'mirga sarfladim" bugun 1 250 000 so'm,
    // bir yildan keyin 1 400 000. Agar biz faqat 100$ ni saqlab, hisobotda
    // joriy kurs bilan ko'paytirsak - O'TGAN OYNING chiqimi har kuni
    // o'zgarib turardi. Kurs sarflangan PAYTDA muzlatiladi.
    originalAmount: { type: Number, default: null, min: 0 },
    exchangeRate: { type: Number, default: null, min: 0 },
    rateSource: { type: String, trim: true, default: "" },

    // ─── SANALAR ───
    // spentAt - pul KASSADAN CHIQQAN kun (kassa hisoboti shunga tayanadi).
    spentAt: { type: Date, required: true, index: true },
    // accrualYear/Month - chiqim QAYSI DAVRGA tegishli.
    //
    // NEGA AJRATILGAN: avgust ijarasini iyul oxirida to'lash odatiy hol.
    // Kassa bo'yicha bu iyul chiqimi, lekin FOYDA hisobida avgustga tegishli.
    // Ikkalasini bitta maydon bilan ifodalab bo'lmaydi.
    accrualYear: { type: Number, required: true, index: true },
    accrualMonth: { type: Number, required: true, min: 1, max: 12 },

    method: { type: String, enum: EXPENSE_METHODS, default: "cash" },
    vendor: { type: String, trim: true, default: "" },
    // Chek/hisob-faktura fayli (StoredFile).
    receipt: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StoredFile",
      default: null,
    },

    // ─── KAPITAL CHIQIM (asosiy vosita) ───
    // 100$ lik ta'mir - chiqimmi yoki aktivmi? Javob SUMMAGA bog'liq:
    // kichik summa darhol chiqim (materiallik prinsipi), katta summa esa
    // aktiv sifatida kapitallashtiriladi va foydali muddat bo'ylab
    // amortizatsiya qilinadi. Chegara - Branch/sozlamada, qaror OWNERDA.
    isCapital: { type: Boolean, default: false, index: true },
    // Necha oyga taqsimlanadi (isCapital=true bo'lganda). null/0 → darhol.
    depreciationMonths: { type: Number, default: null, min: 0 },

    // Tasdiqdan o'tgan bo'lsa - qaysi so'rovdan (aynan bir marta kafolati).
    expenseApprovalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Approval",
      default: null,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

// Kassa hisoboti (kunlik chiqim grafigi)
expenseSchema.index({ spentAt: 1, isDeleted: 1 });
// Davr (accrual) hisoboti
expenseSchema.index({ accrualYear: 1, accrualMonth: 1, category: 1 });
// Filial bo'yicha ro'yxat
expenseSchema.index({ branchId: 1, spentAt: -1 });

// AYNAN BIR MARTA: bitta tasdiqdan faqat BITTA chiqim yozuvi.
// salaryTransaction.expenseApprovalId dagi naqshning aynan o'zi.
expenseSchema.index(
  { expenseApprovalId: 1 },
  {
    unique: true,
    partialFilterExpression: { expenseApprovalId: { $type: "objectId" } },
  },
);

// Valyuta UZS bo'lmasa kurs MAJBURIY - aks holda amount qanday chiqqani
// noma'lum qolardi va audit qilib bo'lmasdi.
expenseSchema.pre("validate", function (next) {
  if (this.currency && this.currency !== "UZS") {
    if (!this.exchangeRate || this.exchangeRate <= 0) {
      return next(new Error("Chet el valyutasida chiqim uchun kurs ko'rsatilishi shart"));
    }
    if (!this.originalAmount || this.originalAmount <= 0) {
      return next(new Error("Asl summa (valyutada) ko'rsatilishi shart"));
    }
  }
  if (this.isCapital && !this.depreciationMonths) {
    return next(
      new Error("Kapital chiqim uchun amortizatsiya muddati (oy) ko'rsatilishi shart"),
    );
  }
  next();
});

expenseSchema.plugin(softDeletePlugin);

const Expense = mongoose.model("Expense", expenseSchema);

export default Expense;
