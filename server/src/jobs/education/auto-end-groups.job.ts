import { Injectable, Logger } from '@nestjs/common';
import { GroupsService } from '../../modules/groups/groups.service.js';
import type { JobDefinition } from '../job.types.js';

/**
 * `daily.auto-end-groups` — `server/src/jobs/autoEndGroups.job.js`.
 *
 * Tugash sanasi (`endDate`) yetib kelgan guruhlarni avtomatik
 * arxivlaydi: o'qituvchi davrlari VA o'quvchi a'zoliklari o'sha kunda
 * yopiladi.
 *
 * ⚠ IDEMPOTENT — allaqachon arxivlangani qayta tegilmaydi.
 *
 * ⚠ VAQTI: kunlik accrual'dan (00:20) OLDIN, 00:10 da — tugagan guruh
 * yangi dars accrual qilmasin.
 */
@Injectable()
export class AutoEndGroupsJob implements JobDefinition {
  readonly name = 'daily.auto-end-groups';
  /** Express: `every("10 0 * * *", AUTO_END_GROUPS_JOB)`. */
  readonly cron = '10 0 * * *';

  private readonly logger = new Logger('Job:auto-end-groups');

  constructor(private readonly groups: GroupsService) {}

  /**
   * ⚠ BOOT CATCH-UP: Express startupda ham chaqiradi (server o'chiq
   * paytda tugash sanasi yetgan kurslarni arxivlaydi).
   */
  async runOnBoot(): Promise<void> {
    await this.run();
  }

  async run(): Promise<void> {
    const result: any = await this.groups.processDueGroupEnds();
    if (result?.archived) {
      this.logger.log(`Tugagan kurslar avto-arxivlandi — ${JSON.stringify(result)}`);
    }
  }
}
