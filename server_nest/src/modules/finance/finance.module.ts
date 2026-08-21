import { Module } from '@nestjs/common';
import { DimensionResolverService } from './dimension-resolver.service.js';
import { FinancialTransactionService } from './financial-transaction.service.js';
import { StudentPaymentService } from './student-payment.service.js';
import { JournalModule } from '../journal/journal.module.js';
import { StudentFreezeModule } from '../student-freeze/student-freeze.module.js';
import { HolidaysModule } from '../holidays/holidays.module.js';

/**
 * MOLIYA YADROSI (FAZA 7.4).
 *
 * ⚠ HOZIRCHA MARSHRUT YO'Q — bu ATAYLAB.
 *
 * `financialTransaction` — pul YOZISHNING yagona nuqtasi.
 * `studentPayment` — o'quvchi BILLING'ining yagona nuqtasi. Ikkalasi ham
 * HTTP yuzasiz: ularni chiqim, depozit, guruh, davomat, muzlatish va
 * maosh modullari chaqiradi.
 *
 * `/api/finance` marshrutlari (`student-payments`, `group-fees`,
 * `discounts`, `transactions`) `discount`/`groupFee`/`transaction`
 * servislari ko'chgach ochiladi.
 *
 * ── IMPORTLAR NEGA AYNAN SHULAR ──
 *   `StudentFreezeModule` — muzlatilgan kun uchun o'quvchi TO'LAMAYDI
 *   `HolidaysModule`      — bayram kuni dars hisoblanmaydi
 *   `JournalModule`       — buxgalteriya yozuvlari
 * `LessonCancellationService` global `CommonModule` dan keladi.
 *
 * ⚠ `DepositsModule` IMPORT QILINMAYDI — u O'ZI `FinanceModule` ni
 * import qiladi va teskari yo'nalish modul AYLANASINI tug'dirardi.
 * Ortiqcha to'lovni depozitga qaytarish `StudentPaymentService.onOverpay`
 * orqali KECH bog'lanadi (Express ham o'sha joyda dinamik `import()`
 * ishlatadi).
 */
@Module({
  imports: [JournalModule, StudentFreezeModule, HolidaysModule],
  providers: [
    DimensionResolverService,
    FinancialTransactionService,
    StudentPaymentService,
  ],
  exports: [
    DimensionResolverService,
    FinancialTransactionService,
    StudentPaymentService,
  ],
})
export class FinanceModule {}
