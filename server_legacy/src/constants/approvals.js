/**
 * TASDIQ SO'ROVI - domen lug'ati (holatlar, kategoriyalar, turlar).
 *
 * NEGA `models/approval.model.js` DAN KO'CHIRILDI: bu qiymatlar BAZAGA
 * bog'liq emas. Mongoose model fayllari migratsiya oxirida o'chiriladi,
 * lug'at esa qolishi kerak - 14 ta modul uni import qiladi.
 *
 * Jadval tuzilmasi endi `prisma/schema.prisma` da: model Approval
 * (jismoniy jadval nomi `expense_approvals`).
 *
 * NEGA TASDIQ ALOHIDA JADVALDA (maqsad modelida "pending" status EMAS):
 * TeacherSalary.paidAmount keshlangan summa bo'lib, u
 * `SUM(amount) WHERE salaryId=X AND isDeleted=false` bilan qayta
 * hisoblanadi. Agar "kutilmoqda" yozuvi o'sha jadvalda tursa, u TO'LANGAN
 * deb hisoblanardi va 8 ta hisobot yig'indisiga sizib kirardi. AYNAN SHU
 * sabab konfiguratsiya tasdiqlariga ham taalluqli: tasdiqlanmagan
 * TeacherGroupPeriod yozuvi yaratilsa, u maosh hisobiga darhol kirib
 * ketardi. Shuning uchun so'rov ma'lumoti FAQAT `payload` ichida yashaydi.
 */

export const APPROVAL_STATUSES = Object.freeze({
  PENDING: "pending",
  APPROVED: "approved", // tasdiqlandi, lekin hali bajarilmadi
  EXECUTED: "executed", // bajarildi - tranzaksiya/hujjat yaratildi
  REJECTED: "rejected",
  CANCELED: "canceled", // so'rovchi o'zi bekor qildi
  FAILED: "failed", // tasdiqlandi, lekin bajarishda xato (masalan balans yetmadi)
});

export const ALL_APPROVAL_STATUSES = Object.values(APPROVAL_STATUSES);

// KATEGORIYA: "pul chiqdi" va "sozlama o'zgardi" bir xil hayot siklida,
// lekin BOSHQA huquq bilan tasdiqlanadi va BOSHQA hisobotlarga tushadi.
//
// DIQQAT: moliya hisobotlari/summalari FAQAT `financial` bilan ishlashi shart.
// Aks holda summasiz konfiguratsiya so'rovlari "kutilayotgan chiqim" summasiga
// qo'shilib ketardi - yuqoridagi leakage darsining aynan takrori.
export const APPROVAL_CATEGORIES = Object.freeze({
  FINANCIAL: "financial", // pul hisobdan chiqadi
  CONFIGURATION: "configuration", // sozlama/siyosat o'zgaradi (takrorlanuvchi ta'sir)
});

export const ALL_APPROVAL_CATEGORIES = Object.values(APPROVAL_CATEGORIES);

// Tasdiq turlari. Har biri o'z payload'i va bajaruvchi funksiyasiga ega.
export const APPROVAL_KINDS = Object.freeze({
  SALARY_PAYMENT: "salary_payment", // o'qituvchiga maosh (financial)
  DEPOSIT_WITHDRAW: "deposit_withdraw", // o'quvchi depozitidan naqd yechish (financial)
  SALARY_TERMS: "salary_terms", // o'qituvchi maosh stavkasi (configuration)
  DISCOUNT_SET: "discount_set", // o'quvchi chegirmasi (configuration)
  // Guruh oylik narxi. Chegirma bilan BIR XIL iqtisodiy ta'sirga ega:
  // narxni 1 mln dan 400 ming ga tushirish barcha o'quvchiga chegirma
  // berish bilan bir xil. Shuning uchun u ham tasdiqdan o'tadi - aks holda
  // chegirma yopilib, yonidagi eshik ochiq qolardi.
  GROUP_FEE_SET: "group_fee_set", // (configuration)
  STAFF_HIRE: "staff_hire", // ishga olish (configuration)
  // O'qituvchining MARKAZ darajasidagi standart maosh stavkasi.
  // SALARY_TERMS bir guruhga ta'sir qiladi, bu esa o'qituvchining BARCHA
  // guruhlariga - ya'ni iqtisodiy ta'siri kattaroq, shuning uchun u ham
  // (undan ham kuchliroq sabab bilan) tasdiqdan o'tadi.
  TEACHER_COMPENSATION_SET: "teacher_compensation_set", // (configuration)
  // O'quvchini ORQAGA SANA bilan guruhga qo'shish: o'tgan oylar uchun
  // QARZ YARATADI, ya'ni chegirmaning teskarisi. Summasi bor → financial.
  MEMBERSHIP_BACKDATE: "membership_backdate", // (financial)
  // UMUMIY CHIQIM (ijara, ta'mir, reklama, jihoz). Pul hisobdan chiqadi →
  // financial, filial limitiga solishtiriladi.
  EXPENSE_CREATE: "expense_create", // (financial)
  // XODIM MAOSHI (o'qituvchi bo'lmagan xodimlar: resepshin, buxgalter...).
  // SALARY_PAYMENT dan ALOHIDA: u TeacherSalary qatoriga bog'langan va
  // uning bajaruvchisi guruhni talab qiladi.
  STAFF_SALARY_PAYMENT: "staff_salary_payment", // (financial)
});

export const ALL_APPROVAL_KINDS = Object.values(APPROVAL_KINDS);

// Tur -> kategoriya. Yangi tur qo'shilganda SHU YERGA ham yozilishi shart -
// aks holda `resolveCategory` xato beradi (jimgina financial'ga tushmaydi).
export const KIND_CATEGORY = Object.freeze({
  [APPROVAL_KINDS.SALARY_PAYMENT]: APPROVAL_CATEGORIES.FINANCIAL,
  [APPROVAL_KINDS.DEPOSIT_WITHDRAW]: APPROVAL_CATEGORIES.FINANCIAL,
  [APPROVAL_KINDS.SALARY_TERMS]: APPROVAL_CATEGORIES.CONFIGURATION,
  [APPROVAL_KINDS.DISCOUNT_SET]: APPROVAL_CATEGORIES.CONFIGURATION,
  [APPROVAL_KINDS.GROUP_FEE_SET]: APPROVAL_CATEGORIES.CONFIGURATION,
  [APPROVAL_KINDS.STAFF_HIRE]: APPROVAL_CATEGORIES.CONFIGURATION,
  [APPROVAL_KINDS.TEACHER_COMPENSATION_SET]: APPROVAL_CATEGORIES.CONFIGURATION,
  // FINANCIAL: yaratiladigan qarz summasi limitga solishtiriladi.
  [APPROVAL_KINDS.MEMBERSHIP_BACKDATE]: APPROVAL_CATEGORIES.FINANCIAL,
  [APPROVAL_KINDS.EXPENSE_CREATE]: APPROVAL_CATEGORIES.FINANCIAL,
  [APPROVAL_KINDS.STAFF_SALARY_PAYMENT]: APPROVAL_CATEGORIES.FINANCIAL,
});

export const resolveCategory = (kind) => {
  const category = KIND_CATEGORY[kind];
  if (!category) throw new Error(`Noma'lum tasdiq turi: ${kind}`);
  return category;
};

// Eski nom bilan moslik (chiqim servislari shu nomni import qiladi).
export const EXPENSE_KINDS = APPROVAL_KINDS;
export const ALL_EXPENSE_KINDS = ALL_APPROVAL_KINDS;
