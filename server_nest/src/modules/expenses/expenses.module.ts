import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ExpensesController } from './expenses.controller.js';
import { ExpenseService } from './expense.service.js';
import { ExpenseCategoryService } from './expense-category.service.js';
import { FinanceModule } from '../finance/finance.module.js';
import { ExpenseApprovalsModule } from '../expense-approvals/expense-approvals.module.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';

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
export class ExpensesModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(ExpensesController);
  }
}
