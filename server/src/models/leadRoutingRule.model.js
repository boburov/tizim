import mongoose from "mongoose";

// LID YO'NALTIRISH QOIDASI.
//
// ══════════════════════════════════════════════════════════════════
// MUAMMO
// ══════════════════════════════════════════════════════════════════
// Lid Telegram botdan, Instagram'dan yoki saytdan keladi. Hozir u
// `branchId` bilan yaratiladi, lekin BU QIYMAT QAYERDAN kelishi
// hech qayerda hal qilinmagan - amalda operator qo'lda tanlaydi yoki
// aktiv filial ishlatiladi. Natijada Chilonzordagi odam Yunusobod
// admini ro'yxatiga tushib, hech kim javob bermay qoladi.
//
// ══════════════════════════════════════════════════════════════════
// NEGA GEO EMAS, MANBA XARITASI
// ══════════════════════════════════════════════════════════════════
// "Eng yaqin filialga yo'naltirish" jozibali, lekin u lidning
// KOORDINATASINI talab qiladi - Telegram va Instagram uni bermaydi.
// Bo'lmagan ma'lumotga tayangan qoida hech qachon ishlamaydi.
//
// Amalda esa har filialning O'Z Telegram boti va O'Z Instagram
// akkaunti bo'ladi. Ya'ni MANBA allaqachon filialni bildiradi va
// bu 90% holatni aniq yopadi. Geo masofa keyin, koordinata paydo
// bo'lganda qo'shiladi.
//
// ══════════════════════════════════════════════════════════════════
// ZAXIRA NAVBAT MAJBURIY
// ══════════════════════════════════════════════════════════════════
// Hech bir qoidaga tushmagan lid YO'QOLMASLIGI kerak. Shuning uchun
// `isFallback` qoidasi bor: u manbaga qaramaydi va oxirgi bo'lib
// qo'llanadi. Zaxirasiz tizimda "qoidaga tushmadi" degan lid
// jimgina hech qaysi ro'yxatga chiqmasdan qolardi.

const leadRoutingRuleSchema = new mongoose.Schema(
  {
    // Qaysi filialga yo'naltiriladi.
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
      index: true,
    },

    // MANBA kaliti - `Lead.source` (LeadOption) yoki erkin matn
    // ("telegram_chilonzor", "instagram_main").
    //
    // null + isFallback=true = zaxira qoida.
    sourceKey: { type: String, trim: true, lowercase: true, default: null },

    // ZAXIRA: manbaga qaramaydi, oxirgi bo'lib qo'llanadi.
    isFallback: { type: Boolean, default: false },

    // Lid kimga biriktiriladi. null = filialga tushadi, lekin aniq
    // xodimga emas (filial admini ro'yxatdan o'zi oladi).
    assigneeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    // Bir manbaga bir nechta qoida bo'lsa - kichik raqam ustun.
    priority: { type: Number, default: 100 },

    isActive: { type: Boolean, default: true, index: true },
    note: { type: String, trim: true, default: "" },
  },
  { timestamps: true },
);

// Bir manba uchun bir filialda bitta qoida.
leadRoutingRuleSchema.index(
  { sourceKey: 1, branchId: 1 },
  { unique: true, partialFilterExpression: { sourceKey: { $type: "string" } } },
);

// FAQAT BITTA ZAXIRA QOIDA.
//
// Ikkitasi bo'lsa "qoidaga tushmagan lid qayerga ketadi" savoli
// noaniq bo'lardi va tanlov tasodifiy bo'lib qolardi.
leadRoutingRuleSchema.index(
  { isFallback: 1 },
  { unique: true, partialFilterExpression: { isFallback: true, isActive: true } },
);

leadRoutingRuleSchema.pre("validate", function validateShape(next) {
  if (!this.isFallback && !this.sourceKey) {
    return next(new Error("Qoida uchun manba kerak (yoki uni zaxira qiling)"));
  }
  if (this.isFallback && this.sourceKey) {
    return next(new Error("Zaxira qoidada manba bo'lmaydi - u hammaga qo'llanadi"));
  }
  return next();
});

const LeadRoutingRule = mongoose.model("LeadRoutingRule", leadRoutingRuleSchema);

export default LeadRoutingRule;
