import type TelegramBot from 'node-telegram-bot-api';

/**
 * `/help` — `server/src/bot/handlers/help.handler.js` KO'CHIRMASI.
 *
 * Matn HAR CHAQIRUVDA yig'iladi (modul yuklanishida emas): brend nomi
 * sozlamadan keladi va test/seed'da almashtirilsa ham to'g'ri chiqishi
 * kerak.
 */
export const helpText = (appName: string): string =>
  [
    `${appName} o'quv markazi boti.`,
    '',
    "Tizimga kirish uchun /start ni bosing va paydo bo'lgan",
    '"🔐 Tizimga kirish" tugmasini bosing - barcha imkoniyatlar mini ilova ichida.',
    '',
    'Buyruqlar:',
    '• /start - botni qayta ishga tushirish',
  ].join('\n');

export const helpHandler = async (
  bot: TelegramBot,
  msg: TelegramBot.Message,
  opts: { appName: string },
): Promise<void> => {
  await bot.sendMessage(msg.chat.id, helpText(opts.appName));
};
