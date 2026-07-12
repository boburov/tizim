import mongoose from "mongoose";

// Yomon qarz (write-off) hodisasi yozuvi (audit). O'quvchi qarzi bilan guruhdan
// chiqarilganda YARATILADI: o'sha paytdagi faol qarz yopiladi va bu yozuv
// yo'qotishni qayd etadi. Ta'lim markazi bu pulni endi kutmaydi - moliyaviy zarar.
// O'chirilmaydi (softDelete yo'q) - yo'qotish tarixi buzilmasin.
const debtWriteOffSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    group: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Group",
      required: true,
      index: true,
    },
    // Yopilgan a'zolik (qaysi chiqish hodisasiga tegishli).
    membership: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GroupMembership",
      default: null,
    },
    // Jami hisobdan chiqarilgan summa (breakdown yig'indisi).
    amount: { type: Number, required: true, min: 0, default: 0 },
    // Qaysi oy(lar)dagi qarz qancha hisobdan chiqarildi - hisobot ASL OYGA
    // bog'lansin uchun (payment ref bilan). Bir chiqish bir nechta oyni qamrashi mumkin.
    breakdown: [
      {
        _id: false,
        payment: { type: mongoose.Schema.Types.ObjectId, ref: "StudentPayment" },
        year: { type: Number, required: true },
        month: { type: Number, required: true, min: 1, max: 12 },
        amount: { type: Number, required: true, min: 0 },
      },
    ],
    // Chiqish sababi snapshot (ArchiveReason keyin o'zgarsa ham hisobot buzilmasin).
    reasonTitle: { type: String, default: "" },
    // Hisobot barqarorligi uchun ism snapshotlari.
    studentName: { type: String, default: "" },
    groupName: { type: String, default: "" },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true },
);

// Hisobotlar/filtrlar uchun
debtWriteOffSchema.index({ group: 1, createdAt: -1 });
debtWriteOffSchema.index({ "breakdown.year": 1, "breakdown.month": 1 });

const DebtWriteOff = mongoose.model("DebtWriteOff", debtWriteOffSchema);

export default DebtWriteOff;
