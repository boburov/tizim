import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ActivityLogsController } from './activity-logs.controller.js';
import { ActivityLogsService } from './activity-logs.service.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';

/**
 * Faoliyat loglari — FAQAT O'QISH.
 *
 * YOZISH YO'LI ATAYLAB YO'Q: yozuvlarni `auditLog` middleware yaratadi
 * va u hali Express'da (FAZA 2.7). Bu modul uni KO'CHIRMAYDI —
 * ikkalasi bir vaqtda yozsa har amal ikki marta loglanardi.
 */
@Module({
  controllers: [ActivityLogsController],
  providers: [ActivityLogsService],
  exports: [ActivityLogsService],
})
export class ActivityLogsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(ActivityLogsController);
  }
}
