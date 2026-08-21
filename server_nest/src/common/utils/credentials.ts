import crypto from 'node:crypto';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LOGIN VA PAROL GENERATSIYASI (ommaviy import uchun) —
 * `utils/credentials.js` KO'CHIRMASI.
 *
 * ⚠ Ikkalasi ham jadvalda TAHRIRLANADI — bu yerdagi qiymat faqat TAKLIF.
 * Shuning uchun maqsad "buzib bo'lmaydigan" emas, "odam o'qiy oladigan va
 * AYTIB BERA OLADIGAN" qiymat: resepshin buni telefonda diktovka qiladi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * O'zbek lotin/kirill → ASCII.
 *
 * ⚠ Login `username` maydoniga tushadi (lowercase, unique) — u yerda
 * FAQAT ASCII bo'lishi kerak, aks holda odam uni klaviaturada TERA
 * OLMAYDI.
 */
const TRANSLIT: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'j',
  з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o',
  п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'x', ц: 'ts',
  ч: 'ch', ш: 'sh', щ: 'sh', ъ: '', ы: 'i', ь: '', э: 'e', ю: 'yu',
  я: 'ya', ў: 'o', қ: 'q', ғ: 'g', ҳ: 'h',
  // Lotin diakritikalari va apostrof shakllari
  ʻ: '', ʼ: '', "'": '', '`': '', '‘': '', '’': '',
  ç: 'ch', ş: 'sh', ö: 'o', ü: 'u', ğ: 'g', ı: 'i',
};

export const transliterate = (input: unknown): string =>
  String(input || '')
    .toLowerCase()
    .split('')
    .map((ch) => (ch in TRANSLIT ? TRANSLIT[ch] : ch))
    .join('')
    // Qolgan hamma narsa (bo'shliq, tinish, harf/raqam bo'lmagan belgi)
    // TASHLANADI.
    .replace(/[^a-z0-9]+/g, '')
    .trim();

/**
 * Ism va familiyadan login asosi: `"ali.valiyev"`.
 * Bo'sh chiqsa (ism faqat belgilardan iborat) — `"user"`.
 */
export const baseUsername = (firstName: unknown, lastName: unknown): string => {
  const a = transliterate(firstName);
  const b = transliterate(lastName);
  const joined = [a, b].filter(Boolean).join('.');
  // ⚠ `username` validatori kamida 3, ko'pi bilan 40 belgi talab qiladi.
  const clipped = joined.slice(0, 34); // suffiks uchun joy qoldiramiz
  if (clipped.length >= 3) return clipped;
  return (clipped || 'user').padEnd(3, '0');
};

/**
 * `P2002` (login band) kelganda KEYINGI variantni beradi.
 * Yozish sikli buni bir necha marta chaqirib qayta urinadi.
 */
export const nextUsernameCandidate = (username: string, attempt: number): string => {
  const stripped = String(username).replace(/\d+$/, '') || 'user';
  const suffix = crypto.randomInt(10, 9999);
  return `${stripped.slice(0, 34)}${attempt <= 3 ? attempt + 1 : suffix}`;
};

/**
 * ⚠ CHALKASHTIRADIGAN BELGILAR OLIB TASHLANGAN: `0/O`, `1/l/I`.
 * Parol OG'ZAKI aytiladi ("nol emas, katta O") — bu chalkashlik
 * resepshinning eng ko'p vaqtini oladigan narsa.
 */
const PWD_ALPHABET = 'abcdefghjkmnpqrstuvwxyz';
const PWD_DIGITS = '23456789';

/** O'qiladigan parol: 3 harf + 4 raqam (masalan `"kfa2846"`) — 7 belgi. */
export const generatePassword = (): string => {
  let out = '';
  for (let i = 0; i < 3; i += 1) {
    out += PWD_ALPHABET[crypto.randomInt(0, PWD_ALPHABET.length)];
  }
  for (let i = 0; i < 4; i += 1) {
    out += PWD_DIGITS[crypto.randomInt(0, PWD_DIGITS.length)];
  }
  return out;
};
