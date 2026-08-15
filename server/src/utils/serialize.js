// ═══════════════════════════════════════════════════════════════════════════
// KLIENT SHARTNOMASINI SAQLASH: `_id` taxallusi va populate shakli.
//
// MUAMMO: MongoDB hujjatlari `_id` bilan qaytardi va butun frontend
// (client/ va admin_client/) shu nom bo'yicha yozilgan — `item._id`,
// `key={u._id}`, `/users/${u._id}`. Prisma esa `id` qaytaradi.
//
// Javob chegarasida `_id` qo'shiladi (`id` ham qoladi), shunda backend
// migratsiyasi frontend uchun KO'RINMAS bo'ladi.
//
// Bu VAQTINCHA moslik qatlami. Frontend `id` ga o'tgach olib tashlanadi.
// ═══════════════════════════════════════════════════════════════════════════

// Faqat ODDIY obyektga kiramiz. Date, Decimal, Buffer kabi sinf
// nusxalarini tarqatib yuborish ({...date}) ularni BUZADI — sana bo'sh
// obyektga aylanib, JSON'da `{}` bo'lib chiqardi.
const isPlainObject = (v) =>
  v !== null &&
  typeof v === "object" &&
  !Array.isArray(v) &&
  (Object.getPrototypeOf(v) === Object.prototype ||
    Object.getPrototypeOf(v) === null);

/**
 * `_id` taxallusini CHUQUR qo'shadi — ichki relation'larga ham.
 *
 * NEGA CHUQUR: Mongoose `.populate("requestedBy", {firstName: 1, ...})`
 * ichki hujjatni HAR DOIM `_id` bilan qaytarardi (inclusive projection
 * `_id` ni o'chirmaydi). Prisma `include: { requestedBy: { select: {...} } }`
 * esa faqat so'ralgan ustunlarni beradi.
 *
 * Yuzaki versiya `approval.requestedBy._id` ni `undefined` qoldirardi va
 * klientdagi `String(a.requestedBy?._id || a.requestedBy) === String(user._id)`
 * solishtiruvi `"[object Object]"` bilan taqqoslanib, HECH QACHON
 * to'g'ri kelmasdi — ya'ni "o'z so'rovimni bekor qilish" tugmasi umuman
 * chiqmasdi, o'z so'roviga esa "Tasdiqlash" ko'rinardi.
 */
export const withLegacyId = (entity) => {
  if (Array.isArray(entity)) return entity.map(withLegacyId);
  if (!isPlainObject(entity)) return entity;

  const out = {};
  for (const [k, v] of Object.entries(entity)) {
    out[k] = Array.isArray(v) || isPlainObject(v) ? withLegacyId(v) : v;
  }
  if (out.id !== undefined && out._id === undefined) out._id = out.id;
  return out;
};

/** Ro'yxat uchun qulaylik. */
export const withLegacyIds = (list = []) => list.map(withLegacyId);

/**
 * POPULATE SHAKLINI TIKLAYDI.
 *
 * Mongo `.populate("branchId")` maydonning O'ZINI obyektga aylantirardi:
 *     { branchId: { _id, name, code } }
 *
 * Prisma esa `branchId` ni skalyar satr qoldirib, obyektni ALOHIDA
 * nomga qo'yadi:
 *     { branchId: "6a80...", branch: { id, name, code } }
 *
 * Frontend `row.branchId?.name` o'qiydi va `undefined` oladi — jadvalda
 * "Filial" ustuni bo'sh qoladi. Bu funksiya relation'ni eski nomga
 * qaytaradi.
 *
 * @param {object} row - Prisma yozuvi
 * @param {Record<string,string>} map - { relationNomi: eskiMaydonNomi }
 *        masalan { branch: "branchId", assignee: "assigneeId" }
 */
export const withPopulatedShape = (row, map) => {
  if (!row) return row;
  const out = withLegacyId(row);
  for (const [relation, legacyField] of Object.entries(map)) {
    if (row[relation] !== undefined) {
      out[legacyField] = row[relation] ? withLegacyId(row[relation]) : null;
    }
  }
  return out;
};

export default withLegacyId;
