import mongoose from "mongoose";
import softDeletePlugin from "./plugins/softDelete.plugin.js";

// XONA (sinf xonasi) - filialning FIZIK resursi.
//
// NEGA FILIALGA BOG'LANGAN (Course'dan farqli): xona - joylashuv, taksonomiya
// emas. "3-xona" har filialda BOSHQA xona va ularni birlashtirsak bandlik
// hisobi ma'nosini yo'qotardi. Shuning uchun `branchId` MAJBURIY.
//
// NEGA KERAK BO'LDI: `classes.read/create/update/delete` ruxsatlari
// constants/permissions.js da ancha vaqtdan beri bor edi, lekin model ham,
// route ham yo'q edi - ya'ni o'lik ruxsat guruhi. Ular endi ma'no oladi.
//
// NIMA UCHUN OCHILADI (keyingi fazalar):
//   - bandlik foizi (occupied slot-soat / mavjud slot-soat)
//   - "1 ta xonaga necha talaba" normalizatsiyasi
//   - "1 kv.m ga qancha tushum" (areaM2)
//   - jadval to'qnashuvi: bitta xonada ikki guruh bir vaqtda
const roomSchema = new mongoose.Schema(
  {
    branchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Branch",
      required: true,
      index: true,
    },

    // Xona nomi/raqami: "3-xona", "Katta zal".
    name: { type: String, trim: true, required: true },

    // Nechta o'quvchi sig'adi. Guruh hajmini tekshirishda ishlatiladi.
    capacity: { type: Number, min: 0, default: null },

    // Maydon (kv.m). Faqat NORMALIZATSIYA uchun: "1 kv.m ga qancha tushum"
    // ko'rsatkichi filiallarni hajmidan qat'i nazar taqqoslashga imkon
    // beradi (katta filial ko'proq daromad qilishi tabiiy - savol
    // SAMARADORLIKDA).
    areaM2: { type: Number, min: 0, default: null },

    // Jihoz ro'yxati ("proyektor", "doska") - guruh joylashtirishda filtr.
    equipment: { type: [String], default: [] },

    note: { type: String, trim: true, default: "" },

    isActive: { type: Boolean, default: true, index: true },
  },
  { timestamps: true },
);

// Xona nomi FILIAL ICHIDA takrorlanmasin.
//
// DIQQAT - filiallararo EMAS: "3-xona" har filialda bo'lishi TABIIY va
// global unique indeks ikkinchi filialga xona qo'shishni to'sib qo'yardi.
roomSchema.index(
  { branchId: 1, name: 1 },
  {
    unique: true,
    partialFilterExpression: { isDeleted: false },
  },
);

roomSchema.plugin(softDeletePlugin);

const Room = mongoose.model("Room", roomSchema);

export default Room;
