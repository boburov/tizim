// BRAUZER AVTOTO'LDIRISHINI (autofill / autocomplete) O'CHIRISH.
//
// NEGA KERAK: lid va foydalanuvchi formalari bir xil maydon nomlaridan
// ("firstName", "phone") foydalanadi va brauzer ularni "shaxsiy ma'lumot"
// deb tanib, o'tgan safar yozilgan qiymatlarni ro'yxat qilib chiqaradi.
// Resepshin kuniga o'nlab lid kiritadi - har maydonda ochiladigan ro'yxat
// haqiqiy variantlarni to'sib qo'yadi va tasodifan BOSHQA odamning
// ma'lumoti yozilib ketadi.
//
// NEGA FAQAT `autoComplete="off"` YETMAYDI: brauzer uni ism/telefon kabi
// maydonlarda ko'pincha e'tiborsiz qoldiradi, parol menejerlari esa umuman
// qaramaydi. Shuning uchun ularning har biriga ATALGAN bayroq qo'shiladi:
//   data-lpignore   - LastPass
//   data-1p-ignore  - 1Password
//   data-form-type  - Dashlane
//
// Ishlatish: <InputField {...NO_AUTOFILL} ... />
// DIQQAT: kirish (login) formasiga QO'YILMAYDI - u yerda parolni saqlash
// va avtomatik to'ldirish foydalanuvchiga kerak.
export const NO_AUTOFILL = Object.freeze({
  autoComplete: "off",
  "data-lpignore": "true",
  "data-1p-ignore": "true",
  "data-form-type": "other",
});

// Forma elementining o'zi uchun (ichidagi maydonlar uchun standart qiymat).
export const NO_AUTOFILL_FORM = Object.freeze({ autoComplete: "off" });
