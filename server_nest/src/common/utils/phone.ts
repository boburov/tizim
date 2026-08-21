/** `server/src/utils/phone.js` ning aynan ko'chirmasi. */

/** Telefon raqamni kanonik formatga keltiradi: 998XXXXXXXXX (12 raqam). */
export const normalizePhone = (raw: unknown): string | null => {
  if (raw == null) return null;
  const digits = String(raw).replace(/\D+/g, '');
  if (!digits) return null;

  let normalized = digits;
  if (normalized.length === 9) normalized = `998${normalized}`;
  if (normalized.length === 12 && normalized.startsWith('998')) return normalized;

  return null;
};

export const isPhoneLike = (raw: unknown): boolean =>
  /^[\d+\-()\s]+$/.test(String(raw || ''));
