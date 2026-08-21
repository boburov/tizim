import {
  MiddlewareConsumer,
  Module,
  NestModule,
  OnModuleInit,
} from '@nestjs/common';
import { TeacherSalaryController } from './teacher-salary.controller.js';
import { TeacherSalaryService } from './teacher-salary.service.js';
import { SalaryTransactionService } from './salary-transaction.service.js';
import { SalaryAdjustmentService } from './salary-adjustment.service.js';
import { TeacherCompensationService } from './teacher-compensation.service.js';
import { VariableBaseService } from './variable-base.service.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';
import { ApprovalExecutorRegistry } from '../../common/approvals/approval-executor.registry.js';
import { APPROVAL_KINDS } from '../../common/constants/approvals.js';
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
export class TeacherSalaryModule implements NestModule, OnModuleInit {
  constructor(
    private readonly executors: ApprovalExecutorRegistry,
    private readonly payouts: SalaryTransactionService,
    private readonly compensation: TeacherCompensationService,
  ) {}

  /**
   * ⚠ IKKI TASDIQ BAJARUVCHISI RO'YXATGA OLINADI.
   *
   * Bog'liqlik AYLANMA (bu modul `ExpenseApprovalsModule` ni import
   * qiladi, approvals esa bajarish uchun bu servislarni chaqiradi).
   * Express dinamik import bilan hal qiladi; NestJS'da ekvivalenti —
   * KECH BOG'LASH orqali registry.
   */
  onModuleInit(): void {
    this.executors.register(APPROVAL_KINDS.SALARY_PAYMENT, (a) =>
      this.payouts.executeApproved(a),
    );
    this.executors.register(APPROVAL_KINDS.TEACHER_COMPENSATION_SET, (a) =>
      this.compensation.executeApprovedCompensation(a),
    );
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(TeacherSalaryController);
  }
}
