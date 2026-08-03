import mongoose from "mongoose";

/**
 * Bitta o'quvchining bitta vazifa bo'yicha holati.
 *
 *   pending    - hali yuborilmagan (navbatda)
 *   delivered  - botga yetkazildi
 *   blocked    - o'quvchi botni BLOKLAGAN (yoki hisobini o'chirgan)
 *   no_bot     - botga umuman kirmagan (Telegram hisobi bog'lanmagan)
 *   failed     - boshqa xato (Telegram tomonidan rad etildi)
 *
 * "blocked" va "no_bot" ATAYLAB ajratilgan: birinchisida o'quvchi bir marta
 * botni ochgan-u keyin bloklagan (uni qaytarish uchun undan iltimos qilish
 * kerak), ikkinchisida esa u botni umuman ko'rmagan (unga havola berish
 * kerak). O'qituvchi uchun bu ikki holatning yechimi butunlay boshqacha.
 */
export const DELIVERY_STATUSES = [
  "pending",
  "delivered",
  "blocked",
  "no_bot",
  "failed",
];

const assignmentRecipientSchema = new mongoose.Schema(
  {
    assignment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Assignment",
      required: true,
      index: true,
    },
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      default: null,
    },
    status: {
      type: String,
      enum: DELIVERY_STATUSES,
      default: "pending",
      index: true,
    },
    deliveredAt: { type: Date, default: null },
    failedReason: { type: String, default: "" },
    // Platforma ichida (bot emas) ko'rilgan vaqti. Botni bloklagan o'quvchi
    // vazifani shu yerda ko'radi - shuning uchun in-app ko'rish ham kerak.
    readAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Bir o'quvchiga bir vazifa uchun faqat bitta yozuv.
assignmentRecipientSchema.index({ assignment: 1, student: 1 }, { unique: true });
assignmentRecipientSchema.index({ student: 1, createdAt: -1 });

assignmentRecipientSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const AssignmentRecipient = mongoose.model(
  "AssignmentRecipient",
  assignmentRecipientSchema,
);

export default AssignmentRecipient;
