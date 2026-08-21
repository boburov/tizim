import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ActivityHistoryController } from './activity-history.controller.js';
import { ActivityHistoryService } from './activity-history.service.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';

/** Faoliyat tarixi — FAQAT O'QISH, hech qanday yozish yo'li yo'q. */
@Module({
  controllers: [ActivityHistoryController],
  providers: [ActivityHistoryService],
  exports: [ActivityHistoryService],
})
export class ActivityHistoryModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(ActivityHistoryController);
  }
}
