/**
 * Maxfiy sozlamalarni bazada shifrlangan holda saqlash (AES-256-GCM).
 *
 * NEGA KERAK: tenant .env ichida Telegram bot tokeni, Gemini API kaliti kabi
 * qiymatlar bor. Ular admin bazasida ochiq yotsa, bitta SQL dump barcha
 * mijozlarning tashqi hisoblarini ochib beradi. GCM tanlangan — u shifrlash
 * bilan birga BUTUNLIGINI ham tekshiradi (tag), ya'ni bazadagi qiymat
 * o'zgartirilsa shifr ochilmaydi.
 *
 * Format: "v1:<iv_b64>:<tag_b64>:<ciphertext_b64>"
 * Versiya prefiksi ataylab bor — kelajakda algoritm almashsa eski yozuvlarni
 * o'qib bo'ladi.
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const PREFIX = 'v1';
const ALGO = 'aes-256-gcm';
const IV_BYTES = 12; // GCM uchun tavsiya etilgan uzunlik

let cachedKey: Buffer | null = null;

/**
 * Shifrlash kaliti — `SETTINGS_ENCRYPTION_KEY` env'dan.
 *
 * 64 ta hex belgi (32 bayt) berilsa aynan o'sha bayt qatori ishlatiladi.
 * Boshqa ko'rinishdagi matn berilsa sha256 orqali 32 baytga keltiriladi —
 * shunda "parolsimon" kalit ham ishlaydi, lekin uzunlik har doim to'g'ri.
 */
function getKey(): Buffer {
  if (cachedKey) return cachedKey;

  const raw = process.env.SETTINGS_ENCRYPTION_KEY || '';
  if (!raw) {
    throw new Error(
      "SETTINGS_ENCRYPTION_KEY .env'da yo'q — maxfiy sozlamalarni shifrlab bo'lmaydi. " +
        'Kalit yarating: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
  }

  cachedKey = /^[0-9a-f]{64}$/i.test(raw)
    ? Buffer.from(raw, 'hex')
    : createHash('sha256').update(raw).digest();

  return cachedKey;
}

/** Kalit sozlanganmi — modul yuklanishida emas, kerak bo'lganda tekshiriladi. */
export function isEncryptionConfigured(): boolean {
  return Boolean(process.env.SETTINGS_ENCRYPTION_KEY);
}

/** Qiymat shu modul yozgan formatdami (eski ochiq yozuvlarni ajratish uchun). */
export function isEncrypted(value: string): boolean {
  return typeof value === 'string' && value.startsWith(`${PREFIX}:`);
}

export function encryptSecret(plain: string): string {
  if (plain === '') return '';

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const data = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    PREFIX,
    iv.toString('base64'),
    tag.toString('base64'),
    data.toString('base64'),
  ].join(':');
}

/**
 * Shifrni ochadi.
 *
 * ESKI OCHIQ QIYMATLAR: shifrlash joriy qilinishidan oldin yozilgan
 * `botToken` kabi qiymatlar bazada ochiq yotibdi. Ular `v1:` bilan
 * boshlanmaydi — shunday qiymat shundayligicha qaytariladi, aks holda
 * mavjud tenantlar sozlamasi o'qib bo'lmas holga tushardi. Yangi yozuvda
 * esa doim shifrlanadi, ya'ni vaqt o'tishi bilan ochiq qiymat qolmaydi.
 */
export function decryptSecret(stored: string): string {
  if (!stored) return '';
  if (!isEncrypted(stored)) return stored;

  const [, ivB64, tagB64, dataB64] = stored.split(':');
  if (!ivB64 || !tagB64 || !dataB64) {
    throw new Error("Maxfiy qiymat formati buzuq — shifrni ochib bo'lmadi");
  }

  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));

  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, 'base64')),
    decipher.final(),
  ]).toString('utf8');
}

/**
 * Qiymatning barmoq izi — "o'zgardimi?" savoliga javob berish uchun.
 *
 * Qo'llangan konfiguratsiya surati (`Tenant.appliedConfig`) maxfiy
 * qiymatlarni AYNAN saqlamaydi: sirni ikki joyda tutish xavfni ikki
 * baravar oshiradi. O'rniga shu hash yoziladi — farqni ko'rsatish uchun
 * yetarli, sirni tiklash uchun esa yaroqsiz.
 */
export function fingerprint(value: string): string {
  return createHash('sha256').update(value || '').digest('hex').slice(0, 16);
}

/** UI'ga ko'rsatish uchun niqob: "1234:AB…xyz" emas, "••••1234". */
export function maskSecret(plain: string): string {
  if (!plain) return '';
  const tail = plain.slice(-4);
  return `••••${tail}`;
}
