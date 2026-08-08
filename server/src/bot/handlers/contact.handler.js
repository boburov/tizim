import { linkByPhone } from "../services/botUser.service.js";
import { mainMenuFor } from "../keyboards/main.keyboard.js";

const contactHandler = async (bot, msg) => {
  const chatId = msg.chat.id;
  const contact = msg.contact;

  if (!contact || !contact.phone_number) {
    await bot.sendMessage(chatId, "Telefon raqam topilmadi. Qayta urinib ko'ring.");
    return;
  }

  // Faqat o'z kontaktini qabul qilamiz (boshqa odamning kontaktini emas)
  if (contact.user_id && contact.user_id !== msg.from.id) {
    await bot.sendMessage(chatId, "Iltimos, o'zingizning telefon raqamingizni yuboring.");
    return;
  }

  // Bitta raqamga bir nechta profil bog'langan bo'lishi mumkin (ona ikki
  // farzandini bitta raqamdan yozdirgan) - hammasi bog'lanadi.
  const users = await linkByPhone(msg.from.id, contact.phone_number);

  if (users.length === 0) {
    await bot.sendMessage(
      chatId,
      "Bu telefon raqam ro'yxatda topilmadi. Iltimos, administrator bilan bog'laning.",
    );
    return;
  }

  // Menyu OXIRGI bog'langan profil bo'yicha - getLinkedUser() ham aynan
  // shuni (eng yangi bog'lanishni) qaytaradi, ya'ni tugmalar bot keyin
  // ishlatadigan profil bilan mos keladi.
  const primary = users[users.length - 1];
  const others = users.length > 1
    ? `\nBu raqamga ${users.length} ta profil bog'landi: ${users
        .map((u) => `${u.firstName} ${u.lastName}`.trim())
        .join(", ")}.`
    : "";

  await bot.sendMessage(
    chatId,
    `Profilingiz bog'landi. Xush kelibsiz, ${primary.firstName}!${others}`,
    mainMenuFor(primary.role),
  );
};

export default contactHandler;
