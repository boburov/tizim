import { Injectable, Logger } from '@nestjs/common';
import { LeadsService } from '../../modules/leads/leads.service.js';
import { LeadNotifyService } from '../../modules/leads/lead-notify.service.js';
import { SystemNotificationsService } from '../../modules/system-notifications/system-notifications.service.js';
import { requireDayKey } from '../day-key.js';
import type { JobDefinition } from '../job.types.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LID ESLATMA JOBLARI — ikkitasi, ATAYLAB alohida.
 *
 * ── ⚠ NEGA IKKITA ──
 * `lead.followup-reminders` eslatmani AYNAN belgilangan daqiqada BIR
 * MARTA yuboradi. Xodim o'sha paytda band bo'lsa xabar oqimda ko'milib
 * ketadi va lid o'sha kuni tashlab qo'yiladi. `lead.daily-digest` esa
 * kunni "menda bugun 5 ta qo'ng'iroq bor" degan ANIQ ro'yxat bilan
 * boshlaydi — va o'tib ketgan (kechikkan) eslatmalarni ham qamraydi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class LeadFollowupRemindersJob implements JobDefinition {
  readonly name = 'lead.followup-reminders';
  // ⚠ Izoh BLOK emas, QATOR: cron ifodasidagi `*` + `/` ketma-ketligi
  // blok izohini vaqtidan oldin YOPIB qo'yardi.
  // Express: every("*<slash>5 * * * *", LEAD_FOLLOWUP_JOB) — har 5 daqiqada.
  readonly cron = '*/5 * * * *';

  private readonly logger = new Logger('Job:lead-followup');

  constructor(
    private readonly leads: LeadsService,
    private readonly notify: LeadNotifyService,
    private readonly system: SystemNotificationsService,
  ) {}

  async run(): Promise<void> {
    const now = new Date();
    const due = (await this.leads.dueReminders(now)) as any[];
    let sent = 0;

    for (const lead of due) {
      try {
        await this.notify.notifyLeadReminder(lead);

        // ⚠ UMUMIY TIZIM BILDIRISHNOMASI HAM QOLADI: u manzilli
        // xabardan BOSHQA narsa — panelga kirgan xodim eslatma
        // borligini bildirishnomani ochmasdan ham ko'radi.
        await this.system
          .create({
            message: `Qayta bog'lanish: ${this.notify.fullName(lead)}${
              lead.followUpNote ? ` - ${lead.followUpNote}` : ''
            }`,
            link: '/owner/leads',
          })
          .catch((err: Error) =>
            this.logger.warn(
              `Tizim bildirishnomasi yaratilmadi (${lead._id ?? lead.id}): ${err?.message}`,
            ),
          );

        // ⚠ BAYROQ FAQAT YUBORILGANDAN KEYIN: aks holda yiqilgan
        // eslatma "yuborilgan" bo'lib qolib, boshqa TAKRORLANMASDI.
        await this.leads.markReminderNotified(lead._id ?? lead.id, now);
        sent += 1;
      } catch (err) {
        this.logger.warn(
          `Lid eslatmasi yuborilmadi (${lead._id ?? lead.id}): ${(err as Error)?.message}`,
        );
      }
    }

    if (sent) this.logger.log(`Lid qayta bog'lanish eslatmalari yuborildi — ${sent} ta`);
  }
}

@Injectable()
export class LeadDailyDigestJob implements JobDefinition {
  readonly name = 'lead.daily-digest';
  /**
   * Express: `every("0 9 * * *", LEAD_DIGEST_JOB)` — ish kuni
   * boshlanishidan OLDIN, odam kunini shu ro'yxat bilan rejalashtiradi.
   */
  readonly cron = '0 9 * * *';

  private readonly logger = new Logger('Job:lead-digest');

  constructor(
    private readonly leads: LeadsService,
    private readonly notify: LeadNotifyService,
  ) {}

  async run(): Promise<void> {
    // ⚠ KUN OXIRIGACHA: bugun kechqurunga qo'yilgan eslatma ham
    // ertalabki ro'yxatda ko'rinishi kerak.
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const leads = (await this.leads.remindersUpTo(endOfDay)) as any[];
    if (!leads.length) {
      this.logger.log("Bugun eslatmali lid yo'q");
      return;
    }

    // ⚠ `requireDayKey()` — `null` kun kaliti dedupe'ni ABADIY bir xil
    // qilardi va digest birinchi kundan keyin BOSHQA yuborilmasdi.
    const { sent } = await this.notify.sendDailyDigest(leads, requireDayKey());
    this.logger.log(`Lid kunlik yig'masi yuborildi — ${leads.length} lid, ${sent} xabar`);
  }
}
