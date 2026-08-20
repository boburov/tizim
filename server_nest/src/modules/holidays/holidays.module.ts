import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { HolidaysController } from './holidays.controller.js';
import { HolidaysService } from './holidays.service.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';
import { NotificationsModule } from '../notifications/notifications.module.js';

/**
 * BAYRAMLAR moduli.
 *
 * ⚠ SERVIS EKSPORT QILINADI VA U PUL YO'LIDA: `holidayKeySetForRange`
 * ni DAVOMAT, o'quvchi TO'LOVI (proratsiya) va o'qituvchi MAOSHI
 * chaqiradi. O'sha modullar ko'chirilganda ular SHU servisdan
 * foydalanishi kerak — nusxa ko'chirilsa bayram ta'rifi ikki joyda
 * ikki xil bo'lib, hisoblangan summalar ajralib ketardi.
 */
@Module({
  imports: [NotificationsModule],
  controllers: [HolidaysController],
  providers: [HolidaysService],
  exports: [HolidaysService],
})
export class HolidaysModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(HolidaysController);
  }
}
