/**
 * ══════════════════════════════════════════════════════════════════════
 * LOGIN VA PAROL — AVTOMATIK
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── MUAMMO ──
 * Bitta o'quvchi qo'shish uchun YETTITA majburiy maydon to'ldirilardi va
 * ulardan ikkitasi — login va parol — foydalanuvchi O'YLAB TOPISHI kerak
 * bo'lgan texnik narsa edi. Administrator har safar "bu bolaga qanday
 * login qo'yaman?" degan savolga javob izlardi; natijada `ali1`, `ali11`,
 * `ali_yangi` kabi tartibsiz loginlar paydo bo'lardi va "bu login band"
 * xatosi bilan urinish qaytadan boshlanardi.
 *
 * Bu ish emas — bu tizimning ichki ehtiyoji. Shuning uchun tizim uni
 * O'ZI hal qiladi.
 *
 * ── QOIDA ──
 * Login ismdan yasaladi (`ism.familiya`), band bo'lsa raqam qo'shiladi.
 * Parol — o'qib bo'ladigan, lekin taxmin qilib bo'lmaydigan qisqa satr:
 * uni administrator o'quvchiga OG'ZAKI aytadi, shuning uchun `l/I/0/O`
 * kabi chalkashadigan belgilar ISHLATILMAYDI.
 *
 * Ikkalasini ham qo'lda o'zgartirish MUMKIN — "Login va parolni o'zim
 * kiritaman" tugmasi ostida. Ya'ni imkoniyat yo'qolmadi, faqat u endi
 * MAJBURIY emas.
 */
const translit = (s = "") =>
  s.toLowerCase()
    .replace(/[’'`]/g, "")
    .replace(/o‘|o'/g, "o").replace(/g‘|g'/g, "g")
    .replace(/[^a-z0-9]+/g, "");

/** `Ali Valiyev` → `ali.valiyev` */
export const suggestUsername = (firstName, lastName) => {
  const a = translit(firstName);
  const b = translit(lastName);
  const base = [a, b].filter(Boolean).join(".");
  return base.slice(0, 24);
};

// Chalkashadigan belgilar (l/I/1, O/0) ATAYLAB YO'Q: parol og'zaki
// aytiladi va "katta i mi, kichik el mi?" degan savol bo'lmasligi kerak.
const PWD_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

export const suggestPassword = (len = 8) => {
  const bytes = new Uint32Array(len);
  crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < len; i += 1) out += PWD_ALPHABET[bytes[i] % PWD_ALPHABET.length];
  return out;
};

