import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ArchiveReasonsController } from './archive-reasons.controller.js';
import { ArchiveReasonsService } from './archive-reasons.service.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';

/**
 * ⚠ SERVIS EKSPORT QILINADI: `users` hayot sikli (arxivlash/qaytarish)
 * `logAction` ni chaqiradi. Hozircha u
 * `common/helpers/archive-log.service.ts` ko'prigidan foydalanadi.
 */
@Module({
  controllers: [ArchiveReasonsController],
  providers: [ArchiveReasonsService],
  exports: [ArchiveReasonsService],
})
export class ArchiveReasonsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(ArchiveReasonsController);
  }
}
