import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ROLES } from '../../common/constants/permissions.js';
import { NotificationsService } from '../notifications/notifications.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LID ESLATMALARINI YETKAZISH — `leads/services/leadNotify.service.js`
 * NING KO'CHIRMASI.
 *
 * ── ⚠ YAGONA YO'L: `notifications.send` ──
 * U bitta amalda IKKALASINI bajaradi: platformada bildirishnoma yozuvini
 * yaratadi VA Telegram bog'langan bo'lsa botga yuboradi
 * (`notification.deliver` job orqali). Shuning uchun bu yerda "agar tg
 * bog'langan bo'lsa" degan ALOHIDA shart YO'Q — bog'lanmagan odam
 * xabarni platformada baribir ko'radi.
 *
 * ── ⚠ MAS'ULSIZ LID EGALARGA TUSHADI ──
 * Egasiz eslatma hech kimga bormasa lid JIMGINA o'lib ketardi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Ro'yxatdagi eng ko'p qator — Telegram xabari 4096 belgidan uzun bo'lsa rad etiladi. */
const MAX_LINES = 20;

@Injectable()
export class LeadNotifyService {
  private readonly logger = new Logger('LeadNotify');

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  fullName(lead: Record<string, any>): string {
    return `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || 'Lid';
  }

  /** ZAXIRA manzil — mas'uli yo'q lid uchun. */
  private async ownerIds(): Promise<string[]> {
    const owners = await this.prisma.user.findMany({
      where: { role: ROLES.OWNER, isActive: true, isDeleted: false },
      select: { id: true },
    });
    return owners.map((o) => String(o.id));
  }

  private timeLabel(date: unknown): string {
    return date
      ? new Date(date as string).toLocaleTimeString('uz-UZ', {
          hour: '2-digit',
          minute: '2-digit',
          timeZone: process.env.TZ_NAME || 'Asia/Tashkent',
        })
      : '';
  }

  /** BITTA LID: vaqti kelgan eslatma. */
  async notifyLeadReminder(lead: Record<string, any>) {
    const to = lead.assignedTo ? [String(lead.assignedTo)] : await this.ownerIds();
    if (!to.length) return { delivered: false, reason: 'no-recipient' };

    const note = lead.followUpNote ? `\nIzoh: ${lead.followUpNote}` : '';
    await this.notifications.send(
      {
        title: "Qayta bog'lanish vaqti",
        body: `${this.fullName(lead)} — ${lead.phone || ''}${note}`,
        category: 'other',
        audience: { type: 'auto_system', userIds: to },
        isAuto: true,
        // ⚠ IDEMPOTENTLIK: job qayta ishga tushsa yoki bir necha marta
        // urinsa ham bitta eslatma uchun BITTA xabar ketadi.
        dedupeKey: `lead-followup:${lead._id ?? lead.id}:${new Date(lead.followUpAt).getTime()}`,
      },
      null,
    );
    return { delivered: true, recipients: to.length };
  }

  private linesOf(leads: Record<string, any>[]): string {
    return leads
      .slice(0, MAX_LINES)
      .map((l) => {
        const at = this.timeLabel(l.followUpAt);
        const note = l.followUpNote ? ` — ${l.followUpNote}` : '';
        return `• ${at} ${this.fullName(l)} (${l.phone || 'raqamsiz'})${note}`;
      })
      .join('\n');
  }

  private bodyOf(leads: Record<string, any>[]): string {
    const rest =
      leads.length > MAX_LINES ? `\n… va yana ${leads.length - MAX_LINES} ta` : '';
    return `${this.linesOf(leads)}${rest}`;
  }

  /**
   * KUNLIK YIG'MA — "bugun N ta lid bilan bog'lanishingiz kerak".
   *
   * ⚠ Har xodim FAQAT o'z lidlarini oladi. Egalar (owner) esa BUTUN
   * ro'yxatni ko'radi — mas'uli yo'q lidlar ham shu yerda ko'rinadi,
   * aks holda ular hech kimning ro'yxatiga tushmasdi.
   *
   * ⚠ Ega bir vaqtda mas'ul ham bo'lsa unga IKKI xabar ketmasin: to'liq
   * ro'yxat o'z ro'yxatining USTIGA yoziladi (u yaxlit to'plam).
   */
  async sendDailyDigest(leads: Record<string, any>[], dayKey: string) {
    if (!leads.length) return { sent: 0 };

    const byUser = new Map<string, Record<string, any>[]>();
    for (const lead of leads) {
      if (!lead.assignedTo) continue;
      const key = String(lead.assignedTo);
      if (!byUser.has(key)) byUser.set(key, []);
      byUser.get(key)!.push(lead);
    }
    for (const id of await this.ownerIds()) byUser.set(id, leads);

    let sent = 0;
    for (const [userId, items] of byUser) {
      try {
        await this.notifications.send(
          {
            title: `Bugun ${items.length} ta lid bilan bog'lanishingiz kerak`,
            body: this.bodyOf(items),
            category: 'other',
            audience: { type: 'auto_system', userIds: [userId] },
            isAuto: true,
            dedupeKey: `lead-digest:${userId}:${dayKey}`,
          },
          null,
        );
        sent += 1;
      } catch (err) {
        this.logger.warn(
          `Lid kunlik yig'masi yuborilmadi (${userId}): ${(err as Error)?.message}`,
        );
      }
    }

    return { sent };
  }
}
