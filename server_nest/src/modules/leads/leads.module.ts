import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { LeadsController } from './leads.controller.js';
import { LeadsService } from './leads.service.js';
import { LeadRoutingService } from './lead-routing.service.js';
import { LeadNotifyService } from './lead-notify.service.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { LeadConversionService } from './lead-conversion.service.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';
import { AuthModule } from '../auth/auth.module.js';
import { GroupsModule } from '../groups/groups.module.js';

/**
 * LIDLAR moduli — 16/16 marshrut.
 *
 * ⚠ `AuthModule` va `GroupsModule` OCHIQ import qilinadi: lidni
 * o'quvchiga aylantirish `registerUser` + `addStudent` ga tayanadi.
 * AYLANA YO'Q — ularning birortasi `LeadsModule` ni import qilmaydi.
 *
 * ⚠ SERVISLAR EKSPORT QILINADI: lid eslatma joblari (`leadFollowupReminders`,
 * `leadDailyDigest`) `dueReminders`/`remindersUpTo`/`markReminderNotified`
 * ga tayanadi, bot esa `LeadRoutingService.route` ga.
 */
@Module({
  // ⚠ `NotificationsModule` — `LeadNotifyService` eslatmalarni AYNI
  // `notifications.send` orqali yuboradi (platforma + Telegram bitta
  // amalda). Ikkinchi yuborish yo'li yaratilsa dedupe kaliti bo'linib
  // ketardi va odam IKKI xabar olardi.
  imports: [AuthModule, GroupsModule, NotificationsModule],
  controllers: [LeadsController],
  providers: [LeadsService, LeadRoutingService, LeadConversionService, LeadNotifyService],
  exports: [LeadsService, LeadRoutingService, LeadConversionService, LeadNotifyService],
})
export class LeadsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(LeadsController);
  }
}
