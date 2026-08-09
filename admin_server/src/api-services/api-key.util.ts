/**
 * API kalitlarini yaratish va tekshirish.
 *
 * NEGA HASH: to'liq kalit bazada saqlanmaydi. Bitta SQL dump sizib chiqsa,
 * u bilan xizmatga kirib bo'lmasligi kerak — parollarda qanday bo'lsa, shunday.
 *
 * Format: `pk_<8 belgi prefiks>.<43 belgi sir>`
 *
 * Prefiks nima uchun kerak: hash bo'yicha qidirish uchun butun jadvalni
 * skanerlash kerak bo'lardi. Prefiks unique indeks — bitta so'rovda topiladi,
 * keyin sir hash orqali timing-safe solishtiriladi.
 *
 * Hash sifatida oddiy sha256 yetadi (bcrypt emas): kalit — 32 bayt tasodifiy
 * qiymat, lug'at hujumi mumkin emas, sekin hash esa har so'rovga qimmatga
 * tushardi.
 */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/** Kalitning tashqi ko'rinishini belgilaydigan qism. */
const PUBLIC_PREFIX = 'pk_';
/** Prefiksdagi tasodifiy qism (bayt). 4 bayt = 8 hex belgi. */
const PREFIX_BYTES = 4;
/** Sirning uzunligi (bayt). 32 bayt = 256 bit entropiya. */
const SECRET_BYTES = 32;

export interface GeneratedApiKey {
  /** Faqat SHU YERDA va javobda bir marta ko'rinadi — keyin tiklab bo'lmaydi. */
  plaintext: string;
  /** Bazaga yoziladi, UI da ko'rsatiladi. */
  prefix: string;
  /** Bazaga yoziladi. */
  hash: string;
}

/** Yangi kalit yaratadi. */
export function generateApiKey(): GeneratedApiKey {
  const prefix = PUBLIC_PREFIX + randomBytes(PREFIX_BYTES).toString('hex');
  const secret = randomBytes(SECRET_BYTES).toString('base64url');
  const plaintext = `${prefix}.${secret}`;
  return { plaintext, prefix, hash: hashApiKey(plaintext) };
}

/** Kalit hash'i. Prefiks ham hash'ga kiradi — shunda sir boshqa prefiks
 *  bilan qayta ishlatilmaydi. */
export function hashApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex');
}

/**
 * Kalitni prefiks va sirga ajratadi. Shakli noto'g'ri bo'lsa null.
 * Bazaga bormasdan oldin arzon filtr.
 */
export function parseApiKey(raw: string): { prefix: string } | null {
  if (typeof raw !== 'string') return null;
  const value = raw.trim();
  const dot = value.indexOf('.');
  if (dot < 1) return null;

  const prefix = value.slice(0, dot);
  const secret = value.slice(dot + 1);
  if (!prefix.startsWith(PUBLIC_PREFIX) || secret.length < 20) return null;
  if (!/^pk_[0-9a-f]{8}$/.test(prefix)) return null;

  return { prefix };
}

/**
 * Ikki hex qatorni vaqt bo'yicha bir xil davomiylikda solishtiradi.
 * Oddiy `===` kalitni belgima-belgi topib olish imkonini berardi.
 */
export function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/** UI da ko'rsatish uchun: "pk_a1b2c3d4.••••••••" */
export function maskApiKey(prefix: string): string {
  return `${prefix}.${'•'.repeat(8)}`;
}
