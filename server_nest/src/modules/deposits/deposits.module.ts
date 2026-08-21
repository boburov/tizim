import { MiddlewareConsumer, Module, NestModule, OnModuleInit } from '@nestjs/common';
import { DepositsController } from './deposits.controller.js';
import { DepositsService } from './deposits.service.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';
import { ApprovalExecutorRegistry } from '../../common/approvals/approval-executor.registry.js';
import { APPROVAL_KINDS } from '../../common/constants/approvals.js';
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
export class DepositsModule implements NestModule, OnModuleInit {
  constructor(
    private readonly executors: ApprovalExecutorRegistry,
    private readonly svc: DepositsService,
  ) {}

/**
 * ⚠ TASDIQ BAJARUVCHISINI RO'YXATGA OLADI.
 *
 * Bog'liqlik AYLANMA (bu servis approvals'ni chaqiradi, approvals esa
 * bajarish uchun buni chaqiradi). Express dinamik import bilan hal
 * qiladi; NestJS'da ekvivalenti — KECH BOG'LASH orqali registry.
 * Batafsil: `common/approvals/approval-executor.registry.ts`.
 */
  onModuleInit(): void {
    this.executors.register(APPROVAL_KINDS.DEPOSIT_WITHDRAW, (a) =>
      this.svc.executeApprovedWithdraw(a),
    );
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(DepositsController);
  }
}
