import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { PersonalizeBodyService } from './personalize-body.service.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';
import { JobsModule } from '../../jobs/jobs.module.js';
import { BotModule } from '../../bot/bot.module.js';

/**
 * BILDIRISHNOMALAR moduli. Barcha 11 marshrut `requireAuth` ostida —
 * Express'da ham shunday, ochiq (auth'siz) yo'l YO'Q.
 *
 * `JobsModule` — `SchedulerService` uchun: rejalashtirilgan yuborish va
 * bot yetkazish pg-boss navbatiga qo'yiladi.
 *
 * `BotModule` — `deliverNotification` (fon job'i) Telegram'ga yozadi.
 *
 * ⚠ `NotificationsService` EKSPORT QILINADI: `holidays`, `leads` va
 * `feedback` modullari undan foydalanadi (Express'da ham ular
 * `notifications.service.js` ni to'g'ridan-to'g'ri import qiladi).
 */
@Module({
  // `BotModule` — `deliverNotification` Telegram push uchun
  // `NotificationDeliverService` ga tayanadi. ⚠ Halqa YO'Q: `BotModule`
  // bildirishnomalar haqida hech narsa bilmaydi.
  imports: [JobsModule, BotModule],
  controllers: [NotificationsController],
  providers: [NotificationsService, PersonalizeBodyService],
  exports: [NotificationsService, PersonalizeBodyService],
})
export class NotificationsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(NotificationsController);
  }
}
