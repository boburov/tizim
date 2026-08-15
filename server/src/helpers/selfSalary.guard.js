import ApiError from "../utils/ApiError.js";

// O'ZIGA O'ZI MAOSH BELGILASHGA QARSHI TO'SIQ.
//
// NEGA KERAK: filial rahbariga o'z filialida to'liq huquq berilgan
// (constants/permissionScope.js), jumladan o'qituvchi stavkasini
// belgilash. Lekin u o'zini o'qituvchi sifatida ham yozdirib
// (staff_hire + rol biriktirish) O'ZIGA istagan stavkani qo'yib
// olishi mumkin edi.
//
// NEGA BUTUN TOIFANI BLOKLAMAYMIZ: dastlab maosh turlariga `auto`
// rejimi umuman berilmagan edi, ya'ni HAR BIR o'qituvchining stavkasi
// owner tasdig'iga tushardi. Bu haqiqiy muammoni (o'ziga o'zi) hal
// qilardi, lekin yo'l-yo'lakay oddiy ishni ham to'sib qo'yardi -
// direktor 20 ta o'qituvchisining stavkasini qo'ya olmasdi.
// Aniq to'siq to'g'riroq: bitta holat yopiladi, qolgani ochiq qoladi.
//
// NEGA RUXSATDAN QAT'I NAZAR: bu biznes invarianti, huquq masalasi
// emas. Owner ham o'ziga stavka qo'ymasligi kerak - u odatda
// o'qituvchi emas, lekin qo'ysa ham bu audit nuqtai nazaridan
// noto'g'ri. Yagona istisno - kontekstsiz chaqiruvlar (seed, migratsiya,
// Agenda job): u yerda `currentUser` yo'q va tekshirish ma'nosiz.
//
// QAYERDA CHAQIRILADI: teacherCompensation.service.js (markaz darajasi)
// va teacherGroupPeriod.service.js (guruh darajasi) - maosh stavkasi
// AYNAN shu ikki joyda belgilanadi.

/**
 * @param {object|null} currentUser - amalni bajarayotgan foydalanuvchi
 * @param {string|object} targetTeacherId - stavka kimga qo'yilyapti
 * @throws {ApiError} 403 - ikkalasi bir odam bo'lsa
 */
export const assertNotSelfSalary = (currentUser, targetTeacherId) => {
  // Kontekstsiz (seed / job / migratsiya) - tekshirilmaydi.
  if (!currentUser?._id || !targetTeacherId) return;

  const actor = String(currentUser._id);
  const target = String(targetTeacherId?._id || targetTeacherId);

  if (actor === target) {
    throw new ApiError(
      403,
      "O'zingizga maosh stavkasi belgilay olmaysiz - buni rahbaringiz qiladi",
    );
  }
};

export default assertNotSelfSalary;
