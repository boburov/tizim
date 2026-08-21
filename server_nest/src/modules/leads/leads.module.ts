import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { LeadsController } from './leads.controller.js';
import { LeadsService } from './leads.service.js';
import { LeadRoutingService } from './lead-routing.service.js';
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
  imports: [AuthModule, GroupsModule],
  controllers: [LeadsController],
  providers: [LeadsService, LeadRoutingService, LeadConversionService],
  exports: [LeadsService, LeadRoutingService, LeadConversionService],
})
export class LeadsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(LeadsController);
  }
}
