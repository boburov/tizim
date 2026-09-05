import { scrypt as scryptCb, randomBytes } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCb);

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TENANT EGA PAROLI — QAYTARIB BO'LMAYDIGAN HASH
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Format `scrypt$<salt-b64>$<key-b64>` — tenant serveridagi
 * `server/src/common/utils/password.ts` NING AYNI FORMATI. Ikki
 * kodbaza bir xil satrni o'qishi kerak, shuning uchun format shu yerda
 * ham OSHKORA yozilgan; o'zgartirilsa IKKALASI birga o'zgaradi.
 *
 * ── NEGA `bcrypt` EMAS (u admin_server'da BOR) ──
 * Hashni admin_server YOZADI, tenant serveri O'QIYDI. Tenant tomonida
 * `bcrypt` yo'q va uni o'sha yerga qo'shish native modul demak: har
 * VPS'da build vositalari talab qilinardi va deploy sinishi mumkin edi.
 * `scrypt` — ikkala tomonda ham Node'ning o'zida.
 *
 * ── NEGA UMUMAN HASH ──
 * Ilgari ega paroli tenant bazasida OCHIQ MATNDA yotardi va dev panel
 * uni ko'z tugmasi bilan ko'rsatardi. Bitta baza nusxasi sizib chiqsa,
 * HAR BIR markazning to'liq huquqli hisobiga kirish ochilardi. Endi
 * parol tiklab bo'lmaydi — faqat QAYTA O'RNATILADI.
 */

const PREFIX = 'scrypt';
const KEY_LEN = 64;
const SALT_LEN = 16;

export const isTenantPasswordHashed = (stored: unknown): boolean =>
  typeof stored === 'string' && stored.startsWith(`${PREFIX}$`);

export const hashTenantPassword = async (plain: string): Promise<string> => {
  const salt = randomBytes(SALT_LEN);
  const key = (await scrypt(plain, salt, KEY_LEN)) as Buffer;
  return `${PREFIX}$${salt.toString('base64')}$${key.toString('base64')}`;
};

/**
 * Vaqtinchalik parol — admin qayta o'rnatganda BIR MARTA ko'rsatiladi.
 *
 * Chalkashadigan belgilar (0/O, 1/l/I) YO'Q: parol og'zaki yoki
 * xabar orqali uzatiladi va "nol edimi, O edimi" savoli qo'llab-quvvatlash
 * murojaatiga aylanadi.
 */
export const generateTempPassword = (length = 14): string => {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const bytes = randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i += 1) out += alphabet[bytes[i] % alphabet.length];
  // Kamida bitta maxsus belgi — tenant validatori talab qilishi mumkin.
  return `${out.slice(0, length - 1)}!`;
};
