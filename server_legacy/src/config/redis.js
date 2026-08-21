import IORedis from "ioredis";
import env from "./env.js";
import logger from "./logger.js";

/**
 * REDIS ULANISHI - faqat ommaviy import navbati uchun.
 *
 * IXTIYORIY BOG'LIQLIK. REDIS_URL bo'sh bo'lsa bu modul null qaytaradi
 * va tizim navbatsiz (sinxron, qattiq qator chegarasi bilan) ishlaydi.
 * Redis'ni majburiy qilish mavjud o'rnatmalarni upgrade'dan keyin
 * ishga tushmaydigan qilib qo'yardi - moliyaviy tizimda bu qabul
 * qilinmaydi.
 *
 * DIQQAT: bu ulanish AGENDA'ni ALMASHTIRMAYDI. Rejali (cron) ishlar
 * avvalgidek Agenda + MongoDB'da qoladi. Redis bu yerda faqat BITTA
 * vazifa uchun: foydalanuvchi boshlagan uzoq importni HTTP so'rovidan
 * ajratib olish.
 */

// BullMQ TALABI: maxRetriesPerRequest null bo'lishi SHART.
// Aks holda ioredis uzilish paytida so'rovni "MaxRetriesPerRequestError"
// bilan rad etadi va worker JIMGINA o'ladi - import esa "ishlamoqda"
// holatida abadiy osilib qolardi.
const CONNECTION_OPTS = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  // Ulanish yo'qolsa cheksiz emas, o'sib boruvchi kechikish bilan urinadi.
  retryStrategy: (times) => Math.min(times * 500, 10_000),
};

let client = null;
let warned = false;

export const isRedisEnabled = () => Boolean(env.REDIS_URL);

/**
 * Umumiy ulanish (queue va worker bir xil ulanishdan foydalanadi).
 * Redis sozlanmagan bo'lsa null.
 */
export const getRedis = () => {
  if (!isRedisEnabled()) {
    if (!warned) {
      warned = true;
      logger.warn(
        { syncMaxRows: env.IMPORT_SYNC_MAX_ROWS },
        "REDIS_URL sozlanmagan - ommaviy import navbatsiz (sinxron) ishlaydi " +
          "va bir faylda qator soni cheklanadi",
      );
    }
    return null;
  }

  if (client) return client;

  client = new IORedis(env.REDIS_URL, CONNECTION_OPTS);

  client.on("error", (err) => {
    // Har urinishda emas, faqat holat o'zgarganda shovqin qilmaslik uchun
    // pino o'zi bir xil xatolarni yig'adi. Bu yerda muhimi - xato
    // JIMGINA yutilmasligi: Redis o'chsa import navbatda qotib qoladi.
    logger.error({ err: err?.message }, "Redis ulanish xatosi (import navbati)");
  });

  client.on("ready", () => logger.info("Redis ulandi (import navbati)"));

  return client;
};

export const closeRedis = async () => {
  if (!client) return;
  try {
    await client.quit();
  } catch {
    client.disconnect();
  }
  client = null;
};

/** Kalit prefiksi - bir nechta markaz bitta Redis'ni bo'lishishi mumkin. */
export const queuePrefix = () => `{${env.REDIS_PREFIX}}`;
