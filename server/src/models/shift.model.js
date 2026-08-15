import mongoose from "mongoose";

export const SHIFT_STATUSES = Object.freeze({
  OPEN: "open",
  CLOSED: "closed",
});

// KASSA SMENASI - kassir ish kunining boshi va oxiri.
//
// NEGA KERAK: naqd pul yagona "yo'qolishi mumkin" bo'lgan aktiv. Terminal
// va Click summasi bank tomonidan tasdiqlanadi, naqd esa faqat SANOQ
// bilan. Smena yopilmasa "qancha bo'lishi kerak edi" degan savolga
// solishtiradigan nuqta bo'lmaydi va kamomad oylab sezilmay qoladi.
//
// ── KUTILGAN SUMMA QAYDAN ──
// Jurnal hisoblaydi: smena OCHILGANDAN yopilgunga qadar naqd hisobiga
// tushgan debet minus kredit. Qo'lda kiritilmaydi - aks holda "kutilgan"
// ni ham kassirning o'zi yozib, tekshiruv ma'nosini yo'qotardi.
const shiftSchema = new mongoose.Schema(
  {
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
      index: true,
    },

    cashierId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    openedAt: { type: Date, required: true },
    openedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    closedAt: { type: Date, default: null },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },

    // Smena boshidagi naqd qoldiq (o'tgan smenadan qolgan).
    openingCash: { type: Number, default: 0, min: 0 },

    // JURNAL bo'yicha bo'lishi kerak bo'lgan summa (hisoblanadi).
    expectedCash: { type: Number, default: null },
    // Kassir SANAB kiritgan summa.
    countedCash: { type: Number, default: null },
    // countedCash − expectedCash. Manfiy = KAMOMAD, musbat = ORTIQCHA.
    variance: { type: Number, default: null },

    // Farq uchun izoh - kassir tushuntirishi.
    varianceNote: { type: String, trim: true, default: "" },

    status: {
      type: String,
      enum: Object.values(SHIFT_STATUSES),
      default: SHIFT_STATUSES.OPEN,
      index: true,
    },
  },
  { timestamps: true },
);

// BITTA FILIALDA BITTA KASSIRNING BITTA OCHIQ SMENASI.
//
// Ikkita ochiq smena bo'lsa, to'lov qaysi biriga tegishli ekani noaniq
// bo'lardi va kutilgan summa ikkalasida ham noto'g'ri chiqardi.
shiftSchema.index(
  { branchId: 1, cashierId: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: { status: SHIFT_STATUSES.OPEN },
  },
);

shiftSchema.index({ branchId: 1, openedAt: -1 });

const Shift = mongoose.model("Shift", shiftSchema);

export default Shift;
