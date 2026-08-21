import env from "../../config/env.js";

// Brend nomi env'dan keladi (env.APP_NAME), shuning uchun matn modul yuklanishida
// emas, har chaqiruvda yig'iladi - test/seed'da env almashtirilsa ham to'g'ri chiqadi.
const helpText = () =>
  [
    `${env.APP_NAME} o'quv markazi boti.`,
    "",
    "Tizimga kirish uchun /start ni bosing va paydo bo'lgan",
    '"🔐 Tizimga kirish" tugmasini bosing - barcha imkoniyatlar mini ilova ichida.',
    "",
    "Buyruqlar:",
    "• /start - botni qayta ishga tushirish",
  ].join("\n");

const helpHandler = async (bot, msg) => {
  await bot.sendMessage(msg.chat.id, helpText());
};

export default helpHandler;
