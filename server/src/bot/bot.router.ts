import { Logger } from '@nestjs/common';
import type TelegramBot from 'node-telegram-bot-api';
import { startHandler } from './handlers/start.handler.js';
import { helpHandler } from './handlers/help.handler.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BUYRUQLAR — `server/src/bot/bot.router.js` KO'CHIRMASI.
 *
 * ⚠ YUZA ATAYLAB TOR: faqat `/start`, `/help` va boshqa matnga qisqa
 * eslatma. Express'dagi `myAttendance` / `myGroups` / `schedule` /
 * `teacherAttendance` / `groupStudents` / `contact` / `feedbackBot`
 * handler'lari O'SHA YERDA HAM ulanmagan — bot WebApp-only.
 *
 * Ularni bu yerda "tiklash" ko'chirish emas, YANGI FUNKSIYA bo'lardi:
 * ular hech qachon ishlab ko'rilmagan, mini-ilova bilan takrorlanadi va
 * o'zlari ko'chirilmagan modullarga (guruhlar, davomat, feedback)
 * tayanadi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const logger = new Logger('Bot');

/**
 * Handler'ni xatodan himoyalaydi.
 *
 * ⚠ XATO YUTILADI VA FOYDALANUVCHIGA XABAR BERILADI. Bu HTTP emas:
 * tashlangan xato hech kimga ko'rinmaydi va odam bot "javob bermadi"
 * deb qoladi. Express'dagi matn AYNAN saqlangan.
 */
const safe =
  (bot: TelegramBot, fn: (msg: TelegramBot.Message) => Promise<void>) =>
  async (msg: TelegramBot.Message): Promise<void> => {
    try {
      await fn(msg);
    } catch (err) {
      logger.error(`Bot handler xatosi (chat ${msg?.chat?.id})`, err as Error);
      if (msg?.chat?.id) {
        await bot
          .sendMessage(
            msg.chat.id,
            "Kechirasiz, xatolik yuz berdi. Birozdan keyin urinib ko'ring.",
          )
          .catch(() => null);
      }
    }
  };

export const registerHandlers = (
  bot: TelegramBot,
  opts: { appName: string; webAppUrl: string },
): void => {
  bot.onText(/^\/start(?:\s|$)/, safe(bot, (msg) => startHandler(bot, msg, opts)));
  bot.onText(/^\/help(?:\s|$)/, safe(bot, (msg) => helpHandler(bot, msg, opts)));

  // Boshqa har qanday matnga — qisqa eslatma.
  bot.on('message', async (msg: TelegramBot.Message) => {
    if (!msg?.text) return;
    if (msg.text.startsWith('/')) return; // `/start` va `/help` yuqorida
    try {
      await bot.sendMessage(msg.chat.id, "Tizimga kirish uchun /start ni bosing.");
    } catch {
      /* noop */
    }
  });

  bot.on('polling_error', (err: Error) => logger.error('Telegram polling xatosi', err));
  bot.on('webhook_error', (err: Error) => logger.error('Telegram webhook xatosi', err));

  // ⚠ Bloklangan (403) foydalanuvchini belgilash BU YERDA EMAS —
  // yetkazish nuqtasida (`deliverToChat`), chunki faqat o'sha yerda
  // `telegramId` ishonchli ma'lum. Bu generic hodisada u yo'q.
  bot.on('error', (err: Error) => logger.error('Bot umumiy xato', err));
};
