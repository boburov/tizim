import mongoose from "mongoose";
import softDeletePlugin from "./plugins/softDelete.plugin.js";

// KURS NARXI - filial bo'yicha narx matritsasi.
//
// MUAMMO: hozir narx faqat GroupFee'da, ya'ni HAR BIR GURUHGA QO'LDA
// kiritiladi. 20 guruhli filialda narx ko'tarilsa - 20 marta qo'lda
// o'zgartirish, va bittasi unutilsa jimgina eski narxda qolib ketadi.
//
// YECHIM: narx KURS darajasida belgilanadi, guruh esa undan meros oladi.
//
//   branchId = null  -> BAZAVIY narx (butun tarmoq uchun)
//   branchId = <id>  -> shu FILIAL uchun istisno
//
// NEGA FILIAL ISTISNOSI KERAK: Toshkentdagi ijara Namangandagidan bir
// necha barobar qimmat - bir xil narx qo'yish birinchisini zarar,
// ikkinchisini bozordan tashqari qilib qo'yardi.
//
// ── YECHIM TARTIBI (eng kuchlidan) ──
//   1. GroupFee              - guruhga QO'LDA qo'yilgan narx
//   2. CoursePrice(kurs, filial) - filial istisnosi
//   3. CoursePrice(kurs, null)   - bazaviy narx
//   4. (narx yo'q)           - guruh narxsiz, qo'lda kiritish kerak
//
// ── DAVR (validFrom / validTo) ──
// Narx TARIXI saqlanadi: o'tgan oylarni qayta hisoblaganda O'SHA PAYTDAGI
// narx ishlatilishi kerak. Yangi narx qo'yilganda eskisi o'chirilmaydi -
// uning `validTo` si yopiladi.
//
// DIQQAT: bu MEROS manbai, hisob-kitob emas. O'quvchi guruhga
// yozilganda narx SNAPSHOT qilinadi (GroupMembership.priceSnapshot) -
// aks holda kelasi oy narx ko'tarilsa, o'tgan oylarning qarzi ham
// qayta hisoblanib ketardi.
const coursePriceSchema = new mongoose.Schema(
  {
    courseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Course",
      required: true,
      index: true,
    },

    // null = BAZAVIY narx (barcha filiallar uchun).
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
      index: true,
    },

    // Oylik to'lov (so'm).
    amount: { type: Number, required: true, min: 0 },

    // Amal qilish davri. validTo = null -> hozir amalda.
    validFrom: { type: Date, required: true },
    validTo: { type: Date, default: null },

    note: { type: String, trim: true, default: "" },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

// AMALDAGI narxni tez topish uchun: kurs + filial + ochiq davr.
coursePriceSchema.index({ courseId: 1, branchId: 1, validTo: 1 });

// BIR VAQTDA BITTA OCHIQ NARX.
//
// Ikkita ochiq davr bo'lsa, "hozirgi narx qaysi" savoli noaniq bo'lardi
// va resolver tasodifiy birini tanlab, hisobot beqaror bo'lib qolardi.
//
// DIQQAT - partial indeks `branchId` NULL bo'lganda ham ishlashi kerak.
// MongoDB'da null qiymat indeksga KIRADI, shuning uchun bazaviy narx ham
// shu qoida ostida (kurs uchun bitta ochiq bazaviy narx).
coursePriceSchema.index(
  { courseId: 1, branchId: 1 },
  {
    unique: true,
    partialFilterExpression: { validTo: null, isDeleted: false },
  },
);

coursePriceSchema.plugin(softDeletePlugin);

const CoursePrice = mongoose.model("CoursePrice", coursePriceSchema);

export default CoursePrice;
