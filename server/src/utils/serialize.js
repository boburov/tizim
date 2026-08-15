// ═══════════════════════════════════════════════════════════════════════════
// KLIENT SHARTNOMASINI SAQLASH: `_id` taxallusi.
//
// MUAMMO: MongoDB hujjatlari `_id` maydoni bilan qaytardi va butun
// frontend (client/ va admin_client/) shu nom bo'yicha yozilgan —
// `item._id`, `key={u._id}`, `/users/${u._id}` va h.k.
// Prisma esa `id` qaytaradi.
//
// Agar javob to'g'ridan-to'g'ri berilsa, frontend'da hamma joyda
// `undefined` paydo bo'lardi: ro'yxatlar bo'sh key bilan render bo'lib,
// havolalar `/users/undefined` ga ketardi.
//
// YECHIM: javob chegarasida `_id` qo'shiladi (`id` ham qoladi). Shunda
// backend migratsiyasi frontend uchun KO'RINMAS bo'ladi va ikkalasini
// bir vaqtda qayta yozish shart emas.
//
// Bu VAQTINCHA moslik qatlami. Frontend `id` ga o'tgach olib tashlanadi.
// ═══════════════════════════════════════════════════════════════════════════

/** Bitta yozuvga `_id` taxallusini qo'shadi. */
export const withLegacyId = (entity) => {
  if (!entity || typeof entity !== "object") return entity;
  if (Array.isArray(entity)) return entity.map(withLegacyId);
  if (entity.id === undefined || entity._id !== undefined) return entity;
  return { ...entity, _id: entity.id };
};

/** Ro'yxat uchun qulaylik. */
export const withLegacyIds = (list = []) => list.map(withLegacyId);

export default withLegacyId;
