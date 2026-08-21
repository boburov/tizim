import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { SystemNotificationsController } from './system-notifications.controller.js';
import { SystemNotificationsService } from './system-notifications.service.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';

/**
 * Tizim bildirishnomalari — butun modul owner uchun.
 *
 * ⚠ SERVIS EKSPORT QILINADI: boshqa modullar (`users` hayot sikli va h.k.)
 * owner'ga yozuv qo'shadi. Hozircha ular
 * `common/helpers/system-notification.service.ts` KO'PRIGIDAN
 * foydalanadi — u shu modul bilan almashtirilishi kerak (BOSHQA AGENT
 * ishi tugagach; hozir o'chirilsa ularning ish daraxti buzilardi).
 */
@Module({
  controllers: [SystemNotificationsController],
  providers: [SystemNotificationsService],
  exports: [SystemNotificationsService],
})
export class SystemNotificationsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(SystemNotificationsController);
  }
}
