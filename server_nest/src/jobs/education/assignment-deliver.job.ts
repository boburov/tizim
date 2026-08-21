import { Injectable, Logger } from '@nestjs/common';
import { AssignmentsService } from '../../modules/assignments/assignments.service.js';
import type { JobDefinition } from '../job.types.js';

/**
 * `assignment.deliver` — `server/src/jobs/assignmentDeliver.job.js`.
 *
 * Bitta vazifani bot orqali yetkazadi. So'rov oqimidan AJRATILGAN: 30 ta
 * hujjat yuborish bir necha soniya olishi mumkin, o'qituvchi kutmasin.
 *
 * ⚠ JADVALSIZ (`cron: null`) — uni kod chaqiradi (`scheduler.now(...)`).
 *
 * ⚠ IDEMPOTENT: `deliverAssignment` faqat `status="pending"` oluvchilarni
 * uradi, ya'ni job qayta ishga tushsa DUBLIKAT fayl yuborilmaydi.
 *
 * ⚠ `lockLifetime` bildirishnoma jobidan UZUNROQ (15 daqiqa): hujjat
 * yuborish matndan sekinroq va katta guruhda 5 daqiqa yetmay qolishi
 * mumkin.
 *
 * ⚠ XATO QAYTA TASHLANADI — navbat qayta urinishi uchun.
 */
@Injectable()
export class AssignmentDeliverJob implements JobDefinition {
  readonly name = 'assignment.deliver';
  readonly cron = null;
  readonly concurrency = 1;
  readonly lockLifetimeMs = 15 * 60 * 1000;

  private readonly logger = new Logger('Job:assignment-deliver');

  constructor(private readonly assignments: AssignmentsService) {}

  async run(data?: Record<string, unknown>): Promise<void> {
    const assignmentId = data?.assignmentId as string | undefined;
    if (!assignmentId) return;
    try {
      await this.assignments.deliverAssignment(assignmentId);
    } catch (err) {
      this.logger.error(
        `Vazifa yetkazishda xato (${assignmentId}): ${(err as Error)?.message}`,
      );
      throw err;
    }
  }
}
