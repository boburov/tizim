import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BOT FOYDALANUVCHISI — `server/src/bot/services/botUser.service.js` dan
 * FAQAT JONLI QISM.
 *
 * ── ⚠ NEGA FAQAT `markBlocked` ──
 *
 * Express'dagi `upsertFromTelegram`, `linkByPhone`, `getLinkedUser`,
 * `setFlowState`/`getFlowState`/`clearFlowState` — hammasi `bot.router.js`
 * da ULANMAGAN handler'lar (`contact`, `myGroup`, `schedule`,
 * `feedbackBot`, ...) tomonidan chaqiriladi. Router esa ataylab faqat
 * `/start` va `/help` ni ro'yxatga oladi:
 *
 *     "bu bot ataylab WebApp-only — barcha funksiyalar mini-ilova ichida"
 *
 * Ya'ni ular Express'da O'LIK KOD. Ularni ko'chirish "arxitektura
 * chiroyligi uchun ko'chirish" bo'lardi: ishlamaydigan kod ikkinchi
 * joyda ham ishlamay yotardi, lekin endi uni ikki joyda qo'llab-quvvatlash
 * kerak bo'lardi.
 *
 * `markBlocked` esa JONLI: uni yetkazish servislari (bildirishnoma va
 * vazifa) 403 xatosida chaqiradi.
 *
 * Telegram bog'lash (`linkTelegram`) ATAYLAB bu yerda emas — u
 * `modules/bot-auth` ning ishi, chunki u autentifikatsiya oqimining
 * qismi va bot ish vaqtiga umuman bog'liq emas.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class BotUserService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Bloklangan deb belgilaydi.
   *
   * ⚠ `updateMany` — `update` EMAS. Bitta Telegram bir nechta `User` ga
   * bog'langan bo'lishi mumkin (ona ikki farzandiga), lekin CHAT bitta:
   * u bloklagan bo'lsa BARCHA bog'lanishlar uchun bloklangan.
   */
  async markBlocked(telegramId: bigint | number | string, isBlocked = true): Promise<void> {
    await this.prisma.botUser.updateMany({
      where: { telegramId: BigInt(telegramId) },
      data: { isBlocked },
    });
  }
}
