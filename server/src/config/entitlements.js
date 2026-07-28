import logger from "./logger.js";

/**
 * Tenant serverdagi limitlar keshi.
 *
 * Limitlar admin serverdan heartbeat javobi orqali keladi va shu yerda
 * saqlanadi. Tekshiruv MAHALLIY bo'ladi — ya'ni admin server o'chib qolsa
 * ham tenant ishlashda davom etadi (oxirgi ma'lum limitlar bilan).
 *
 * -1 = cheksiz. Limit umuman kelmagan bo'lsa ham cheksiz deb hisoblaymiz,
 * chunki aks holda admin server bilan aloqa yo'qolganda tenant o'z
 * foydalanuvchilarini bloklab qo'yardi — bu qabul qilib bo'lmaydigan holat.
 */

const UNLIMITED = -1;

let state = {
  planKey: null,
  subscriptionActive: true,
  limits: {},
  exceeded: [],
  updatedAt: null,
};

export function setEntitlements(payload) {
  if (!payload || typeof payload !== "object") return;
  state = {
    planKey: payload.planKey ?? null,
    subscriptionActive: payload.subscriptionActive !== false,
    limits: payload.limits && typeof payload.limits === "object" ? payload.limits : {},
    exceeded: Array.isArray(payload.exceeded) ? payload.exceeded : [],
    updatedAt: new Date(),
  };
  logger.debug({ planKey: state.planKey }, "Entitlements yangilandi");
}

export function getEntitlements() {
  return state;
}

/** Raqamli limit qiymati. Kelmagan bo'lsa cheksiz. */
export function getLimit(key) {
  const v = state.limits[key];
  return typeof v === "number" ? v : UNLIMITED;
}

/** BOOLEAN imkoniyat yoqilganmi (masalan telegram_bot). */
export function isFeatureEnabled(key) {
  const v = state.limits[key];
  // Kelmagan bo'lsa — yoqilgan deb hisoblaymiz (aloqa yo'qolganda bloklamaymiz)
  if (typeof v !== "number") return true;
  return v > 0;
}

/**
 * Limit oshganmi. `current` — hozirgi son.
 * Yangi yozuv qo'shishdan OLDIN chaqiriladi, shuning uchun >= tekshiruvi.
 */
export function isLimitExceeded(key, current) {
  const limit = getLimit(key);
  if (limit === UNLIMITED) return false;
  return Number(current) >= limit;
}

export { UNLIMITED };
