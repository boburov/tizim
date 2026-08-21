import { Module } from '@nestjs/common';
import { DimensionResolverService } from './dimension-resolver.service.js';
import { FinancialTransactionService } from './financial-transaction.service.js';
import { StudentPaymentService } from './student-payment.service.js';
import { JournalModule } from '../journal/journal.module.js';

/**
 * MOLIYA YADROSI (FAZA 7.4).
 *
 * ⚠ HOZIRCHA MARSHRUT YO'Q — bu ATAYLAB.
 *
 * `financialTransaction` — pul yozishning YAGONA nuqtasi. U chiqim,
 * depozit, moliyaviy amallar va maosh modullariga KERAK, lekin o'zi
 * HTTP yuzasiga ega emas. Marshrutlar (`/api/finance`: to'lov rejasi,
 * chegirma, guruh narxi) `studentPayment`/`discount`/`groupFee`
 * servislari ko'chgach ochiladi — ular hali `attendance`, `groups` va
 * `holidays` ga tayanadi.
 *
 * Modul shu bosqichda ham QIYMAT beradi: uni chaqiradigan modullar
 * (expenses, deposits, finance-ops) endi buxgalteriya mantig'ini
 * QAYTA YOZMASDAN ko'chirilishi mumkin — "ikkinchi buxgalteriya
 * implementatsiyasi bo'lmasin" talabi shu bilan bajariladi.
 */
@Module({
  imports: [JournalModule],
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
