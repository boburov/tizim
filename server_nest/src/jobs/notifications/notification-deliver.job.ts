import { Injectable, Logger } from '@nestjs/common';
import { NotificationsService } from '../../modules/notifications/notifications.service.js';
import type { JobDefinition } from '../job.types.js';

/**
 * `notification.deliver` — `server/src/jobs/notificationDeliver.job.js`.
 *
 * Bitta bildirishnomani bot orqali yetkazadi (so'rov oqimidan ajratilgan:
 * 500 kishilik e'lon bir necha o'n soniya olishi mumkin).
 *
 * ⚠ CRON YO'Q — bu HODISAGA ko'ra ishlaydigan job: uni
 * `notifications.send` `scheduler.now(...)` bilan qo'yadi.
 *
 * ⚠ XATO QAYTA TASHLANADI: pg-boss faqat shunda `retryLimit` (3) bo'yicha
 * qayta uradi. Qayta urinish XAVFSIZ, chunki `deliverNotification` faqat
 * `botDeliveredAt IS NULL` oluvchilarni uradi — allaqachon yetganlarga
 * IKKINCHI xabar ketmaydi.
 */
@Injectable()
export class NotificationDeliverJob implements JobDefinition {
  readonly name = 'notification.deliver';
  readonly cron = null;
  readonly concurrency = 1;
  /** Express: `lockLifetime: 5 * 60 * 1000`. */
  readonly lockLifetimeMs = 5 * 60 * 1000;

  private readonly logger = new Logger('Job:notification.deliver');

  constructor(private readonly notifications: NotificationsService) {}

  async run(data: Record<string, unknown>): Promise<void> {
    const notificationId = data?.notificationId as string | undefined;
    if (!notificationId) return;
    try {
      await this.notifications.deliverNotification(notificationId);
    } catch (err) {
      this.logger.error(`Bildirishnoma yetkazishda xato (${notificationId})`, err as Error);
      throw err; // pg-boss qayta urinadi
    }
  }
}
