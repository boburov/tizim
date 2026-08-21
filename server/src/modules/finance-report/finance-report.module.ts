import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { FinanceReportController } from './finance-report.controller.js';
import { FinanceReportService } from './finance-report.service.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';

/** MOLIYA HISOBOTI (FAZA 7.2) — faqat o'qish, yozuv yo'li yo'q. */
@Module({
  controllers: [FinanceReportController],
  providers: [FinanceReportService],
})
export class FinanceReportModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(FinanceReportController);
  }
}
