import logger from "../config/logger.js";
import { runScheduledCleanup } from "../modules/storage/services/storageAdmin.service.js";

export const JOB_NAME = "storage.cleanup";

/**
 * Avto-tozalash.
 *
 * Job HAR KUNI yuradi, lekin ishni faqat sozlamadagi chastota (haftalik /
 * oylik / yarim yillik) bo'yicha vaqti kelganda bajaradi.
 *
 * NEGA cron chastotani aks ettirmaydi: chastota sozlamadan o'zgaradi,
 * cron esa server ishga tushganda bir marta ro'yxatga olinadi. Cron
 * ishlatilsa, admin "haftalik"ni "oylik"ka o'zgartirgach jadval server
 * qayta ishga tushmaguncha eski holida qolib ketardi. Kundalik yurish +
 * sozlamadan o'qish esa o'zgarishni ERTASIGA qabul qiladi.
 */
export default function defineStorageCleanup(agenda) {
  agenda.define(
    JOB_NAME,
    { concurrency: 1, lockLifetime: 30 * 60 * 1000 },
    async () => {
      try {
        const res = await runScheduledCleanup();
        if (!res.skipped) {
          logger.info(res, "Saqlagich avto-tozalandi");
        }
      } catch (err) {
        logger.error({ err }, "Avto-tozalashda xato");
        throw err; // Agenda qayta urinadi
      }
    },
  );
}
