import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { StorageController } from './storage.controller.js';
import { StorageService } from './storage.service.js';
import { StorageAdminService } from './storage-admin.service.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';

/**
 * SAQLAGICH moduli.
 *
 * ⚠ SERVISLAR EKSPORT QILINADI: fayl YUKLASH (multer middleware),
 * `assignments`, `expenses` va Telegram bot yetkazish ularga tayanadi.
 * Kvota kafolati BITTA joyda (`StorageService.saveBuffer`) turishi
 * SHART — nusxa ko'chirilsa atomik band qilish kafolati yo'qolardi.
 */
@Module({
  controllers: [StorageController],
  providers: [StorageService, StorageAdminService],
  exports: [StorageService, StorageAdminService],
})
export class StorageModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(StorageController);
  }
}
