import BotUser from "../models/botUser.model.js";

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

/** BotUser hujjatidan holatni chiqaradi (hujjat yo'q bo'lsa - not_linked). */
export const botStatusOf = (botUser) => {
  if (!botUser || !botUser.chatId) return BOT_STATUS.NOT_LINKED;
  if (botUser.isBlocked) return BOT_STATUS.BLOCKED;
  return BOT_STATUS.LINKED;
};

/** Xabar/vazifa shu holatda yetib boradimi. */
export const isDeliverable = (status) => status === BOT_STATUS.LINKED;

// Bitta so'rovda kerakli maydonlar - hamma chaqiruvchi bir xil olsin.
export const BOT_PROJECTION = {
  user: 1,
  chatId: 1,
  telegramId: 1,
  username: 1,
  firstName: 1,
  lastName: 1,
  isBlocked: 1,
  lastSeenAt: 1,
};

/**
 * Ko'p foydalanuvchi uchun bot holatini BITTA so'rovda oladi (N+1 yo'q).
 * Qaytadi: Map<userId(string), { ...botUser, status }>
 */
export const fetchBotStatusMap = async (userIds) => {
  const ids = [...new Set((userIds || []).map(String))].filter(Boolean);
  if (!ids.length) return new Map();

  const bots = await BotUser.find({ user: { $in: ids } }, BOT_PROJECTION).lean();
  return new Map(
    bots.map((b) => [String(b.user), { ...b, status: botStatusOf(b) }]),
  );
};

/**
 * Foydalanuvchi obyektlariga `telegram` maydonini biriktiradi.
 * Bog'lanmagan bo'lsa telegram: null, lekin `botStatus` HAR DOIM bo'ladi -
 * UI "bog'lanmagan"ni ham holat sifatida ko'rsatishi kerak.
 */
export const attachBotStatus = async (userObjs = []) => {
  const map = await fetchBotStatusMap(userObjs.map((u) => u?._id));
  for (const u of userObjs) {
    if (!u) continue;
    const bot = map.get(String(u._id));
    u.telegram = bot
      ? {
          telegramId: bot.telegramId,
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
