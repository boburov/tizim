import mongoose from "mongoose";
import softDeletePlugin from "./plugins/softDelete.plugin.js";

// BEKOR QILINGAN DARS - bitta guruhning bitta kunidagi darsi o'tmadi.
//
// NEGA Holiday YETARLI EMAS: Holiday - KALENDAR bayrami, u BARCHA guruhlarga
// ta'sir qiladi. Bu yerdagi holat boshqacha: o'qituvchi kasal bo'ldi, xona
// band, svet o'chdi - FAQAT SHU guruhning FAQAT SHU darsi o'tmadi.
//
// NEGA MOLIYAVIY AHAMIYATI BOR: o'quvchi to'lovi oydagi DARS SONIGA bo'linadi
// (computeLessonSnapshot). Dars o'tmagan bo'lsa-yu, u baribir sanalsa -
// o'quvchi o'tmagan dars uchun to'laydi. Bu eng ko'p shikoyat keltiradigan
// holat va ilgari tizimda uni qayd etish imkoni umuman yo'q edi.

export const CANCELLATION_REASONS = [
  "teacher_absent", // o'qituvchi kelmadi
  "facility", // xona/jihoz/svet muammosi
  "weather", // ob-havo
  "other",
];

const lessonCancellationSchema = new mongoose.Schema(
  {
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: true,
      index: true,
    },
    date: { type: Date, required: true },
    // Davomat bilan bir xil kalit formati (YYYY-MM-DD) - to'g'ridan-to'g'ri
    // solishtirish uchun (Set.has(dateKey)).
    dateKey: {
      type: String,
      required: true,
      match: [/^\d{4}-\d{2}-\d{2}$/, "Sana formati YYYY-MM-DD bo'lishi kerak"],
    },
    // Kunda bir nechta dars bo'lsa - qaysi biri. "" = o'sha kunning hammasi.
    slot: { type: String, default: "" },

    reason: { type: String, enum: CANCELLATION_REASONS, default: "other" },
    note: { type: String, trim: true, default: "" },

    // ─── ENG MUHIM MAYDON ───
    // billable=false → bu dars o'quvchi qarziga KIRMAYDI va o'qituvchining
    //                  soatbay maoshiga ham sanalmaydi.
    // billable=true  → dars KO'CHIRILDI (makeup), ya'ni baribir o'tiladi,
    //                  shuning uchun pul o'zgarmaydi.
    //
    // Standart qiymat `false`: dars o'tmagan bo'lsa, dalil bo'lmasa,
    // o'quvchi foydasiga hal qilinadi.
    billable: { type: Boolean, default: false },
    // Ko'chirilgan sana (billable=true bo'lganda ma'noli).
    makeupDate: { type: Date, default: null },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

// Bir guruh + bir kun + bir slot uchun bitta yozuv.
lessonCancellationSchema.index(
  { group: 1, dateKey: 1, slot: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } },
);
// Oylik hisob uchun (billing oraliq bo'yicha o'qiydi).
lessonCancellationSchema.index({ group: 1, date: 1 });

lessonCancellationSchema.plugin(softDeletePlugin);

const LessonCancellation = mongoose.model(
  "LessonCancellation",
  lessonCancellationSchema,
);

export default LessonCancellation;
