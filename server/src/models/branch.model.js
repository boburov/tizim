import mongoose from "mongoose";
import softDeletePlugin from "./plugins/softDelete.plugin.js";

// FILIAL: bitta o'quv markazi ichidagi alohida joylashuv.
// Bir tenant = bir o'quv markazi (brend), uning ichida 1..N filial.
// Har filialning o'z moliyasi, davomati va xodimlari bo'ladi, lekin
// Role/Permission/Holiday kabi sozlamalar TENANT bo'ylab UMUMIY qoladi.
const branchSchema = new mongoose.Schema(
  {
    name: { type: String, trim: true, required: true },
    // Qisqa kod (UI'da filial tanlagichda ko'rinadi): "MRK", "CHL"
    code: { type: String, trim: true, uppercase: true, default: null },
    address: { type: String, trim: true, default: null },
    phone: { type: String, trim: true, default: null },

    // ASOSIY filial: migratsiyada barcha mavjud ma'lumot shunga biriktiriladi.
    // Bittadan ortiq isMain bo'lishi mumkin emas (pastdagi partial index).
    // O'chirib bo'lmaydi - service qatlamida tekshiriladi.
    isMain: { type: Boolean, default: false },

    // CHIQIM LIMITI (bitta amaliyot uchun).
    // Bu summadan KATTA chiqim (maosh to'lash, depozitdan yechish) darhol
    // bajarilmaydi - "tasdiq kutilmoqda" holatiga tushadi va owner
    // tasdiqlagach amalga oshadi.
    //
    // null = limit yo'q (cheksiz). Bu ATAYLAB "fail open": limit ixtiyoriy
    // imkoniyat, owner uni o'zi kiritadi. Aks holda yangilanishdan keyin
    // barcha mavjud markazlarda to'lovlar to'satdan bloklanardi.
    expenseApprovalThreshold: { type: Number, min: 0, default: null },

    isActive: { type: Boolean, default: true },
    // Arxivlangan (isActive=false qilingan) payt.
    archivedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Filial nomi takrorlanmasin (faqat o'chirilmaganlar orasida).
branchSchema.index(
  { name: 1 },
  {
    unique: true,
    partialFilterExpression: { isDeleted: false },
  },
);

// Faqat BITTA asosiy filial bo'lishi mumkin.
branchSchema.index(
  { isMain: 1 },
  {
    unique: true,
    partialFilterExpression: { isMain: true, isDeleted: false },
  },
);

branchSchema.plugin(softDeletePlugin);

const Branch = mongoose.model("Branch", branchSchema);

export default Branch;
