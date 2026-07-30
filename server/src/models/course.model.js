import mongoose from "mongoose";

// KURS (yo'nalish) katalogi: "IELTS", "CEFR", "Umumiy ingliz tili", ...
//
// NEGA FILIALSIZ: kurs - taksonomiya, moliyaviy hujjat emas. "IELTS" har
// filialda bir xil narsani anglatadi va katalogni filial bo'yicha nusxalash
// hisobotni buzardi ("A filial IELTS" va "B filial IELTS" alohida qator
// bo'lib chiqardi). Filial ko'lami GURUH orqali keladi: Group.branchId bor,
// shuning uchun "shu filialda qaysi kurs foydali" savoli baribir to'g'ri
// hisoblanadi - guruhlar filtrlanadi, katalog emas.
// Xuddi shu naqsh: ArchiveReason va LeadOption ham filialsiz.
//
// NEGA LeadOption(kind:"direction") YETARLI EMAS: u faqat LID uchun - qaysi
// yo'nalishga qiziqqan. Guruh unga bog'lanmagan, shuning uchun "qaysi kurs
// foydali" hisoblanmasdi. Course - o'quv tomonidagi haqiqiy o'lcham.
// Migratsiya mavjud direction'lardan Course yaratadi va ikkalasini bog'laydi.
const courseSchema = new mongoose.Schema(
  {
    title: { type: String, trim: true, required: true },

    // Barqaror mashina o'qiydigan kalit ("ielts", "cefr"). Hisobot va AI
    // qoidalarida nom o'zgarsa ham buzilmasligi uchun.
    code: {
      type: String,
      trim: true,
      lowercase: true,
      required: true,
      unique: true,
      match: [/^[a-z0-9_-]+$/, "Kod faqat lotin harfi, raqam, - va _ dan iborat"],
    },

    // Ixtiyoriy daraja belgisi ("A2", "B1", "6.5+"). Faqat ko'rsatish uchun.
    level: { type: String, trim: true, default: "" },

    // Yangi guruh yaratilganda taklif qilinadigan davomiylik (oy).
    defaultDurationMonths: { type: Number, default: null, min: 0 },

    // Lid yo'nalishi bilan bog'lash: konversiya voronkasini o'quv tomoniga
    // ulash uchun ("IELTS ga qiziqqan lidlarning nechtasi IELTS guruhiga
    // yozildi"). Ixtiyoriy - har bir kursning lid yo'nalishi bo'lmasligi mumkin.
    leadDirection: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LeadOption",
      default: null,
      index: true,
    },

    isActive: { type: Boolean, default: true, index: true },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

courseSchema.index({ isActive: 1, title: 1 });

courseSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const Course = mongoose.model("Course", courseSchema);

export default Course;
