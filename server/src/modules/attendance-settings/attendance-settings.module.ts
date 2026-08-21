import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AttendanceSettingsController } from './attendance-settings.controller.js';
import { AttendanceSettingsService } from './attendance-settings.service.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';

/**
 * ⚠ CHEGARA IZOHI: `attendance` MODULINING O'ZI bu agentning ishi EMAS
 * (ta'lim yadrosi). Bu yerda faqat SOZLAMA jadvali (`attendance_settings`,
 * yagona qator) ko'chirilgan — u "sozlama/konfiguratsiya" toifasiga
 * kiradi va boshqa hech narsaga tegmaydi.
 */
@Module({
  controllers: [AttendanceSettingsController],
  providers: [AttendanceSettingsService],
  exports: [AttendanceSettingsService],
})
export class AttendanceSettingsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(AttendanceSettingsController);
  }
}
