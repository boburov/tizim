import type TelegramBot from 'node-telegram-bot-api';

/**
 * `/start` — `server/src/bot/handlers/start.handler.js` KO'CHIRMASI.
 *
 * ⚠ MATN VA TUGMA AYNAN SAQLANGAN. Bot bitta — foydalanuvchi qaysi
 * ilova javob berganini bilmaydi va bilmasligi ham kerak. Matn farq
 * qilsa cutover paytida odamlar "bot o'zgaribdi" deb o'ylardi.
 *
 * Bot ATAYLAB "WebApp-only": barcha funksiyalar mini-ilova ichida,
 * shuning uchun yagona harakat — WebApp tugmasi.
 */
export const startHandler = async (
  bot: TelegramBot,
  msg: TelegramBot.Message,
  opts: { appName: string; webAppUrl: string },
): Promise<void> => {
  const chatId = msg.chat.id;
  const name = msg.from?.first_name || 'foydalanuvchi';

  await bot.sendMessage(
    chatId,
    [
      `Assalomu alaykum, ${name}!`,
      '',
      `"${opts.appName}" o'quv markazi tizimiga xush kelibsiz.`,
      "Davom etish uchun pastdagi tugmani bosing.",
    ].join('\n'),
    {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🔐 Tizimga kirish', web_app: { url: opts.webAppUrl } }],
        ],
      },
    },
  );
};
