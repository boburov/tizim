import { Injectable, Logger } from '@nestjs/common';
import { AiLifecycleService } from '../../modules/ai/lifecycle.service.js';
import type { JobDefinition } from '../job.types.js';

/**
 * `daily.ai-lifecycle` — `server/src/jobs/aiLifecycle.job.js` KO'CHIRMASI.
 *
 * Uchta ish: muddati o'tganlarni yopish, yopilgan bashoratlarning
 * NATIJASINI aniqlash (yopiq halqa), juda eskilarini o'chirish.
 *
 * ⚠ VAQTI: qayta hisoblashdan (01:00) OLDIN, 00:40 da. Eskirgan insight
 * avval yopilishi kerak — teskari tartibda yangi yaratilgani DARHOL
 * "muddati o'tgan" deb yopilib qolardi.
 *
 * ⚠ FILIAL KONTEKSTI KERAK EMAS: bu texnik tozalash, biznes tahlili
 * emas — barcha filiallar yozuvlari bir xil qoida bo'yicha ishlanadi.
 */
@Injectable()
export class AiLifecycleJob implements JobDefinition {
  readonly name = 'daily.ai-lifecycle';
  /** Express `jobs/index.js`: `every("40 0 * * *", AI_LIFECYCLE_JOB)`. */
  readonly cron = '40 0 * * *';

  private readonly logger = new Logger('Job:ai-lifecycle');

  constructor(private readonly lifecycle: AiLifecycleService) {}

  async run(): Promise<void> {
    const startedAt = Date.now();
    const result = await this.lifecycle.runLifecycle();
    this.logger.log(
      `AI hayot sikli tayyor — ${JSON.stringify(result)}, ${Date.now() - startedAt}ms`,
    );
  }
}
