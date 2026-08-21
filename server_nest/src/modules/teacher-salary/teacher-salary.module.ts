import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { TeacherSalaryController } from './teacher-salary.controller.js';
import { TeacherSalaryService } from './teacher-salary.service.js';
import { SalaryTransactionService } from './salary-transaction.service.js';
import { SalaryAdjustmentService } from './salary-adjustment.service.js';
import { TeacherCompensationService } from './teacher-compensation.service.js';
import { VariableBaseService } from './variable-base.service.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';
import { FinanceModule } from '../finance/finance.module.js';
import { ExpenseApprovalsModule } from '../expense-approvals/expense-approvals.module.js';
import { HolidaysModule } from '../holidays/holidays.module.js';
import { GroupsModule } from '../groups/groups.module.js';

/**
 * O'QITUVCHI MAOSHI (FAZA 8.1) — 15/15 marshrut.
 *
 * ⚠ BARCHA MOLIYAVIY INFRATUZILMA QAYTA ISHLATILADI, TAKRORLANMAYDI:
 *   • `FinancialTransactionService.postTeacherPayroll` — jurnal yozuvi
 *   • `ExpenseApprovalsService` — chiqim limiti va tasdiq oqimi
 *   • `FINANCE_TXN_OPTIONS` — tranzaksiya chegaralari
 *   • `common/utils/proration.ts` — `deriveStatus` / `daysInMonth`
 *   • `HolidaysService`, `LessonCancellationService` — soatbay baza
 *   • `TeacherGroupPeriodService` — dars berish davrlari
 *
 * `TeacherSalaryService` EKSPORT qilinadi: `groups` (o'qituvchi
 * biriktirish) va `staffPayroll` hisobotlari unga tayanadi.
 */
@Module({
  imports: [
    FinanceModule,
    ExpenseApprovalsModule,
    HolidaysModule,
    GroupsModule,
  ],
  controllers: [TeacherSalaryController],
  providers: [
    TeacherSalaryService,
    SalaryTransactionService,
    SalaryAdjustmentService,
    TeacherCompensationService,
    VariableBaseService,
  ],
  exports: [
    TeacherSalaryService,
    SalaryTransactionService,
    SalaryAdjustmentService,
    TeacherCompensationService,
  ],
})
export class TeacherSalaryModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(TeacherSalaryController);
  }
}
