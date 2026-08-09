import mongoose from "mongoose";

/**
 * BOSHLANG'ICH BALANS - tizim ishga tushishidan OLDINGI pul holati.
 *
 * NEGA ALOHIDA KOLLEKSIYA (o'quvchi/o'qituvchi hujjatidagi maydon emas):
 *
 *  1) YOZILADI-YU O'ZGARMAYDI. Talab shu: "bu bir marta kiritiladi va uni
 *     hechkim o'zgartira olmaydi". `user` bo'yicha UNIQUE indeks buni
 *     MA'LUMOTLAR BAZASI darajasida kafolatlaydi - servis qatlamidagi
 *     tekshiruvni chetlab o'tib bo'ladi, indeksni esa yo'q.
 *
 *  2) IKKINCHI HAQIQAT EMAS. Bu hujjat balansni SAQLAMAYDI, faqat "nima
 *     e'lon qilingan edi" faktini yozadi. Haqiqiy balans mavjud
 *     mexanizmda turadi (StudentDeposit / StudentPayment / TeacherSalary /
 *     StaffPayrollAdjustment) - shuning uchun to'lov qabul qilinganda
 *     qarz O'ZIDAN kamayadi, ikkinchi joyni yangilash kerak emas.
 *     `materializedRefs` - qaysi hujjatlarga aylangani (audit izi).
 *
 *  3) IMPORT IDEMPOTENTLIGI. Fayl ikki marta yuklansa, ikkinchi urinish
 *     E11000 bilan rad etiladi va PUL IKKI MARTA YOZILMAYDI. Aynan shu
 *     kafolat uchun softDelete plagini ATAYLAB QO'YILMAGAN: o'chirilgan
 *     yozuv ham indeksda qolishi va qayta kiritishni bloklashi kerak.
 *
 * ISHORA QOIDASI - "SHAXS NUQTAI NAZARIDAN" (signConvention: "party"):
 *   +X = MARKAZ shu shaxsga X qarzdor
 *   -X = SHAXS markazga X qarzdor
 *
 *   O'quvchi   +300k → markaz unga qarzdor (avans) → depozitga tushadi
 *   O'quvchi   -300k → u markazga qarz             → qo'shimcha qarz qatori
 *   O'qituvchi +300k → markaz unga qarzdor         → to'lanishi kerak
 *   O'qituvchi -300k → u markazga qarz             → oylikdan ushlanadi
 *
 * Qoida BARCHA rollar uchun BIR XIL - shuning uchun "musbat nimani
 * anglatadi?" degan savol rolga qarab o'zgarmaydi va ledger hamma joyda
 * bitta ishora bilan yig'iladi.
 */

export const OPENING_ROLES = ["student", "teacher", "staff"];

/**
 * ISHORA KONVENSIYASI - `amount` maydonining MA'NOSI.
 *
 * NEGA MAYDON KERAK: konvensiya bir marta o'zgargan, ESKI YOZUVLAR esa
 * o'zgarmas (immutable). Yozuvning o'zida qaysi qoida bilan kiritilgani
 * turmasa, eski qatorlar bugungi qoida bilan o'qilib, o'qituvchi/xodim
 * qarzi AVANS bo'lib ko'rinardi - ya'ni ishora teskari.
 *
 *   flow  - ESKI (pul oqimi yo'nalishi: O'quvchi → Markaz → Xodim).
 *           O'qituvchi/xodimda ishora TESKARI: +X = u markazga qarz.
 *   party - YANGI (shaxs nuqtai nazaridan). +X = markaz unga qarzdor.
 *
 * Yangi yozuvlar HAR DOIM "party". `flow` faqat tarixiy yozuvlarda
 * qoladi - o'qish uchun openingBalance.service.js -> partyAmount().
 */
export const OPENING_SIGN_CONVENTIONS = ["flow", "party"];

// Materializatsiya turi - qaysi yo'l bilan mavjud mexanizmga o'tkazilgan.
export const OPENING_KINDS = [
  "student_credit", // DepositTransaction(topup) + autoApply
  "student_debt", // StudentPayment(isOpening)
  "teacher_credit", // TeacherSalary(kind:"base", isOpening) - biz qarzmiz
  "teacher_debt", // TeacherSalary(kind:"deduction", manfiy) - u qarz
  "staff_credit", // StaffPayrollAdjustment(opening_credit)
  "staff_debt", // StaffPayrollAdjustment(opening_debt)
];

// BITTA ODAM UCHUN YUQORI CHEGARA.
//
// Asosiy maqsad - nol xatosidan himoya: operator 300 000 o'rniga
// 300 000 000 yozib yuborsa, bu qator butun qarzdorlik hisobotini
// buzardi va uni ORQAGA QAYTARIB BO'LMAYDI (yozuv o'zgarmas).
// Importer bundan ancha past chegarada (OPENING_WARN_AMOUNT)
// ogohlantirish ham beradi - qarang: importers/openingBalance.helper.js
export const OPENING_MAX_AMOUNT = 500_000_000;

const openingBalanceSchema = new mongoose.Schema(
  {
    // O'ZGARMASLIK LANGARI. unique - partial EMAS, ya'ni istisnosiz.
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      immutable: true,
    },
    role: { type: String, enum: OPENING_ROLES, required: true, immutable: true },

    // ISHORALI summa. Ma'nosi `signConvention` ga bog'liq (yuqoriga qarang).
    // Nol saqlanmaydi (pre-validate rad etadi) - "boshlang'ich balansi yo'q"
    // holati hujjatning YO'QLIGI bilan ifodalanadi.
    amount: { type: Number, required: true, immutable: true },

    // `amount` qaysi qoida bilan kiritilgan. default "flow" ATAYLAB:
    // maydonsiz eski hujjatlar aynan shu (eski) konvensiyada yozilgan.
    // Yangi yozuvlar servisda ochiq "party" bilan yaratiladi.
    signConvention: {
      type: String,
      enum: OPENING_SIGN_CONVENTIONS,
      default: "flow",
      immutable: true,
    },

    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      default: null,
      index: true,
    },
    // O'quvchining qarzi QAYSI guruhga yoziladi. StudentPayment guruhsiz
    // bo'lolmaydi, shuning uchun student_debt uchun MAJBURIY.
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      default: null,
    },

    // Sintetik qatorlar qaysi davrga yozilgani (hisobotda shu oyda ko'rinadi).
    year: { type: Number, required: true, immutable: true },
    month: { type: Number, required: true, min: 1, max: 12, immutable: true },

    kind: { type: String, enum: OPENING_KINDS, required: true },
    // Qaysi hujjat(lar)ga aylandi - audit izi. Balans manbai EMAS.
    materializedRefs: {
      type: [
        {
          _id: false,
          model: { type: String, required: true },
          docId: { type: mongoose.Schema.Types.ObjectId, required: true },
        },
      ],
      default: [],
    },
    // Materializatsiya yiqilsa hujjat baribir qoladi (qayta urinishni
    // bloklash uchun), lekin bu bayroq bilan belgilanadi va hisobotda
    // "e'tibor bering" ro'yxatiga tushadi.
    materializedAt: { type: Date, default: null },
    materializeError: { type: String, default: "" },

    // KUTISH SABABI - "hali materializatsiya QILINMASLIGI KERAK" holati.
    //
    // materializeError'dan FARQI: bu XATO EMAS. O'quvchi guruhsiz
    // yaratilganda uning boshlang'ich qarzini StudentPayment qatoriga
    // yozib bo'lmaydi (u guruhsiz mavjud emas), lekin qarzning O'ZI
    // haqiqiy va balansda darhol ko'rinishi kerak.
    //
    // Ikkisi bitta maydonga siqilsa, owner panelidagi "e'tibor bering"
    // ro'yxati normal ish oqimidagi o'quvchilar bilan to'lib ketardi va
    // haqiqiy nosozliklar ko'rinmay qolardi.
    //   ""              - kutmayapti (materializatsiya qilingan yoki yiqilgan)
    //   "awaiting_group" - o'quvchi birinchi guruhga qo'shilishini kutmoqda
    pendingReason: {
      type: String,
      enum: ["", "awaiting_group"],
      default: "",
      index: true,
    },

    note: { type: String, trim: true, default: "", maxlength: 500 },
    importJob: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "ImportJob",
      default: null,
      index: true,
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

openingBalanceSchema.pre("validate", function (next) {
  const amt = Number(this.amount);
  if (!Number.isFinite(amt) || !Number.isInteger(amt)) {
    return next(new Error("Boshlang'ich summa butun son bo'lishi kerak"));
  }
  if (amt === 0) {
    return next(new Error("Boshlang'ich summa nol bo'lishi mumkin emas"));
  }
  if (Math.abs(amt) > OPENING_MAX_AMOUNT) {
    return next(
      new Error(
        `Boshlang'ich summa ${OPENING_MAX_AMOUNT.toLocaleString("ru-RU")} so'mdan oshmasligi kerak`,
      ),
    );
  }
  // DIQQAT: "student_debt uchun guruh majburiy" tekshiruvi BU YERDA
  // ATAYLAB YO'Q. O'quvchi guruhga qo'shilishidan OLDIN yaratiladi va
  // uning eski qarzi shu daqiqada ma'lum bo'ladi. Guruh talabi
  // MATERIALIZATSIYA bosqichiga ko'chirilgan (StudentPayment qatori
  // guruhsiz mavjud bo'lolmaydi) - unga qadar yozuv `pendingReason:
  // "awaiting_group"` bilan kutib turadi va balansda baribir ko'rinadi.
  next();
});

// Materializatsiyasi yiqilganlarni topish (owner paneli uchun).
openingBalanceSchema.index({ materializedAt: 1 });

const OpeningBalance = mongoose.model("OpeningBalance", openingBalanceSchema);

export default OpeningBalance;
