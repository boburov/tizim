import mongoose from "mongoose";
import { ALL_ACCOUNT_KINDS, ACCOUNT_KINDS } from "../constants/ledger.js";

// HISOB (account) - filialning pul turadigan yoki hisob yuritiladigan joyi.
//
// Har filialda o'z NAQD, TERMINAL, CLICK, PAYME, BANK hisobi bo'ladi -
// bu "Alohida kassa balanslari" talabining to'g'ridan-to'g'ri javobi.
//
// Hisoblar TALAB BO'YICHA yaratiladi (ledger.service.js dagi
// ensureAccount): oldindan 8 filial × 12 tur = 96 ta bo'sh hisob
// yaratish shovqin bo'lardi va ularning ko'pi hech qachon ishlatilmasdi.
const accountSchema = new mongoose.Schema(
  {
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
      index: true,
    },

    kind: { type: String, enum: ALL_ACCOUNT_KINDS, required: true },

    // FAQAT due_from / due_to uchun: qaysi filial bilan hisob-kitob.
    //
    // NEGA ALOHIDA MAYDON: "A filial B ga qarzdor" va "A filial C ga
    // qarzdor" ALOHIDA hisoblar bo'lishi shart. Bitta umumiy "qarz"
    // hisobida ular qo'shilib ketardi va kim bilan hisob-kitob
    // qilinishi noma'lum bo'lib qolardi.
    counterpartyBranchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
      index: true,
    },

    name: { type: String, trim: true, default: "" },

    // Bitta valyuta (UZS). Maydon KELAJAK uchun - ko'p valyutali markaz
    // paydo bo'lsa, jurnal tuzilmasi o'zgarmasdan kengayadi.
    currency: { type: String, default: "UZS" },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true },
);

// BITTA FILIALDA BITTA TURDAGI BITTA HISOB.
//
// counterpartyBranchId null bo'lgan hollarda ham ishlaydi (oddiy kassa
// hisoblari) - MongoDB null qiymatni indeksga kiritadi.
accountSchema.index(
  { branchId: 1, kind: 1, counterpartyBranchId: 1 },
  { unique: true },
);

// FILIALLARARO hisob counterparty'siz bo'lishi MUMKIN EMAS va aksincha.
//
// Bu tekshiruvsiz "kimga qarzdorligi noma'lum qarz" yozuvi paydo bo'lardi
// va filiallararo balansni tenglashtirib bo'lmasdi.
accountSchema.pre("validate", function validateCounterparty(next) {
  const isInterBranch =
    this.kind === ACCOUNT_KINDS.DUE_FROM || this.kind === ACCOUNT_KINDS.DUE_TO;

  if (isInterBranch && !this.counterpartyBranchId) {
    return next(new Error("Filiallararo hisob uchun qarshi filial ko'rsatilishi shart"));
  }
  if (!isInterBranch && this.counterpartyBranchId) {
    return next(new Error("Bu hisob turida qarshi filial bo'lmaydi"));
  }
  if (isInterBranch && String(this.counterpartyBranchId) === String(this.branchId)) {
    return next(new Error("Filial o'ziga qarzdor bo'la olmaydi"));
  }
  return next();
});

const Account = mongoose.model("Account", accountSchema);

export default Account;
