import { Injectable, Logger } from '@nestjs/common';
import { ReportService } from '../../modules/ai/report.service.js';
import type { JobDefinition } from '../job.types.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AVTOMATIK HISOBOTLAR — `server/src/jobs/aiReports.job.js` KO'CHIRMASI.
 *
 * ⚠ Hisobot O'TGAN TUGAGAN davrni qamraydi (kecha, o'tgan hafta, o'tgan
 * oy), joriy davrni EMAS. Yarim kun ma'lumoti bilan "kunlik hisobot"
 * chiqarish har ertalab "daromad tushdi" degan SOXTA xulosa berardi.
 *
 * ⚠ Hisobot SAQLANADI (har so'rovda qayta hisoblanmaydi): kechagi
 * hisobotni bugun qayta hisoblasak, o'shandan keyin o'zgargan ma'lumot
 * (kechikib kiritilgan davomat, keyin qilingan to'lov) uni JIMGINA
 * o'zgartirardi — owner esa kecha BOSHQA raqamni ko'rgan.
 *
 * ⚠ UCHTA ALOHIDA JOB, bitta emas: nomlar Express bilan AYNAN bir xil
 * bo'lishi SHART (`pgboss.schedule` yozuvi nomga bog'lanadi).
 * ═══════════════════════════════════════════════════════════════════════════
 */
abstract class AiReportJobBase implements JobDefinition {
  abstract readonly name: string;
  abstract readonly cron: string;
  protected abstract readonly period: 'daily' | 'weekly' | 'monthly';

  private readonly logger = new Logger('Job:ai-report');

  constructor(protected readonly reports: ReportService) {}

  async run(): Promise<void> {
    const startedAt = Date.now();
    const results = (await this.reports.buildReportsForAll(this.period)) as any[];
    const failed = results.filter((r) => r.error).length;
    this.logger.log(
      `AI hisobot tuzildi — davr: ${this.period}, filiallar: ${results.length}, ` +
        `xato: ${failed}, ${Date.now() - startedAt}ms`,
    );
  }
}

@Injectable()
export class AiDailyReportJob extends AiReportJobBase {
  readonly name = 'daily.ai-report';
  /** Express: `every("0 7 * * *", AI_DAILY_REPORT_JOB)` — kechani qamraydi. */
  readonly cron = '0 7 * * *';
  protected readonly period = 'daily' as const;
}

@Injectable()
export class AiWeeklyReportJob extends AiReportJobBase {
  readonly name = 'weekly.ai-report';
  /** Express: `every("10 7 * * 1", ...)` — o'tgan TO'LIQ haftani qamraydi. */
  readonly cron = '10 7 * * 1';
  protected readonly period = 'weekly' as const;
}

@Injectable()
export class AiMonthlyReportJob extends AiReportJobBase {
  readonly name = 'monthly.ai-report';
  /**
   * Express: `every("20 7 1 * *", ...)`.
   *
   * ⚠ Oylik moliya generatsiyasidan (00:05) KEYIN: o'tgan oy yopilgan
   * bo'lishi kerak.
   */
  readonly cron = '20 7 1 * *';
  protected readonly period = 'monthly' as const;
}
