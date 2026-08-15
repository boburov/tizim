import mongoose from "mongoose";
import softDeletePlugin from "./plugins/softDelete.plugin.js";
import {
  ALL_DELEGATION_MODES,
  DELEGATION_MODES,
  validateDelegation,
} from "../constants/delegation.js";

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

    // DELEGATSIYA MATRITSASI - filial rahbari qaysi SOZLAMA amalini o'zi
    // hal qila oladi. Kalit = tasdiq turi (APPROVAL_KINDS), qiymat = qoida.
    //
    // Batafsil sabab va rejimlar: constants/delegation.js.
    //
    // NEGA Map (oddiy nested obyekt emas): tasdiq turlari vaqt o'tib
    // qo'shiladi (hozir 5 ta, keyin inkassatsiya/kamomad turlari qo'shiladi).
    // Har safar sxema o'zgartirish o'rniga kalit erkin qoladi - ruxsat
    // etilgan kalitlar ro'yxati DELEGATABLE_KINDS'da, tekshiruv esa
    // quyidagi pre("validate") hook'ida.
    //
    // undefined = matritsa umuman kiritilmagan -> hamma tur `approval`,
    // ya'ni AVVALGI xatti-harakat. Migratsiya kerak emas.
    delegation: {
      type: Map,
      of: new mongoose.Schema(
        {
          mode: {
            type: String,
            enum: ALL_DELEGATION_MODES,
            default: DELEGATION_MODES.APPROVAL,
          },
          // Yuqori chegara (chegirma, maosh) - so'mda.
          maxAmount: { type: Number, min: 0, default: null },
          // Quyi chegara (guruh narxi) - so'mda.
          minAmount: { type: Number, min: 0, default: null },
          // Foizli chegara (foizli chegirma, foizli maosh).
          maxPercent: { type: Number, min: 0, max: 100, default: null },
        },
        { _id: false },
      ),
      default: undefined,
    },

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

// DELEGATSIYA TEKSHIRUVI MODEL DARAJASIDA.
//
// NEGA servis qatlami yetmaydi: matritsa seed'dan, migratsiyadan va
// testlardan ham yoziladi - ular validator middleware'idan o'tmaydi.
// Eng muhimi, maosh turlariga `auto` qo'yilishi shu yerda ham to'xtaydi
// (qarang: constants/delegation.js dagi izoh).
branchSchema.pre("validate", function preValidateDelegation(next) {
  if (!this.delegation) return next();
  const error = validateDelegation(this.delegation);
  if (error) return next(new Error(error));
  return next();
});

branchSchema.plugin(softDeletePlugin);

const Branch = mongoose.model("Branch", branchSchema);

export default Branch;
