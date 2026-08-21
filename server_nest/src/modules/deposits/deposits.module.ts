import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { DepositsController } from './deposits.controller.js';
import { DepositsService } from './deposits.service.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';
import { FinanceModule } from '../finance/finance.module.js';
import { ExpenseApprovalsModule } from '../expense-approvals/expense-approvals.module.js';

/**
 * DEPOZIT MODULI (FAZA 7.7) — 8/8 marshrut.
 *
 * `FinanceModule` — jurnal yozuvlari (`FinancialTransactionService`) va
 * oylik plan balansi (`StudentPaymentService.applyPaidDelta`). Buxgalteriya
 * mantig'i BU YERDA QAYTA YOZILMAYDI.
 *
 * `ExpenseApprovalsModule` — chiqim limiti (`checkExpenseLimit`) va
 * limitdan oshganda tasdiq so'rovi (`createRequest`).
 *
 * ⚠ `DepositsService` EKSPORT QILINADI: `openingBalance` (boshlang'ich
 * qoldiq), `finance/transaction` (to'lovni bekor qilganda depozitga
 * qaytarish) va `expense-approvals` bajaruvchisi unga tayanadi.
 */
@Module({
  imports: [FinanceModule, ExpenseApprovalsModule],
  controllers: [DepositsController],
  providers: [DepositsService],
  exports: [DepositsService],
})
export class DepositsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(DepositsController);
  }
}
