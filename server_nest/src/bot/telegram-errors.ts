/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TELEGRAM XATO TASNIFI.
 *
 * Express'da bu to'rt yordamchi IKKI faylda (`notificationDeliver` va
 * `assignmentDeliver`) BELGIMA-BELGI takrorlangan. Bu yerda bitta joyda:
 * ular yetkazishning eng nozik qarorini — "qayta urinamizmi yoki
 * foydalanuvchini bloklangan deb belgilaymizmi" — hal qiladi va ikki
 * nusxa muqarrar ravishda bir-biridan uzoqlashardi.
 *
 * ⚠ SHARTLAR AYNAN KO'CHIRILGAN. Ular Telegram API xulqiga bog'liq va
 * "soddalashtirish" ularni buzadi:
 *   • 403 YOKI matnda "bot was blocked / user is deactivated /
 *     chat not found / bot can't initiate" → TERMINAL, qayta urinilmaydi;
 *   • 429 → `retry_after` kutiladi va BIR MARTA qayta uriniladi;
 *   • qolgani → o'tkinchi (transient) yoki sabab bilan qaytadi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface TelegramApiError {
  message?: string;
  response?: {
    statusCode?: number;
    body?: {
      description?: string;
      parameters?: { retry_after?: number };
    };
  };
}

export const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms));

/**
 * Foydalanuvchi botni bloklaganmi / hisob o'chirilganmi.
 *
 * ⚠ TERMINAL XATO: qayta urinish HECH QACHON yordam bermaydi va faqat
 * navbatni bekorga band qiladi. Bunday holatda `bot_users.isBlocked`
 * qo'yiladi, ya'ni keyingi safar umuman urinilmaydi.
 */
export const isBlockedError = (err: TelegramApiError): boolean => {
  const status = err?.response?.statusCode;
  const desc = String(err?.response?.body?.description || err?.message || '');
  return (
    status === 403 ||
    /bot was blocked|user is deactivated|chat not found|bot can't initiate/i.test(desc)
  );
};

export const isRateLimited = (err: TelegramApiError): boolean =>
  err?.response?.statusCode === 429;

/** Telegram aytgan kutish vaqti (soniya). Aytilmagan bo'lsa 0. */
export const retryAfterOf = (err: TelegramApiError): number =>
  Number(err?.response?.body?.parameters?.retry_after) || 0;

/** ⚠ Chegara 5 soniya: undan uzun kutish worker slotini band qilib turardi. */
export const retryWaitMs = (err: TelegramApiError): number =>
  Math.min((retryAfterOf(err) || 1) * 1000, 5000);

export const reasonOf = (err: TelegramApiError): string =>
  err?.response?.body?.description || err?.message || 'send-failed';
