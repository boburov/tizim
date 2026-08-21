import { MiddlewareConsumer, Module, NestModule, OnModuleInit } from '@nestjs/common';
import { StaffPayrollController } from './staff-payroll.controller.js';
import { StaffPayrollService } from './staff-payroll.service.js';
import { StaffCompensationService } from './staff-compensation.service.js';
import { StaffAdjustmentService } from './staff-adjustment.service.js';
import { StaffSalaryTransactionService } from './staff-salary-transaction.service.js';
import { PayrollHistoryService } from './payroll-history.service.js';
import { PayrollAuditService } from './payroll-audit.service.js';
import { KpiRuleService } from './kpi-rule.service.js';
import { KpiEngineService } from './kpi-engine.service.js';
import { KpiTriggersService } from './kpi-triggers.service.js';
import { FinanceModule } from '../finance/finance.module.js';
import { ExpenseApprovalsModule } from '../expense-approvals/expense-approvals.module.js';
import { ApprovalExecutorRegistry } from '../../common/approvals/approval-executor.registry.js';
import { APPROVAL_KINDS } from '../../common/constants/approvals.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * XODIMLAR MAOSHI moduli (30/30 marshrut).
 *
 * ⚠ BOG'LIQLIKLAR OCHIQ IMPORT QILINADI — HECH BIRI TAKRORLANMAGAN:
 *   • `FinanceModule`          → `postStaffPayroll` (jurnal yozuvi)
 *   • `ExpenseApprovalsModule` → chiqim limiti + tasdiq so'rovi
 *
 * ⚠ `UsersModule` BU YERDA IMPORT QILINMAYDI — u AKSINCHA, SHU modulni
 * import qiladi (`PATCH /users/:id` da `hiredAt` o'zgarsa audit izi
 * qolishi uchun). Teskari import modul AYLANASINI tug'dirardi.
 *
 * ⚠ O'QITUVCHI MAOSHI MODULI HAM IMPORT QILINMAYDI. `setLock(kind:
 * "teacher")` `TeacherSalary` QATORINI to'g'ridan-to'g'ri yangilaydi va
 * `TeacherSalaryService` ga TEGMAYDI — Express'da ham shunday:
 * hisob-kitob o'zgarmaydi, faqat `isLocked` bayrog'i qo'yiladi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Module({
  imports: [FinanceModule, ExpenseApprovalsModule],
  controllers: [StaffPayrollController],
  providers: [
    StaffPayrollService,
    StaffCompensationService,
    StaffAdjustmentService,
    StaffSalaryTransactionService,
    PayrollHistoryService,
    PayrollAuditService,
    KpiRuleService,
    KpiEngineService,
    KpiTriggersService,
  ],
  exports: [
    PayrollAuditService,
    StaffPayrollService,
    StaffCompensationService,
    StaffSalaryTransactionService,
  ],
})
export class StaffPayrollModule implements NestModule, OnModuleInit {
  constructor(
    private readonly executors: ApprovalExecutorRegistry,
    private readonly transactions: StaffSalaryTransactionService,
  ) {}

  /**
   * XODIM MAOSHI to'lovining TASDIQ BAJARUVCHISI.
   *
   * Bog'liqlik AYLANMA (bu modul `ExpenseApprovalsModule` ni import
   * qiladi, approvals esa tasdiqlangan so'rovni bajarish uchun shu
   * servisni chaqirishi kerak). Express dinamik import bilan hal
   * qiladi; NestJS'da ekvivalenti — registry orqali KECH BOG'LASH.
   */
  onModuleInit(): void {
    this.executors.register(APPROVAL_KINDS.STAFF_SALARY_PAYMENT, (a) =>
      this.transactions.executeApproved(a),
    );
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(StaffPayrollController);
  }
}
