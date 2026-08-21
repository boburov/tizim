import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AdminDashboardController } from './admin-dashboard.controller.js';
import { AdminDashboardService } from './admin-dashboard.service.js';
import { StudentStatsService } from './student-stats.service.js';
import { RetentionService } from './retention.service.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';

/** Rahbariyat paneli — FAQAT O'QISH, hech qanday yozish yo'li yo'q. */
@Module({
  controllers: [AdminDashboardController],
  providers: [AdminDashboardService, StudentStatsService, RetentionService],
  exports: [AdminDashboardService, StudentStatsService, RetentionService],
})
export class AdminDashboardModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(AdminDashboardController);
  }
}
