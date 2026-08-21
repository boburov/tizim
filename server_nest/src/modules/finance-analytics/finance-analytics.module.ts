import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { FinanceAnalyticsController } from './finance-analytics.controller.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';
import { BranchAnalyticsModule } from '../branch-analytics/branch-analytics.module.js';
import { AiModule } from '../ai/ai.module.js';

import { NameResolverService } from './name-resolver.service.js';
import { SummaryService } from './summary.service.js';
import { RevenueService } from './revenue.service.js';
import { ExpenseService } from './expense.service.js';
import { CashFlowService } from './cash-flow.service.js';
import { ReceivablesService } from './receivables.service.js';
import { DiscountService } from './discount.service.js';
import { ProfitabilityService } from './profitability.service.js';
import { EntryDetailService } from './entry-detail.service.js';
import { StudentProfileService } from './student-profile.service.js';
import { FinancialIntelligenceService } from './financial-intelligence.service.js';
import { ExplanationService } from './explanation.service.js';

/**
 * MOLIYA TAHLILI — 30 ta marshrut, HAMMASI FAQAT O'QISH.
 *
 * ⚠ `BranchAnalyticsModule` IMPORT QILINADI — u `RoomOccupancyService`
 * ni eksport qiladi va `ProfitabilityService.getRoomRevenue` AYNAN
 * o'shani ishlatadi. Xona bandligi mantig'i BU YERDA TAKRORLANMAYDI:
 * nusxa ko'chirilganda `/finance-analytics/rooms` va
 * `/branch-analytics/rooms` bir xil xona uchun ikki xil foiz
 * ko'rsatardi (bu allaqachon yuz bergan: 103% va 100%).
 *
 * Pul birliklari (`common/utils/money.ts`), jurnal konstantalari
 * (`common/constants/ledger.ts`) va filial ko'lami
 * (`common/als/branch-context.ts`) ham MAVJUDLARIDAN olinadi.
 */
@Module({
  // ⚠ `AiModule` — `ExplanationService` ning LLM ko'prigi uchun (B29).
  // Halqa YO'Q: `AiModule` `finance-analytics` ga tayanmaydi.
  imports: [BranchAnalyticsModule, AiModule],
  controllers: [FinanceAnalyticsController],
  providers: [
    NameResolverService,
    SummaryService,
    RevenueService,
    ExpenseService,
    CashFlowService,
    ReceivablesService,
    DiscountService,
    ProfitabilityService,
    EntryDetailService,
    StudentProfileService,
    FinancialIntelligenceService,
    ExplanationService,
  ],
  exports: [SummaryService, ReceivablesService, ProfitabilityService],
})
export class FinanceAnalyticsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(FinanceAnalyticsController);
  }
}
