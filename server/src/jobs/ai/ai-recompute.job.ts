import { Injectable, Logger } from '@nestjs/common';
import { RecomputeService } from '../../modules/ai/recompute.service.js';
import type { JobDefinition } from '../job.types.js';

/**
 * `daily.ai-recompute` — `server/src/jobs/aiNightlyRecompute.job.js`.
 *
 * Barcha domenlar bo'yicha barcha detektorlar ishlaydi. Foydalanuvchi
 * hech narsa so'ramaydi — insight'lar o'zi yaratiladi, o'zi yangilanadi
 * va signal yo'qolganda o'zi yopiladi.
 *
 * ⚠ VAQTI MUHIM: kunlik accrual (00:20), kurs arxivlash (00:10) va AI
 * hayot siklidan (00:40) KEYIN — aks holda qarz kunlari va faol
 * guruhlar ro'yxati eski bo'lib, ballar bir kun ORQADA qolardi.
 */
@Injectable()
export class AiRecomputeJob implements JobDefinition {
  readonly name = 'daily.ai-recompute';
  /** Express: `every("0 1 * * *", AI_RECOMPUTE_JOB)`. */
  readonly cron = '0 1 * * *';

  private readonly logger = new Logger('Job:ai-recompute');

  constructor(private readonly recompute: RecomputeService) {}

  async run(): Promise<void> {
    const startedAt = Date.now();
    const results = (await this.recompute.recomputeAll({
      scope: 'full',
      trigger: 'nightly',
    })) as any[];

    // Xulosa jurnalda: bitta qatordan butun markazning holati ko'rinishi
    // kerak. Batafsil statistika har filialning `AiRun` yozuvida.
    const totals = results.reduce(
      (a, r) => {
        if (r.error) {
          a.failed += 1;
          return a;
        }
        a.branches += 1;
        a.high += r.counts?.high || 0;
        a.medium += r.counts?.medium || 0;
        a.opportunities += r.counts?.opportunities || 0;
        a.impactAtRisk += r.counts?.impactAtRisk || 0;
        return a;
      },
      { branches: 0, failed: 0, high: 0, medium: 0, opportunities: 0, impactAtRisk: 0 },
    );

    this.logger.log(
      `AI tungi to'liq tahlil tayyor — ${JSON.stringify(totals)}, ${Date.now() - startedAt}ms`,
    );
  }
}

/**
 * `intraday.ai-refresh` — `server/src/jobs/aiIntradayRefresh.job.js`.
 *
 * ⚠ FAQAT "fast" detektorlar (`FAST_PIPELINE`): qarz holati, issiq/sovuq
 * lidlar, o'qituvchi bugun kelmagani — bular kun ichida HAQIQATAN
 * o'zgaradi.
 *
 * Og'ir trend detektorlari (churn, kurs foydaliligi, guruh medianasi)
 * ATAYLAB kiritilmagan: ular 4 haftalik oynaga tayanadi va kun ichida
 * amalda o'zgarmaydi, lekin hisoblashi ENG QIMMAT.
 */
@Injectable()
export class AiIntradayRefreshJob implements JobDefinition {
  readonly name = 'intraday.ai-refresh';
  /** Express: `every("0 9,12,15,18,21 * * *", AI_INTRADAY_JOB)`. */
  readonly cron = '0 9,12,15,18,21 * * *';

  private readonly logger = new Logger('Job:ai-intraday');

  constructor(private readonly recompute: RecomputeService) {}

  async run(): Promise<void> {
    const startedAt = Date.now();
    const results = (await this.recompute.recomputeAll({
      scope: 'fast',
      trigger: 'intraday',
    })) as any[];
    const failed = results.filter((r) => r.error).length;
    this.logger.log(
      `AI kunduzgi yangilanish tayyor — filiallar: ${results.length}, ` +
        `xato: ${failed}, ${Date.now() - startedAt}ms`,
    );
  }
}
