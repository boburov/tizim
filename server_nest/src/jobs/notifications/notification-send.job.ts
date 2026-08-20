import { Injectable, Logger } from '@nestjs/common';
import { NotificationsService } from '../../modules/notifications/notifications.service.js';
import type { JobDefinition } from '../job.types.js';

/**
 * `notification.send` — `server/src/jobs/notificationSchedule.job.js`.
 *
 * Rejalashtirilgan xabarni belgilangan vaqt kelganda yuboradi
 * (`scheduler.at(when, ...)` bilan qo'yiladi, cron EMAS).
 *
 * ⚠ Qayta urinish XAVFSIZ: `dispatchScheduled` shartli atomik o'tish
 * (`status = "scheduled"` → `"sent"`) qiladi, ya'ni ikkinchi yurish
 * darhol chiqadi va oluvchilar IKKI MARTA yaratilmaydi.
 */
@Injectable()
export class NotificationSendJob implements JobDefinition {
  readonly name = 'notification.send';
  readonly cron = null;
  readonly concurrency = 1;
  /** Express: `lockLifetime: 5 * 60 * 1000`. */
  readonly lockLifetimeMs = 5 * 60 * 1000;

  private readonly logger = new Logger('Job:notification.send');

  constructor(private readonly notifications: NotificationsService) {}

  async run(data: Record<string, unknown>): Promise<void> {
    const notificationId = data?.notificationId as string | undefined;
    if (!notificationId) return;
    try {
      await this.notifications.dispatchScheduled(notificationId);
    } catch (err) {
      this.logger.error(
        `Rejalashtirilgan xabarni yuborishda xato (${notificationId})`,
        err as Error,
      );
      throw err; // pg-boss qayta urinadi
    }
  }
}
