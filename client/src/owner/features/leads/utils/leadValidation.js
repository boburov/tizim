// LID FORMASINING TEKSHIRUVI - yaratish va tahrirlash uchun BITTA joyda.
//
// Server ham aynan shu qoidalarni qo'llaydi (leads.validators.js), lekin
// foydalanuvchi qaysi maydon yetishmayotganini 400 javobidan emas, FORMANING
// o'zidan ko'rishi kerak. Ilgari `handleSubmit` bo'sh maydonda jimgina
// `return` qilardi: tugma bosiladi, hech narsa bo'lmaydi, sababi ko'rinmaydi.

// Yopish izohining eng kam uzunligi. Serverdagi MIN_NOTE bilan BIR XIL
// bo'lishi shart.
export const MIN_CLOSING_NOTE = 10;

// Formatlash belgilarini (probel, qavs, chiziqcha, +) tashlab faqat
// raqamlarni solishtiramiz: "+998 90 123 45 67" va "998901234567" - bir xil.
export const digitsOnly = (v) => String(v || "").replace(/\D/g, "");

// To'liq raqam = 998 + 9 ta raqam (InputTel maskasi shuni talab qiladi).
const FULL_PHONE_DIGITS = 12;

/**
 * @returns {Object} maydon nomi -> xato matni. Bo'sh obyekt = forma yaroqli.
 */
export const validateLead = (obj = {}) => {
  const errors = {};

  if (!String(obj.firstName || "").trim()) {
    errors.firstName = "Ismni kiriting";
  }

  const phone = digitsOnly(obj.phone);
  if (!phone) {
    errors.phone = "Telefon raqamini kiriting";
  } else if (phone.length < FULL_PHONE_DIGITS) {
    errors.phone = "Telefon raqami to'liq emas";
  }

  const parentPhone = digitsOnly(obj.parentPhone);
  if (parentPhone && parentPhone.length < FULL_PHONE_DIGITS) {
    errors.parentPhone = "Telefon raqami to'liq emas";
  } else if (parentPhone && parentPhone === phone) {
    // Qo'shimcha raqam BOSHQA odamniki bo'lishi kerak - aks holda undan
    // foyda yo'q va lid bilan bog'lanib bo'lmay qolish xavfi kamaymaydi.
    errors.parentPhone = "Ikkala raqam bir xil";
  }

  const age = String(obj.age ?? "").trim();
  if (age && (Number(age) < 1 || Number(age) > 120)) {
    errors.age = "Yosh 1 dan 120 gacha bo'lishi kerak";
  }

  // Lid "rad etilgan" holatda bo'lsa sabab va izoh MAJBURIY (server ham
  // shuni talab qiladi - yaratishda ham, tahrirlashda ham).
  if (obj.status === "rejected") {
    if (!obj.rejectionReasonId) {
      errors.rejectionReasonId = "Rad etish sababini tanlang";
    }
    if (String(obj.rejectionNote || "").trim().length < MIN_CLOSING_NOTE) {
      errors.rejectionNote = `Kamida ${MIN_CLOSING_NOTE} ta belgi yozing`;
    }
  }

  return errors;
};

export const hasErrors = (errors) => Object.keys(errors || {}).length > 0;
