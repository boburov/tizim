import { MiddlewareConsumer, Module, NestModule, OnModuleInit } from '@nestjs/common';
import { ExpensesController } from './expenses.controller.js';
import { ExpenseService } from './expense.service.js';
import { ExpenseCategoryService } from './expense-category.service.js';
import { FinanceModule } from '../finance/finance.module.js';
import { ExpenseApprovalsModule } from '../expense-approvals/expense-approvals.module.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';
import { ApprovalExecutorRegistry } from '../../common/approvals/approval-executor.registry.js';
import { APPROVAL_KINDS } from '../../common/constants/approvals.js';

/**
 * UMUMIY CHIQIMLAR (FAZA 7.6).
 *
 * ⚠ `ExpenseService` EKSPORT QILINADI: `executeApprovedExpense` —
 * `EXPENSE_CREATE` tasdig'ining BAJARUVCHISI. `expense-approvals`
 * dagi `approve` ochilganda u shu metodni chaqiradi.
 */
@Module({
  imports: [FinanceModule, ExpenseApprovalsModule],
  controllers: [ExpensesController],
  providers: [ExpenseService, ExpenseCategoryService],
  exports: [ExpenseService],
})
export class ExpensesModule implements NestModule, OnModuleInit {
  constructor(
    private readonly executors: ApprovalExecutorRegistry,
    private readonly svc: ExpenseService,
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
    this.executors.register(APPROVAL_KINDS.EXPENSE_CREATE, (a) =>
      this.svc.executeApprovedExpense(a),
    );
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(ExpensesController);
  }
}
