/**
 * `server/src/utils/serialize.js` NING KO'CHIRMASI — `_id` taxallusi.
 *
 * MongoDB hujjatlari `_id` bilan qaytardi va butun frontend shu nom
 * bo'yicha yozilgan (`item._id`, `key={u._id}`, `/users/${u._id}`).
 * Prisma esa `id` qaytaradi.
 *
 * ⚠ BU GLOBAL INTERSEPTOR EMAS — VA BO'LMASLIGI KERAK.
 * Express'da u 61 ta faylda HANDLER darajasida chaqiriladi. Global
 * qilinsa `_id` bugun YO'Q bo'lgan javoblarga ham qo'shilardi, ya'ni
 * shartnoma o'zgarardi. Ko'chirishda ham aynan o'sha joylarda
 * chaqiriladi.
 */

// Faqat ODDIY obyektga kiramiz. Date, Decimal, Buffer kabi sinf
// nusxalarini tarqatib yuborish ({...date}) ularni BUZADI — sana bo'sh
// obyektga aylanib, JSON'da `{}` bo'lib chiqardi.
const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  v !== null &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  (Object.getPrototypeOf(v) === Object.prototype ||
    Object.getPrototypeOf(v) === null);

/**
 * `_id` taxallusini CHUQUR qo'shadi — ichki relation'larga ham.
 *
 * NEGA CHUQUR: Mongoose `.populate()` ichki hujjatni HAR DOIM `_id` bilan
 * qaytarardi. Yuzaki versiya `approval.requestedBy._id` ni `undefined`
 * qoldirardi va klientdagi solishtiruv HECH QACHON to'g'ri kelmasdi —
 * ya'ni "o'z so'rovimni bekor qilish" tugmasi umuman chiqmasdi.
 */
export const withLegacyId = <T>(entity: T): T => {
  if (Array.isArray(entity)) return entity.map(withLegacyId) as unknown as T;
  if (!isPlainObject(entity)) return entity;

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(entity)) {
    out[k] = Array.isArray(v) || isPlainObject(v) ? withLegacyId(v) : v;
  }
  if (out.id !== undefined && out._id === undefined) out._id = out.id;
  return out as unknown as T;
};

/** Ro'yxat uchun qulaylik. */
export const withLegacyIds = <T>(list: T[]): T[] => list.map(withLegacyId);

export default withLegacyId;
