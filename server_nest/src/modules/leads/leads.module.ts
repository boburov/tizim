import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { LeadsController } from './leads.controller.js';
import { LeadsService } from './leads.service.js';
import { LeadRoutingService } from './lead-routing.service.js';
import { LeadConversionService } from './lead-conversion.service.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';

/**
 * LIDLAR moduli (14/16 marshrut).
 *
 * ⚠ `convert` / `convert-bulk` KO'CHIRILMAGAN: ular
 * `GroupsService.addStudent` ga tayanadi va `groups` NestJS'da hozircha
 * faqat o'qish. Biznes mantiq NUSXALANMADI.
 *
 * ⚠ SERVISLAR EKSPORT QILINADI: lid eslatma joblari (`leadFollowupReminders`,
 * `leadDailyDigest`) `dueReminders`/`remindersUpTo`/`markReminderNotified`
 * ga tayanadi, bot esa `LeadRoutingService.route` ga.
 */
@Module({
  controllers: [LeadsController],
  providers: [LeadsService, LeadRoutingService, LeadConversionService],
  exports: [LeadsService, LeadRoutingService, LeadConversionService],
})
export class LeadsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(LeadsController);
  }
}
