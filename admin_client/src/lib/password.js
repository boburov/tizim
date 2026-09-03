/**
 * EGA PAROLI UCHUN GENERATOR.
 *
 * ⚠ Chalkashadigan belgilar ATAYLAB chiqarilgan: `0/O`, `1/l/I`. Parol
 * mijozga telefonda aytiladi yoki qo'lda ko'chiriladi — `l` bilan `1` ni
 * farqlash muammosi qo'llab-quvvatlash chaqiruviga aylanadi.
 *
 * `Math.random()` EMAS: u kriptografik emas va bu parol mijozning butun
 * tizimiga kirish kaliti.
 */
const ALPHABET = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

export const DEFAULT_PASSWORD_LENGTH = 12;

/** Server bilan bir xil chegara (`OWNER_PASSWORD_MIN`). */
export const PASSWORD_MIN = 8;

export function generatePassword(length = DEFAULT_PASSWORD_LENGTH) {
  const bytes = new Uint32Array(length);
  crypto.getRandomValues(bytes);

  let out = '';
  for (let i = 0; i < length; i += 1) {
    out += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return out;
}

/** Server qoidasining nusxasi (`OWNER_USERNAME_RULE`) — formani darhol tekshirish uchun. */
export const USERNAME_RULE = /^[a-z0-9._-]{3,32}$/;
