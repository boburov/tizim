import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AiController } from './ai.controller.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';
import { AiFeatureMiddleware } from './ai-feature.middleware.js';

import { StudentSignalService } from './signals/student.signal.js';
import { TeacherSignalService } from './signals/teacher.signal.js';
import { GroupSignalService } from './signals/group.signal.js';
import { CourseSignalService } from './signals/course.signal.js';
import { LeadSignalService } from './signals/lead.signal.js';
import { FinanceSignalService } from './signals/finance.signal.js';
import { PulseSignalService } from './signals/pulse.signal.js';
import { HealthSignalService } from './signals/health.signal.js';

import { AiConfigService } from './ai-config.service.js';
import { AiBudgetService } from './ai-budget.service.js';
import { GeminiService } from './gemini.service.js';
import { NarrationQueueService } from './narration-queue.service.js';
import { InsightWriterService } from './insight-writer.service.js';
import { InsightService } from './insight.service.js';
import { AiLifecycleService } from './lifecycle.service.js';
import { StudentInsightService } from './student-insight.service.js';
import { TeacherInsightService } from './teacher-insight.service.js';
import { GroupInsightService } from './group-insight.service.js';
import { CourseInsightService } from './course-insight.service.js';
import { LeadInsightService } from './lead-insight.service.js';
import { FinanceInsightService } from './finance-insight.service.js';
import { RankingService } from './ranking.service.js';
import { RecomputeService } from './recompute.service.js';
import { ReportService } from './report.service.js';
import { BriefingService } from './briefing.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AI MASLAHATCHI MODULI — 15/15 marshrut.
 *
 * ── QATLAMLAR (pastdan yuqoriga) ──
 *   scoring/*        sof matematika, DI'siz (klass emas — modul)
 *   signals/*        bazadan XOM o'lchov (`@Injectable`)
 *   *-insight.*      o'lchovdan INSIGHT (detektorlar + yozuvchi)
 *   ranking / report / briefing / recompute — yig'uvchi qatlam
 *
 * ── ⚠ `narration.service` VA `subject-link.service` SOF MODUL ──
 * Ular bazaga ham, holatga ham tegmaydi. Servis qilib ro'yxatga olish
 * DI grafigiga sababsiz tugun qo'shardi.
 *
 * ── ⚠ NARRATOR NAVBATI RO'YXATDA, LEKIN MARSHRUTI YO'Q ──
 * `NarrationQueueService` ni tungi job chaqiradi. Kesishuv davrida
 * jobni EXPRESS yuritadi (`JobsModule` bilan bir xil qoida) — ikkala
 * stek bir vaqtda yozsa AI sarfi IKKI MARTA hisoblanardi.
 *
 * ── ⚠ MIDDLEWARE TARTIBI ──
 * `AiFeatureMiddleware` `AuthMiddleware` DAN OLDIN: Express'da
 * `requireFeature` router darajasida, `requireAuth` esa marshrut
 * darajasida turadi — ya'ni tarifda AI bo'lmasa javob 401 emas, 402.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Module({
  controllers: [AiController],
  providers: [
    StudentSignalService,
    TeacherSignalService,
    GroupSignalService,
    CourseSignalService,
    LeadSignalService,
    FinanceSignalService,
    PulseSignalService,
    HealthSignalService,
    AiConfigService,
    AiBudgetService,
    GeminiService,
    NarrationQueueService,
    InsightWriterService,
    InsightService,
    AiLifecycleService,
    StudentInsightService,
    TeacherInsightService,
    GroupInsightService,
    CourseInsightService,
    LeadInsightService,
    FinanceInsightService,
    RankingService,
    RecomputeService,
    ReportService,
    BriefingService,
  ],
  // Tungi joblar (kesishuvdan keyin) shu servislarga murojaat qiladi.
  //
  // ⚠ `GeminiService` + `AiBudgetService` — `finance-analytics` ning
  // izoh qatlami (`FinanceNarrationPort`, B29) uchun. Ular AYNAN shu
  // nusxada bo'lishi SHART: ikkinchi nusxa oylik AI limitini ikki
  // joyda alohida sanardi, ya'ni limit ishlamay qolardi.
  exports: [
    RecomputeService,
    ReportService,
    AiLifecycleService,
    NarrationQueueService,
    GeminiService,
    AiBudgetService,
  ],
})
export class AiModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AiFeatureMiddleware, AuthMiddleware).forRoutes(AiController);
  }
}
