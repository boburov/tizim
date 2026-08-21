/**
 * `helpers/botStatus.helper.js` dan — profil uchun kerak bo'lgan qismi.
 *
 * "blocked" va "not_linked" ATAYLAB ajratilgan: birinchisida odam botni
 * ochgan-u keyin bloklagan (blokdan chiqarishni so'rash kerak),
 * ikkinchisida botni umuman ko'rmagan (havola berish kerak).
 */
export const BOT_STATUS = Object.freeze({
  LINKED: 'linked',
  BLOCKED: 'blocked',
  NOT_LINKED: 'not_linked',
} as const);

export const botStatusOf = (botUser: {
  chatId?: unknown;
  isBlocked?: boolean;
} | null): string => {
  if (!botUser || !botUser.chatId) return BOT_STATUS.NOT_LINKED;
  if (botUser.isBlocked) return BOT_STATUS.BLOCKED;
  return BOT_STATUS.LINKED;
};
