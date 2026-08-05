import mongoose from "mongoose";
import softDeletePlugin from "./plugins/softDelete.plugin.js";

/**
 * XODIM x KPI QOIDASI biriktiruvi.
 *
 * Qoida xodimga IKKI yo'l bilan tegishli bo'ladi:
 *   1) roli bo'yicha  - KpiRule.applicableRoles ichida uning roli bo'lsa;
 *   2) shaxsan        - shu hujjat orqali.
 *
 * Hujjat ayni paytda ISTISNO vazifasini ham bajaradi: `enabled: false`
 * bo'lsa, rol bo'yicha tegishli qoida shu xodim uchun O'CHADI. Shuning
 * uchun "hamma resepshinga, Alidan tashqari" degan holat qoidani
 * ko'chirmasdan hal bo'ladi.
 *
 * rewardValueOverride - shaxsiy stavka (masalan tajribali xodimga
 * konversiya uchun 70 000, qolganlarga 50 000). null = qoidanikini oladi.
 */
const staffKpiAssignmentSchema = new mongoose.Schema(
  {
    employee: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    rule: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "KpiRule",
      required: true,
      index: true,
    },

    enabled: { type: Boolean, default: true },
    rewardValueOverride: { type: Number, default: null, min: 0 },

    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true },
);

// Bitta xodimga bitta qoida bir marta biriktiriladi.
staffKpiAssignmentSchema.index(
  { employee: 1, rule: 1 },
  { unique: true, partialFilterExpression: { isDeleted: false } },
);

staffKpiAssignmentSchema.plugin(softDeletePlugin);

const StaffKpiAssignment = mongoose.model(
  "StaffKpiAssignment",
  staffKpiAssignmentSchema,
);

export default StaffKpiAssignment;
