import { Injectable, Module, type OnModuleInit } from '@nestjs/common';
import { AiModule } from '../../modules/ai/ai.module.js';
import { NotificationsModule } from '../../modules/notifications/notifications.module.js';
import { JobsModule, JobsRegistry } from '../jobs.module.js';
import { AiLifecycleJob } from './ai-lifecycle.job.js';
import { AiRecomputeJob, AiIntradayRefreshJob } from './ai-recompute.job.js';
import {
  AiDailyReportJob,
  AiWeeklyReportJob,
  AiMonthlyReportJob,
} from './ai-report.job.js';
import { AiNarrationJob } from './ai-narration.job.js';
import { AiMorningDigestJob } from './ai-morning-digest.job.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AI JOB OILASI — 7 ta job (Express bilan 7/7).
 *
 * ── ⚠ KUNLIK ZANJIR TARTIBI ATAYLAB SHUNDAY ──
 *   00:10  kurs arxivlash        (`autoEndGroups`)
 *   00:20  kunlik qarz accrual   (`dailyAccrueFinance`)
 *   00:40  AI hayot sikli        → eskirgan insight'lar YOPILADI
 *   01:00  AI to'liq hisoblash   → yangi insight'lar YARATILADI
 *   07:00  AI kunlik hisobot     → tugagan kun (kecha) qamraladi
 *   08:00  AI ertalabki digest   → hisobot + insight'lar owner'ga ketadi
 *   09:00+ har 3 soatda tez yangilanish
 *   :25    har soat — narrator
 *
 * Tartibni o'zgartirish natijalarni BUZADI (izohlar har job faylida).
 *
 * ── ⚠ RO'YXATGA OLISH ≠ ISHGA TUSHISH ──
 * `JobsRegistry` faqat "kodi tayyor" deydi. Haqiqatan ishlashi
 * `NEST_WORKERS_ENABLED` + `NEST_WORKER_JOBS` ga bog'liq. Kesishuv
 * davrida bu joblarni EXPRESS yuritadi — ikkala stek bir cronni
 * ro'yxatga olsa AI hisoblash IKKI MARTA yurardi va sarf ham IKKI
 * BAROBAR sanalardi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class AiJobsRegistrar implements OnModuleInit {
  constructor(
    private readonly registry: JobsRegistry,
    private readonly lifecycle: AiLifecycleJob,
    private readonly recompute: AiRecomputeJob,
    private readonly intraday: AiIntradayRefreshJob,
    private readonly daily: AiDailyReportJob,
    private readonly weekly: AiWeeklyReportJob,
    private readonly monthly: AiMonthlyReportJob,
    private readonly narration: AiNarrationJob,
    private readonly digest: AiMorningDigestJob,
  ) {}

  onModuleInit(): void {
    this.registry.register(
      this.lifecycle,
      this.recompute,
      this.intraday,
      this.daily,
      this.weekly,
      this.monthly,
      this.narration,
      this.digest,
    );
  }
}

@Module({
  imports: [JobsModule, AiModule, NotificationsModule],
  providers: [
    AiLifecycleJob,
    AiRecomputeJob,
    AiIntradayRefreshJob,
    AiDailyReportJob,
    AiWeeklyReportJob,
    AiMonthlyReportJob,
    AiNarrationJob,
    AiMorningDigestJob,
    AiJobsRegistrar,
  ],
})
export class AiJobsModule {}
