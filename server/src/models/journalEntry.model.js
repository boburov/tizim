import mongoose from "mongoose";
import { ALL_ENTRY_KINDS } from "../constants/ledger.js";

// JURNAL YOZUVI - pul harakatining YAGONA haqiqati.
//
// ── NEGA QATORLAR ICHKARIDA (embedded), ALOHIDA KOLLEKSIYA EMAS ──
//
// Qo'sh yozuvning butun ma'nosi INVARIANTDA: har bir yozuvda
// SUM(debet) === SUM(kredit). Agar qatorlar alohida kolleksiyada tursa,
// yozuv yozilib qatorlar yozilmasdan jarayon uzilishi mumkin edi - va
// jurnal jimgina nomuvozanat holatga tushardi.
//
// Bu kodbazada ishonchli ko'p-hujjatli tranzaksiya YO'Q (qarang:
// branches.service.js dagi izoh - runFinanceTxn standalone MongoDB'da
// atomiklikni yo'qotadi). Qatorlarni ichkariga joylashtirish bu
// muammoni BUTUNLAY yo'q qiladi: bitta hujjat yozuvi - atomik.
//
// NARXI: hisob bo'yicha qoldiq $unwind talab qiladi. Bu qabul qilinadi -
// yozuvlar soni oyiga minglar tartibida va `lines.accountId` indekslangan.
//
// ── O'ZGARMASLIK ──
// Yozuv yozilgach TAHRIRLANMAYDI. Xato bo'lsa - STORNO (teskari yozuv).
// Sabab oddiy: tahrirlangan jurnal audit uchun yaroqsiz, "kecha hisobot
// boshqacha edi" degan savolga javob bo'lmaydi.

const journalLineSchema = new mongoose.Schema(
  {
    accountId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Account",
      required: true,
    },
    // Hisobning turi - qoldiq hisoblashda $lookup qilmaslik uchun
    // denormalizatsiya qilinadi (ishora NORMAL_SIDE ga bog'liq).
    accountKind: { type: String, required: true },

    debit: { type: Number, default: 0, min: 0 },
    credit: { type: Number, default: 0, min: 0 },
  },
  { _id: false },
);

const journalEntrySchema = new mongoose.Schema(
  {
    // Yozuv DOIM bitta filialga tegishli. Filiallararo o'tkazma IKKI
    // yozuv bilan ifodalanadi (har filialda bittadan) - shunda har
    // bir filialning jurnali o'zicha muvozanatda qoladi.
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
      index: true,
    },

    date: { type: Date, required: true, index: true },
    kind: { type: String, enum: ALL_ENTRY_KINDS, required: true, index: true },
    memo: { type: String, trim: true, default: "" },

    // Manba hujjat (PaymentTransaction, Expense, CashTransfer...).
    // Jurnaldan operatsion tafsilotga qaytish uchun.
    refModel: { type: String, default: null },
    refId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },

    // ── ELIMINATION BAYROG'I ──
    //
    // true = ICHKI harakat (filiallararo o'tkazma, inkassatsiya).
    // Konsolidatsiyalangan (tarmoq) hisobotda bunday yozuvlar CHIQARIB
    // TASHLANADI - aks holda bir xil pul ikki marta sanalardi: bir marta
    // A filialning chiqimi, ikkinchi marta B filialning kirimi sifatida.
    //
    // FILIAL hisobotida esa ular KO'RINADI - filial uchun bu haqiqiy
    // pul harakati. Bitta bayroq, ikki xil ko'rinish.
    isInternal: { type: Boolean, default: false, index: true },

    // Ichki harakatda qarshi filial - elimination juftini topish uchun.
    counterpartyBranchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
    },

    lines: {
      type: [journalLineSchema],
      required: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length >= 2,
        message: "Yozuvda kamida ikkita qator bo'lishi kerak",
      },
    },

    // Denormalizatsiya: muvozanat tekshiruvini $unwind'siz yugurtirish
    // uchun (tunggi reconciliation job millionlab qatorni ochmasin).
    totalDebit: { type: Number, required: true, min: 0 },
    totalCredit: { type: Number, required: true, min: 0 },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

// Filial + sana bo'yicha hisobot - eng ko'p uchraydigan so'rov.
journalEntrySchema.index({ branchId: 1, date: -1 });
// Hisob bo'yicha qoldiq.
journalEntrySchema.index({ "lines.accountId": 1 });

// ── ASOSIY INVARIANT ──
//
// SUM(debet) === SUM(kredit). Bu buzilsa jurnal MA'NOSINI YO'QOTADI:
// qoldiqlar hech qachon tenglashmaydi va xatoni topib bo'lmaydi.
//
// Tekshiruv MODEL darajasida - servis qatlami yetarli emas, chunki
// seed, migratsiya va testlar undan chetlab o'tadi.
journalEntrySchema.pre("validate", function validateBalance(next) {
  const lines = this.lines || [];

  let debit = 0;
  let credit = 0;
  for (const line of lines) {
    const d = Number(line.debit) || 0;
    const c = Number(line.credit) || 0;

    // BITTA QATOR - BITTA TOMON. Ikkalasi ham to'ldirilsa, qator
    // "yarim debet yarim kredit" bo'lib, o'qishda chalkashlik tug'dirardi
    // va storno yozuvini tuzib bo'lmasdi.
    if (d > 0 && c > 0) {
      return next(new Error("Bitta qatorda debet va kredit birga bo'lmaydi"));
    }
    if (d === 0 && c === 0) {
      return next(new Error("Bo'sh qator (debet ham, kredit ham nol)"));
    }
    debit += d;
    credit += c;
  }

  // Butun so'mda ishlaymiz - kasr yo'q, shuning uchun qat'iy tenglik.
  if (debit !== credit) {
    return next(
      new Error(
        `Jurnal muvozanati buzilgan: debet ${debit} ≠ kredit ${credit}`,
      ),
    );
  }
  if (debit === 0) {
    return next(new Error("Nol summali yozuv yozib bo'lmaydi"));
  }

  this.totalDebit = debit;
  this.totalCredit = credit;
  return next();
});

// O'ZGARMASLIK: yozilgan yozuv tahrirlanmaydi (storno bilan tuzatiladi).
journalEntrySchema.pre("save", function preventEdit(next) {
  if (!this.isNew && this.isModified()) {
    return next(
      new Error("Jurnal yozuvi o'zgarmas - tuzatish uchun storno yozuvi kiriting"),
    );
  }
  return next();
});

const JournalEntry = mongoose.model("JournalEntry", journalEntrySchema);

export default JournalEntry;
