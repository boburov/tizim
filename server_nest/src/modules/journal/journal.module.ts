import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { JournalController } from './journal.controller.js';
import { JournalService } from './journal.service.js';
import { JournalVerifyService } from './journal-verify.service.js';
import { ShiftService } from './shift.service.js';
import { CashTransferService } from './cash-transfer.service.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';

/**
 * KASSA JURNALI — FAZA 7 ning POYDEVORI.
 *
 * ⚠ `JournalService` EKSPORT QILINADI. Butun moliya quyi tizimi
 * (to'lov, depozit, chiqim, maosh, qaytarim, o'tkazma) jurnalga
 * SHU servis orqali yozadi — ikkinchi yozish yo'li BO'LMASLIGI
 * moliyaviy to'g'rilikning asosiy sharti. Express tomonda ham
 * shunday: `journalPosting.helper.js` ATAYLAB o'chirilgan edi.
 */
@Module({
  controllers: [JournalController],
  providers: [
    JournalService,
    JournalVerifyService,
    ShiftService,
    CashTransferService,
  ],
  exports: [JournalService, JournalVerifyService],
})
export class JournalModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(JournalController);
  }
}
