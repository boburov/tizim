import prisma from "../../config/prisma.js";
import { normalizePhone } from "../../utils/phone.js";

// BigInt serialization xatolarini oldini olish uchun yordamchi
const toNumber = (val) => (val != null ? Number(val) : null);

export const upsertFromTelegram = async (from, chatId) => {
  if (!from?.id) return null;
  
  const telegramId = BigInt(from.id);
  const update = {
    chatId: BigInt(chatId),
    username: from.username ? from.username.toLowerCase() : null,
    firstName: from.first_name || "",
    lastName: from.last_name || "",
    languageCode: from.language_code || "uz",
    isBot: Boolean(from.is_bot),
    isBlocked: false, // foydalanuvchi qayta yozdi → blok bekor qilinadi
    lastSeenAt: new Date(),
  };

  // Bir xil telegramId bir nechta hujjatda bo'lishi mumkin (har biri boshqa user) -
  // hammasi BIR XIL chat bo'lgani uchun chat holatini hammasiga yozamiz.
  await prisma.botUser.updateMany({
    where: { telegramId },
    data: update,
  });

  // Hech qaysi hujjat bo'lmasa (birinchi /start, hali bog'lanmagan) - bittasini yaratamiz.
  let botUser = await prisma.botUser.findFirst({
    where: { telegramId },
  });

  if (!botUser) {
    botUser = await prisma.botUser.create({
      data: {
        telegramId,
        ...update,
      },
    });
  }

  // Qaytgan obyektda BigInt larni oddiy songa aylantirib qaytaramiz (moslik uchun)
  return {
    ...botUser,
    telegramId: toNumber(botUser.telegramId),
    chatId: toNumber(botUser.chatId),
  };
};

// Bir xil telegramId barcha hujjatlarini bir xil blok holatiga keltiramiz.
export const markBlocked = async (telegramId, isBlocked = true) => {
  await prisma.botUser.updateMany({
    where: { telegramId: BigInt(telegramId) },
    data: { isBlocked },
  });
};

// Telegram contact orqali yuborilgan telefonni User.phone bilan moslashtiradi.
export const linkByPhone = async (telegramId, rawPhone) => {
  const phone = normalizePhone(rawPhone);
  if (!phone) return [];

  const users = await prisma.user.findMany({
    where: { phone, isActive: true },
  });
  if (users.length === 0) return [];

  const tid = BigInt(telegramId);
  const existing = await prisma.botUser.findFirst({
    where: { telegramId: tid },
  });

  for (const user of users) {
    const found = await prisma.botUser.findFirst({
      where: { telegramId: tid, userId: String(user.id) },
    });

    if (found) {
      // Shunchaki o'zini yangilab qo'yamiz (upsert: update)
      await prisma.botUser.update({
        where: { id: found.id },
        data: { userId: String(user.id) },
      });
    } else {
      // Yaratamiz (upsert: insert)
      await prisma.botUser.create({
        data: {
          telegramId: tid,
          chatId: existing?.chatId ?? tid,
          userId: String(user.id),
        },
      });
    }
  }
  return users;
};

// Bitta Telegram bir nechta userga bog'langan bo'lishi mumkin - oxirgi (eng yangi)
// bog'langan, aktiv userni qaytaramiz (bot DM buyruqlari uchun).
export const getLinkedUser = async (telegramId) => {
  const botUser = await prisma.botUser.findFirst({
    where: {
      telegramId: BigInt(telegramId),
      userId: { not: null },
    },
    orderBy: { updatedAt: "desc" },
    include: { user: true },
  });

  if (!botUser || !botUser.user || !botUser.user.isActive) return null;
  return botUser.user;
};

// Chatdagi BARCHA bog'lanishlarni uzadi (shu telegramId bo'yicha har bir hujjat).
export const unlink = async (telegramId) => {
  await prisma.botUser.updateMany({
    where: { telegramId: BigInt(telegramId) },
    data: { userId: null },
  });
};

const FLOW_TTL_MS = 30 * 60 * 1000;

// FlowState chatga tegishli (userga emas). Bir xil telegramId bir nechta hujjatda
// bo'lishi mumkin - izchillik uchun barchasiga BIR XIL flowState yozamiz.
export const setFlowState = async (telegramId, partial) => {
  const expiresAt = new Date(Date.now() + FLOW_TTL_MS);
  const flowState = { ...partial, expiresAt };
  
  await prisma.botUser.updateMany({
    where: { telegramId: BigInt(telegramId) },
    data: { flowState },
  });
};

// FlowState olish (expire bo'lsa avto-clear va null qaytadi). Barcha hujjatlarda
// bir xil bo'lgani uchun istalganidan o'qiymiz.
export const getFlowState = async (telegramId) => {
  const bu = await prisma.botUser.findFirst({
    where: { telegramId: BigInt(telegramId) },
  });
  
  if (!bu?.flowState) return null;
  
  // flowState JSON ustuni, JS obyekt sifatida o'qiladi
  if (
    bu.flowState.expiresAt &&
    new Date(bu.flowState.expiresAt).getTime() < Date.now()
  ) {
    await clearFlowState(telegramId);
    return null;
  }
  return bu.flowState;
};

export const clearFlowState = async (telegramId) => {
  await prisma.botUser.updateMany({
    where: { telegramId: BigInt(telegramId) },
    data: { flowState: null }, // Json nullable bo'lsa null qabul qiladi (Prisma.DbNull ham ishlatiladi lekin schema 'Json?' deydi, 'null' yozish mumkin)
  });
};
