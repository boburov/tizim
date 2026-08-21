import crypto from "node:crypto";

/**
 * LOGIN VA PAROL GENERATSIYASI (ommaviy import uchun).
 *
 * Ikkalasi ham jadvalda TAHRIRLANADI - bu yerdagi qiymat faqat taklif.
 * Shuning uchun maqsad "buzib bo'lmaydigan" emas, "odam o'qiy oladigan
 * va aytib bera oladigan" qiymat: resepshin buni telefonda diktovka
 * qiladi.
 */

// O'zbek lotin/kirill → ASCII. Login `username` maydoniga tushadi
// (lowercase, unique) - u yerda faqat ASCII bo'lishi kerak, aks holda
// odam uni klaviaturada tera olmaydi.
const TRANSLIT = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "j",
  з: "z", и: "i", й: "y", к: "k", л: "l", м: "m", н: "n", о: "o",
  п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "x", ц: "ts",
  ч: "ch", ш: "sh", щ: "sh", ъ: "", ы: "i", ь: "", э: "e", ю: "yu",
  я: "ya", ў: "o", қ: "q", ғ: "g", ҳ: "h",
  // Lotin diakritikalari va apostrof shakllari
  ʻ: "", ʼ: "", "'": "", "`": "", "‘": "", "’": "",
  ç: "ch", ş: "sh", ö: "o", ü: "u", ğ: "g", ı: "i",
};

export const transliterate = (input) =>
  String(input || "")
    .toLowerCase()
    .split("")
    .map((ch) => (ch in TRANSLIT ? TRANSLIT[ch] : ch))
    .join("")
    // Qolgan hamma narsa (bo'shliq, tinish, raqam bo'lmagan belgi) tashlanadi.
    .replace(/[^a-z0-9]+/g, "")
    .trim();

/**
 * Ism va familiyadan login asosi: "ali.valiyev".
 * Bo'sh chiqsa (masalan ism faqat belgilardan iborat) - "user".
 */
export const baseUsername = (firstName, lastName) => {
  const a = transliterate(firstName);
  const b = transliterate(lastName);
  const joined = [a, b].filter(Boolean).join(".");
  // username validatori kamida 3, ko'pi bilan 40 belgi talab qiladi.
  const clipped = joined.slice(0, 34); // suffiks uchun joy qoldiramiz
  if (clipped.length >= 3) return clipped;
  return (clipped || "user").padEnd(3, "0");
};

/**
 * Band bo'lmagan login tanlaydi.
 *
 * `taken` - allaqachon band loginlar to'plami (bazadan + SHU FAYLDAGI
 * oldingi qatorlardan). Fayl ichidagi to'qnashuv alohida muammo:
 * bir faylda ikkita "Ali Valiyev" bo'lsa ikkalasiga bir xil login
 * taklif qilinardi va ikkinchisi yozishda yiqilardi.
 *
 * DIQQAT: bu YAKUNIY kafolat EMAS. Ikki foydalanuvchi bir vaqtda
 * import qilsa yoki oradan vaqt o'tsa login band bo'lib qolishi
 * mumkin - yakuniy hal qilish yozish paytida, E11000 ushlanganda
 * (qarang: uniqueUsernameOnConflict).
 */
export const suggestUsername = (firstName, lastName, taken = new Set()) => {
  const base = baseUsername(firstName, lastName);
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i += 1) {
    const candidate = `${base}${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  // Deyarli erishib bo'lmaydigan holat - tasodifiy quyruq.
  return `${base}${crypto.randomInt(1000, 9999)}`;
};

/**
 * E11000 (login band) kelganda keyingi variantni beradi.
 * Yozish sikli buni bir necha marta chaqirib qayta urinadi.
 */
export const nextUsernameCandidate = (username, attempt) => {
  const stripped = String(username).replace(/\d+$/, "") || "user";
  const suffix = crypto.randomInt(10, 9999);
  return `${stripped.slice(0, 34)}${attempt <= 3 ? attempt + 1 : suffix}`;
};

// CHALKASHTIRADIGAN BELGILAR OLIB TASHLANGAN: 0/O, 1/l/I.
// Parol og'zaki aytiladi ("nol emas, katta O") - bu chalkashlik
// resepshinning eng ko'p vaqtini oladigan narsa.
const PWD_ALPHABET = "abcdefghjkmnpqrstuvwxyz";
const PWD_DIGITS = "23456789";

/**
 * O'qiladigan parol: 3 harf + 4 raqam, masalan "kfa2846".
 * Validator kamida 6 belgi talab qiladi - bu 7 belgi.
 */
export const generatePassword = () => {
  let out = "";
  for (let i = 0; i < 3; i += 1) {
    out += PWD_ALPHABET[crypto.randomInt(0, PWD_ALPHABET.length)];
  }
  for (let i = 0; i < 4; i += 1) {
    out += PWD_DIGITS[crypto.randomInt(0, PWD_DIGITS.length)];
  }
  return out;
};
