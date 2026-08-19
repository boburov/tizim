/**
 * MOLIYAVIY FORMALAR UCHUN UMUMIY YORDAMCHILAR.
 *
 * ── IDEMPOTENTLIK KALITI ──
 * Forma OCHILGANDA bir marta yaratiladi va yuborishda serverga
 * uzatiladi. Server uni `postingKey` ga aylantiradi, DB darajasidagi
 * unique indeks esa takroriy yozuvni to'sadi.
 *
 * NEGA FORMA OCHILGANDA, yuborishda EMAS: "Yuborish" bosilib, javob
 * kechikkanda foydalanuvchi yana bosadi. Kalit har bosishda yangi
 * yaratilsa, ikkala so'rov ham "yangi amal" bo'lib pul IKKI MARTA
 * yozilardi. Forma bo'yicha bitta kalit esa ikkinchisini to'sadi.
 *
 * Muvaffaqiyatdan keyin forma yopiladi va qayta ochilganda YANGI kalit
 * yaratiladi — ya'ni ikkita haqiqiy amal bir-birini to'smaydi.
 */
export const newIdemKey = () =>
  `ui-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/** To'lov kanallari — server `PaymentMethod` enumi bilan bir xil. */
export const METHOD_OPTIONS = [
  { value: "cash", label: "Naqd" },
  { value: "card", label: "Karta (terminal)" },
  { value: "click", label: "Click" },
  { value: "payme", label: "Payme" },
  { value: "uzcard", label: "Uzcard" },
  { value: "humo", label: "Humo" },
  { value: "bank", label: "Bank" },
  { value: "transfer", label: "O'tkazma" },
];

/** Bugungi sana — `YYYY-MM-DD` (server shu shaklni kutadi). */
export const today = () => new Date().toISOString().slice(0, 10);

/**
 * Mijoz tomonidagi tekshiruv.
 *
 * SERVER TEKSHIRUVINI ALMASHTIRMAYDI — u yagona haqiqiy to'siq
 * (`financeOps.validator.js` + servis qoidalari). Bu yerdagi tekshiruv
 * faqat foydalanuvchini bekorga so'rov yuborishdan saqlaydi.
 */
export const validateAmount = (value) => {
  const n = Number(value);
  if (!value) return "Summa kiritilishi shart";
  if (!Number.isFinite(n) || n <= 0) return "Summa musbat son bo'lishi kerak";
  if (!Number.isInteger(n)) return "Summa butun so'mda bo'lishi kerak";
  if (n > 1_000_000_000) return "Summa juda katta";
  return null;
};
