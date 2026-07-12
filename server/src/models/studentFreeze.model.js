import mongoose from "mongoose";
import softDeletePlugin from "./plugins/softDelete.plugin.js";

// O'quvchini VAQTINCHA muzlatish (freeze) davri. Arxivlashdan farqi: o'quvchi
// guruhda a'zo bo'lib qoladi (isActive=true, memberships ochiq), lekin muzlatish
// oynasida davomat va to'lov hisoblanmaydi.
//   • startDate - muzlatish boshlangan kun (INCLUSIVE).
//   • endDate   - muzlatishdan chiqarilgan kun (EXCLUSIVE). null => hozir muzlatilgan.
// Ya'ni faol muzlatish oynasi [startDate, endDate). endDate kuni o'quvchi yana faol.
const studentFreezeSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    startDate: { type: Date, required: true },
    endDate: { type: Date, default: null },
    reason: { type: String, default: "", trim: true },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    // Muzlatishdan chiqargan owner (unfreeze paytida to'ldiriladi).
    endedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

// Faol (ochiq) muzlatishlarni tez topish uchun.
studentFreezeSchema.index({ student: 1, endDate: 1, isDeleted: 1 });

studentFreezeSchema.pre("validate", function ensureRange(next) {
  if (this.endDate && this.startDate > this.endDate) {
    return next(
      new Error("Muzlatishdan chiqarish sanasi muzlatish sanasidan oldin bo'lmasin"),
    );
  }
  next();
});

studentFreezeSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

studentFreezeSchema.plugin(softDeletePlugin);

const StudentFreeze = mongoose.model("StudentFreeze", studentFreezeSchema);

export default StudentFreeze;
