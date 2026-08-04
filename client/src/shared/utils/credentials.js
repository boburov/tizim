// Login/parol GENERATSIYASI.
//
// Lidni o'quvchiga aylantirayotgan operator har bir odam uchun login va parol
// o'ylab topishga majbur edi - ko'p lidni birdan qabul qilishda bu eng sekin
// qadam. Bu yerda ism-familiyadan o'qiladigan login, va aytib berish oson
// parol yasaladi.

// Kirill va o'zbek lotinidagi maxsus belgilar -> ASCII.
const TRANSLIT = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "j", з: "z",
  и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r",
  с: "s", т: "t", у: "u", ф: "f", х: "x", ц: "ts", ч: "ch", ш: "sh",
  щ: "sh", ъ: "", ы: "i", ь: "", э: "e", ю: "yu", я: "ya",
  ў: "o", қ: "q", ғ: "g", ҳ: "h",
  ʻ: "", ʼ: "", "'": "", "`": "", "‘": "", "’": "",
};

// Bitta so'zni login bo'lagiga aylantiradi: kichik harf, faqat [a-z0-9].
export const slugify = (value = "") =>
  String(value)
    .toLowerCase()
    .split("")
    .map((ch) => (ch in TRANSLIT ? TRANSLIT[ch] : ch))
    .join("")
    // Diakritik belgilar (ā, ç, ...) asosiy harfga tushiriladi.
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");

// Kriptografik tasodif. Modulo siljishi bo'lmasligi uchun diapazondan
// tashqari qiymatlar tashlab yuboriladi (rejection sampling).
const randomInt = (max) => {
  const limit = Math.floor(256 / max) * max;
  const buf = new Uint8Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % max;
  }
};

const pick = (chars) => chars[randomInt(chars.length)];

// Chalkashtiradigan belgilar YO'Q: 0/O, 1/l/I. Parol og'zaki aytiladi va
// qog'ozga yoziladi - "0 mi, O mi?" savoli qo'ng'iroqqa aylanadi.
const LETTERS = "abcdefghjkmnpqrstuvwxyz";
const DIGITS = "23456789";

/**
 * Parol: kamida bitta harf va bitta raqam, standart uzunlik 8 (server
 * minimumi 6). Har doim harf bilan boshlanadi - shunda telefon klaviaturasida
 * terish oson.
 */
export const generatePassword = (length = 8) => {
  const size = Math.max(6, length);
  const out = [pick(LETTERS)];
  for (let i = 1; i < size - 1; i += 1) {
    out.push(pick(randomInt(3) === 0 ? DIGITS : LETTERS));
  }
  out.push(pick(DIGITS));
  return out.join("");
};

/**
 * Login: "ism.familiya" (masalan `ali.valiyev`). Familiya bo'lmasa faqat ism.
 * Ism lotin harflarisiz bo'lsa (bo'sh chiqsa) - `user` asos qilinadi.
 *
 * `taken` - shu forma ichida ALLAQACHON ishlatilgan loginlar. Ko'p lidni
 * birdan qabul qilishda bir xil ismli ikki kishi bo'lishi mumkin: serverdan
 * 409 kutib o'tirmasdan darhol `ali.valiyev2` qilinadi.
 */
export const generateUsername = (firstName = "", lastName = "", taken = []) => {
  const first = slugify(firstName);
  const last = slugify(lastName);
  let base = [first, last].filter(Boolean).join(".") || "user";
  // Server minimumi - 3 belgi.
  if (base.length < 3) base = `${base}${randomInt(90) + 10}`;
  base = base.slice(0, 36);

  const used = new Set((taken || []).filter(Boolean).map((u) => String(u).toLowerCase()));
  if (!used.has(base)) return base;
  for (let i = 2; i < 100; i += 1) {
    const next = `${base}${i}`;
    if (!used.has(next)) return next;
  }
  return `${base}${randomInt(9000) + 1000}`;
};

/** Ism-familiyadan login + parol juftligi. */
export const generateCredentials = (firstName, lastName, taken = []) => ({
  username: generateUsername(firstName, lastName, taken),
  password: generatePassword(),
});
