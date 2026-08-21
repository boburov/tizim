import logger from "../config/logger.js";
import {
  dueReminders,
  markReminderNotified,
} from "../modules/leads/services/leads.service.js";
import {
  fullName,
  notifyLeadReminder,
} from "../modules/leads/services/leadNotify.service.js";
import { create as createSystemNotification } from "../modules/systemNotifications/services/systemNotifications.service.js";

export const JOB_NAME = "lead.followup-reminders";

// Vaqti kelgan qayta bog'lanish eslatmalarini MAS'ULGA yuboradi.
//
// Ilgari faqat umumiy tizim bildirishnomasi yaratilardi: xabar hammaga bir
// xil chiqar, ya'ni amalda HECH KIMGA tegishli bo'lmasdi. Endi xabar aynan
// lidga biriktirilgan xodimga (mas'ul yo'q bo'lsa - egalarga) manzillanadi
// va Telegram bog'langan bo'lsa botga ham boradi.
export default function defineLeadFollowupReminders(agenda) {
  agenda.define(JOB_NAME, async () => {
    const now = new Date();
    const leads = await dueReminders(now);
    let sent = 0;

    for (const lead of leads) {
      try {
        await notifyLeadReminder(lead);

        // Admin paneldagi umumiy tizim bildirishnomasi ham QOLADI: u
        // manzilli xabardan boshqa narsa - panelga kirgan xodim eslatma
        // borligini bildirishnomani ochmasdan ham ko'radi.
        await createSystemNotification({
          message: `Qayta bog'lanish: ${fullName(lead)}${
            lead.followUpNote ? ` - ${lead.followUpNote}` : ""
          }`,
          link: "/owner/leads",
        }).catch((err) =>
          logger.warn({ err, leadId: lead._id }, "Tizim bildirishnomasi yaratilmadi"),
        );

        // Bayroq FAQAT yuborilgandan KEYIN qo'yiladi - aks holda yiqilgan
        // eslatma "yuborilgan" bo'lib qolib, boshqa takrorlanmasdi.
        await markReminderNotified(lead._id, now);
        sent += 1;
      } catch (err) {
        logger.warn({ err, leadId: lead._id }, "Lid eslatmasi yuborilmadi");
      }
    }

    if (sent) logger.info({ sent }, "Lid qayta bog'lanish eslatmalari yuborildi");
  });
}
