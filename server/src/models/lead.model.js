import mongoose from "mongoose";
import { LEAD_STATUSES } from "../constants/leadStatus.js";

const statusHistorySchema = new mongoose.Schema(
  {
    status: { type: String, enum: LEAD_STATUSES, required: true },
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { _id: false },
);

const leadSchema = new mongoose.Schema(
  {
    // FILIAL: lid qaysi filialga kelgan.
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
      index: true,
    },
    firstName: { type: String, trim: true, required: true },
    lastName: { type: String, trim: true, default: "" },
    age: { type: Number, default: null },
    phone: { type: String, trim: true, required: true },
    parentPhone: { type: String, trim: true, default: null },

    source: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LeadOption",
      default: null,
    },
    direction: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LeadOption",
      default: null,
    },

    status: { type: String, enum: LEAD_STATUSES, default: "new" },
    rejectionReason: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "LeadOption",
      default: null,
    },

    // YOPISH IZOHI - lid rad etilganda MAJBURIY (validatorda).
    //
    // NEGA ALOHIDA MAYDON, `notes` YETARLI EMAS:
    // `notes` lid hayoti davomida to'ldiriladi ("onasi qo'ng'iroq qildi",
    // "sinov darsiga keladi"). Yopishda uni majburiy qilsak, eski yozuv
    // shartni qanoatlantirib qo'yardi va haqiqiy sabab YOZILMASDI.
    //
    // NEGA MAJBURIY: `rejectionReason` (LeadOption) ro'yxatdan tanlanadi va
    // amalda ko'pincha "Boshqa" bo'lib qoladi - undan tahlil chiqmaydi.
    // Haqiqiy sabab ("uydan uzoq ekan", "400 mingga rozi edi", "Prestige
    // markazga yozilibdi") faqat erkin matnda bo'ladi. Aynan shu matn
    // "nega markazga kelmayapti?" savoliga javob beradigan yagona manba.
    rejectionNote: { type: String, trim: true, default: "", maxlength: 1000 },

    // Lid YOPILGAN payt (rad etilgan). Statusdan qaytarilsa tozalanadi.
    // statusHistory'dan ham topsa bo'ladi, lekin bu maydon voronka
    // hisobotini $lookup'siz filtrlash imkonini beradi.
    closedAt: { type: Date, default: null, index: true },

    trialDate: { type: Date, default: null },
    notes: { type: String, default: "" },

    // Qayta bog'lanish eslatmasi - vaqti kelganda tizim bildirishnomasi chiqadi
    followUpAt: { type: Date, default: null },
    followUpNote: { type: String, default: "" },
    followUpNotifiedAt: { type: Date, default: null },

    // Konversiyada bog'lanadigan o'quvchi
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    statusHistory: { type: [statusHistorySchema], default: [] },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

leadSchema.index({ status: 1, createdAt: -1 });
leadSchema.index({ source: 1 });
leadSchema.index({ direction: 1 });
leadSchema.index({ followUpAt: 1, followUpNotifiedAt: 1 });

leadSchema.set("toJSON", {
  transform: (_doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

const Lead = mongoose.model("Lead", leadSchema);

export default Lead;
