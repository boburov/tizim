import logger from "../config/logger.js";
import { remindersUpTo } from "../modules/leads/services/leads.service.js";
import { sendDailyDigest } from "../modules/leads/services/leadNotify.service.js";
import { localTodayKey } from "../helpers/attendance.helper.js";

export const JOB_NAME = "lead.daily-digest";

// HAR KUNI ERTALAB: har bir xodimga o'zining bugungi lidlari ro'yxati.
//
// NEGA ALOHIDA JOB, `lead.followup-reminders` YETARLI EMAS:
// u eslatmani AYNAN belgilangan daqiqada bir marta yuboradi. Xodim o'sha
// paytda band bo'lsa xabar oqimda ko'milib ketadi va lid o'sha kuni ham
// tashlab qo'yiladi. Kunlik yig'ma esa kunni "menda bugun 5 ta qo'ng'iroq
// bor" degan aniq ro'yxat bilan boshlaydi - va o'tib ketgan (kechikkan)
// eslatmalarni ham qamrab oladi.
export default function defineLeadDailyDigest(agenda) {
  agenda.define(JOB_NAME, async () => {
    // Kun OXIRIGACHA: bugun kechqurunga qo'yilgan eslatma ham ertalabki
    // ro'yxatda ko'rinishi kerak - odam kunini shunga qarab rejalashtiradi.
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const leads = await remindersUpTo(endOfDay);
    if (!leads.length) {
      logger.info("Bugun eslatmali lid yo'q");
      return;
    }

    const { sent } = await sendDailyDigest(leads, localTodayKey());
    logger.info({ leads: leads.length, sent }, "Lid kunlik yig'masi yuborildi");
  });
}
