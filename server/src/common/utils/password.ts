import { scrypt as scryptCb, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PAROL — IKKI FORMAT BIR VAQTDA
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ TARIXIY HOLAT: bu markazda parollar OCHIQ MATNDA saqlanadi va bu
 * loyiha talabi edi — `GET /users/:id/password` mavjud parolni
 * QAYTARADI (tiklamaydi) va butun "xodim login-parolini ber" ekrani
 * shunga tayanadi. Ustun nomi `passwordHash` — tarixiy nom.
 *
 * ── NIMA O'ZGARDI ──
 * `comparePassword` endi IKKALA formatni ham tushunadi:
 *   • `scrypt$...` bilan boshlansa — HASH (doimiy vaqtli solishtirish);
 *   • aks holda — eski ochiq matn (aynan avvalgidek).
 *
 * `hashPassword` esa ATAYLAB O'ZGARMADI: u hamon ochiq matn qaytaradi.
 * Aks holda mavjud parol ko'rish ekrani BUTUN markazda jimgina buzilardi
 * — bu tuzatish emas, mahsulot funksiyasini yo'q qilish bo'lardi.
 *
 * ── HASH QAYERDA ISHLATILADI ──
 * FAQAT MARKAZ EGASI (owner) hisobida, va uni dev panel yozadi
 * (`admin_server/src/tenant-db/tenant-db.service.ts`). Sabab: ega
 * paroli butun markazga to'liq kirish beradi va u YAGONA hisob bo'lib,
 * uni ko'rish talabi yo'q — tenant serveri ham `GET /users/:id/password`
 * da owner uchun 403 qaytaradi (`users.service.ts`).
 *
 * Ya'ni: ega paroli endi TIKLAB BO'LMAYDI (faqat qayta o'rnatiladi),
 * qolgan foydalanuvchilar esa avvalgidek ishlaydi.
 *
 * ── NEGA `scrypt`, `bcrypt` EMAS ──
 * `scrypt` — Node'ning O'ZIDA. `bcrypt` native modul: har Node
 * yangilanishida qayta qurilishi kerak va tenant VPS'larida build
 * vositalari bo'lmasligi mumkin. Bitta hisob uchun yangi native
 * bog'liqlik kiritish — deploy'ni sindirish xavfi.
 */

const PREFIX = 'scrypt';
const KEY_LEN = 64;
const SALT_LEN = 16;

/** Qiymat shu modul yozgan hash formatidami. */
export const isHashed = (stored: unknown): boolean =>
  typeof stored === 'string' && stored.startsWith(`${PREFIX}$`);

/**
 * ⚠ OCHIQ MATN QAYTARADI — ATAYLAB (yuqoridagi izohga qarang).
 * Hash kerak bo'lsa `hashPasswordSecure` ishlatiladi.
 */
export const hashPassword = async (plain: unknown): Promise<string> => String(plain);

/** Qaytarib bo'lmaydigan hash — `scrypt$<salt-b64>$<key-b64>`. */
export const hashPasswordSecure = async (plain: unknown): Promise<string> => {
  const salt = randomBytes(SALT_LEN);
  const key = (await scrypt(String(plain), salt, KEY_LEN)) as Buffer;
  return `${PREFIX}$${salt.toString('base64')}$${key.toString('base64')}`;
};

export const comparePassword = async (
  plain: unknown,
  stored: unknown,
): Promise<boolean> => {
  const value = String(stored ?? '');

  if (!isHashed(value)) {
    // ── ESKI YO'L: ochiq matn ──
    return String(plain) === value;
  }

  const [, saltB64, keyB64] = value.split('$');
  if (!saltB64 || !keyB64) return false;

  try {
    const salt = Buffer.from(saltB64, 'base64');
    const expected = Buffer.from(keyB64, 'base64');

    // ⚠⚠ UZUNLIK QAT'IY TEKSHIRILADI — BU XAVFSIZLIK SHARTI, SANITY EMAS.
    //
    // Base64 dekodlash buzuq kirishda JIMGINA bo'sh bufer qaytaradi
    // ("!!!" → 0 bayt). U holda `scrypt(..., keylen: 0)` ham bo'sh
    // bufer beradi va ikki BO'SH bufer `timingSafeEqual` da TENG
    // chiqadi — ya'ni buzuq hash HAR QANDAY parolni qabul qilardi.
    // Aynan shu holat `test/password-format.test.mjs` da ushlangan.
    if (salt.length !== SALT_LEN || expected.length !== KEY_LEN) return false;

    const actual = (await scrypt(String(plain), salt, KEY_LEN)) as Buffer;
    // Doimiy vaqtli — uzunliklar yuqorida tenglashtirilgan.
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
};
