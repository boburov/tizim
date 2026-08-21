import {
  MiddlewareConsumer, Module, NestModule, OnModuleInit, forwardRef,
} from '@nestjs/common';
import { DimensionResolverService } from './dimension-resolver.service.js';
import { FinancialTransactionService } from './financial-transaction.service.js';
import { StudentPaymentService } from './student-payment.service.js';
import { GroupFeeService } from './group-fee.service.js';
import { DiscountService } from './discount.service.js';
import { TransactionService } from './transaction.service.js';
import { FinanceController } from './finance.controller.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';
import { ApprovalExecutorRegistry } from '../../common/approvals/approval-executor.registry.js';
import { APPROVAL_KINDS } from '../../common/constants/approvals.js';
import { JournalModule } from '../journal/journal.module.js';
import { StudentFreezeModule } from '../student-freeze/student-freeze.module.js';
import { HolidaysModule } from '../holidays/holidays.module.js';
import { CoursesModule } from '../courses/courses.module.js';
import { ExpenseApprovalsModule } from '../expense-approvals/expense-approvals.module.js';
import { TeacherSalaryModule } from '../teacher-salary/teacher-salary.module.js';
import { DepositsModule } from '../deposits/deposits.module.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MOLIYA YADROSI (FAZA 7.4) + `/api/finance` MARSHRUTLARI (13/13).
 *
 * `financialTransaction` — pul YOZISHNING yagona nuqtasi.
 * `studentPayment`       — o'quvchi BILLING'ining yagona nuqtasi.
 * `groupFee`             — guruh oylik tarifi (billing manbai).
 * `discount`             — chegirma (expected'ni kamaytiradi).
 * `transaction`          — kirim (kassa) va uni bekor qilish.
 *
 * ── IMPORTLAR NEGA AYNAN SHULAR ──
 *   `StudentFreezeModule`   — muzlatilgan kun uchun o'quvchi TO'LAMAYDI
 *   `HolidaysModule`        — bayram kuni dars hisoblanmaydi
 *   `JournalModule`         — buxgalteriya yozuvlari
 *   `CoursesModule`         — yangi guruh tarifi katalog narxidan meros
 *   `ExpenseApprovalsModule`— chegirma/tarif tasdig'i (`createRequest`)
 * `LessonCancellationService` global `CommonModule` dan keladi.
 *
 * ── ⚠ IKKI TA `forwardRef` — HAQIQIY AYLANA ──
 *
 * `TeacherSalaryModule` va `DepositsModule` IKKALASI ham `FinanceModule`
 * ni import qiladi (`applyPaidDelta`, jurnal). Bu yerda esa teskari
 * yo'nalish KERAK:
 *
 *   • `GroupFeeService`/`DiscountService` → `TeacherSalaryService`
 *     tarif yoki chegirma o'zgarsa o'qituvchining FOIZ maoshi qayta
 *     hisoblanishi shart (best-effort, Express'dagidek);
 *   • `TransactionService` → `DepositsService`
 *     barcha qarz yopilgach ORTGAN pul garov sifatida depozitga tushadi
 *     (bu best-effort EMAS — pul yo'lining bir qismi).
 *
 * Express'da aylana ESM ko'tarilishi bilan JIMGINA yopiladi; NestJS'da
 * `forwardRef` — o'sha narsaning OCHIQ ifodasi. MANTIQ NUSXA
 * KO'CHIRILMADI: maosh dvigateli ham, depozit dvigateli ham BITTA
 * joyda qoladi.
 *
 * ⚠ Aylanani "yechish" uchun mantiqni ikkiga bo'lish TAKLIF QILINMADI:
 * o'sha ikki nusxa vaqt o'tib ajralib ketardi va pul ikki xil
 * hisoblanardi — bu aynan ko'chirish oldini olishi kerak bo'lgan xato.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Module({
  imports: [
    JournalModule,
    StudentFreezeModule,
    HolidaysModule,
    CoursesModule,
    ExpenseApprovalsModule,
    forwardRef(() => TeacherSalaryModule),
    forwardRef(() => DepositsModule),
  ],
  controllers: [FinanceController],
  providers: [
    DimensionResolverService,
    FinancialTransactionService,
    StudentPaymentService,
    GroupFeeService,
    DiscountService,
    TransactionService,
  ],
  exports: [
    DimensionResolverService,
    FinancialTransactionService,
    StudentPaymentService,
    GroupFeeService,
    DiscountService,
    TransactionService,
  ],
})
export class FinanceModule implements NestModule, OnModuleInit {
  constructor(
    private readonly executors: ApprovalExecutorRegistry,
    private readonly fees: GroupFeeService,
    private readonly discounts: DiscountService,
  ) {}

  /**
   * ⚠ TASDIQ BAJARUVCHILARINI RO'YXATGA OLADI.
   *
   * Bog'liqlik aylanma (bu servislar approvals'ni chaqiradi, approvals
   * esa bajarish uchun bularni chaqiradi). Batafsil:
   * `common/approvals/approval-executor.registry.ts`.
   */
  onModuleInit(): void {
    this.executors.register(APPROVAL_KINDS.DISCOUNT_SET, (a) =>
      this.discounts.executeApprovedDiscount(a),
    );
    this.executors.register(APPROVAL_KINDS.GROUP_FEE_SET, (a) =>
      this.fees.executeApprovedGroupFee(a),
    );
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(FinanceController);
  }
}
