import prisma from "../config/prisma.js";

/**
 * FOYDALANUVCHINING BOT HOLATI.
 *
 *   linked      - bot bog'langan va ishlaydi, xabar yetadi;
 *   blocked     - botni BLOKLAGAN (yoki hisobini o'chirgan) - yetmaydi;
 *   not_linked  - botga umuman kirmagan - yetmaydi.
 *
 * "blocked" va "not_linked" ATAYLAB ajratilgan: birinchisida odam bir marta
 * botni ochgan-u keyin bloklagan (undan blokdan chiqarishni so'rash kerak),
 * ikkinchisida esa botni umuman ko'rmagan (unga havola berish kerak).
 * Bitta "yetmaydi" degan holat bu ikki turli ishni bir-biriga qo'shib
 * yuborardi va hech kim nima qilishni bilmasdi.
 */
export const BOT_STATUS = Object.freeze({
  LINKED: "linked",
  BLOCKED: "blocked",
  NOT_LINKED: "not_linked",
});

/** BotUser yozuvidan holatni chiqaradi (yozuv yo'q bo'lsa - not_linked). */
export const botStatusOf = (botUser) => {
  if (!botUser || !botUser.chatId) return BOT_STATUS.NOT_LINKED;
  if (botUser.isBlocked) return BOT_STATUS.BLOCKED;
  return BOT_STATUS.LINKED;
};

/** Xabar/vazifa shu holatda yetib boradimi. */
export const isDeliverable = (status) => status === BOT_STATUS.LINKED;

// Bitta so'rovda kerakli maydonlar - hamma chaqiruvchi bir xil olsin.
//
// Mongo'da bu `{ user: 1, ... }` proyeksiyasi edi; Prisma'da `select`.
// Nom saqlangan, lekin `user` → `userId` (Prisma'da `user` bu RELATION).
export const BOT_PROJECTION = {
  id: true,
  userId: true,
  chatId: true,
  telegramId: true,
  username: true,
  firstName: true,
  lastName: true,
  isBlocked: true,
  lastSeenAt: true,
};

/**
 * Ko'p foydalanuvchi uchun bot holatini BITTA so'rovda oladi (N+1 yo'q).
 * Qaytadi: Map<userId(string), { ...botUser, status }>
 */
export const fetchBotStatusMap = async (userIds) => {
  const ids = [...new Set((userIds || []).map(String))].filter(Boolean);
  if (!ids.length) return new Map();

  const bots = await prisma.botUser.findMany({
    where: { userId: { in: ids } },
    select: BOT_PROJECTION,
  });
  return new Map(
    bots.map((b) => [String(b.userId), { ...b, status: botStatusOf(b) }]),
  );
};

/**
 * Foydalanuvchi obyektlariga `telegram` maydonini biriktiradi.
 * Bog'lanmagan bo'lsa telegram: null, lekin `botStatus` HAR DOIM bo'ladi -
 * UI "bog'lanmagan"ni ham holat sifatida ko'rsatishi kerak.
 *
 * `u.id ?? u._id`: chaqiruvchilarning bir qismi hali Mongoose shaklidagi
 * obyekt uzatadi (`_id`), ko'chirilganlari esa Prisma shaklida (`id`).
 * Faqat bittasiga tayanish jimgina bo'sh Map berardi - ya'ni HAMMA
 * foydalanuvchi "botga ulanmagan" bo'lib ko'rinardi.
 */
export const attachBotStatus = async (userObjs = []) => {
  const idOf = (u) => u?.id ?? u?._id;
  const map = await fetchBotStatusMap(userObjs.map(idOf));
  for (const u of userObjs) {
    if (!u) continue;
    const bot = map.get(String(idOf(u)));
    u.telegram = bot
      ? {
          // telegramId Postgres'da BigInt - JSON.stringify uni seriyalay
          // OLMAYDI va javob 500 bilan yiqilardi. Klient raqam kutadi.
          telegramId: Number(bot.telegramId),
          username: bot.username || null,
          firstName: bot.firstName || "",
          lastName: bot.lastName || "",
          isBlocked: !!bot.isBlocked,
          lastSeenAt: bot.lastSeenAt || null,
          status: bot.status,
        }
      : null;
    u.botStatus = bot?.status || BOT_STATUS.NOT_LINKED;
  }
  return userObjs;
};
