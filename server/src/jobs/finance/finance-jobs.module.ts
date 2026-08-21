import { Injectable, Module, type OnModuleInit } from '@nestjs/common';
import { FinanceModule } from '../../modules/finance/finance.module.js';
import { DepositsModule } from '../../modules/deposits/deposits.module.js';
import { StaffPayrollModule } from '../../modules/staff-payroll/staff-payroll.module.js';
import { TeacherSalaryModule } from '../../modules/teacher-salary/teacher-salary.module.js';
import { GroupsModule } from '../../modules/groups/groups.module.js';
import { SystemNotificationsModule } from '../../modules/system-notifications/system-notifications.module.js';
import { JobsModule, JobsRegistry } from '../jobs.module.js';
import {
  MonthlyGenerateFinanceJob,
  MonthlyGenerateSalaryJob,
  MonthlyGenerateStaffPayrollJob,
} from './monthly-generate.job.js';
import { DailyAccrueFinanceJob } from './daily-accrue.job.js';

/**
 * MOLIYA job oilasi — 4 ta job.
 *
 * ⚠ RO'YXATGA OLISH ≠ ISHGA TUSHISH. Kesishuv davrida bu joblarni
 * EXPRESS yuritadi: ikkala stek bir cronni ro'yxatga olsa oylik
 * generatsiya IKKI MARTA yurardi — bu esa PUL yozuvlari.
 */
@Injectable()
export class FinanceJobsRegistrar implements OnModuleInit {
  constructor(
    private readonly registry: JobsRegistry,
    private readonly finance: MonthlyGenerateFinanceJob,
    private readonly salary: MonthlyGenerateSalaryJob,
    private readonly payroll: MonthlyGenerateStaffPayrollJob,
    private readonly accrue: DailyAccrueFinanceJob,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.finance, this.salary, this.payroll, this.accrue);
  }
}

@Module({
  imports: [
    JobsModule,
    FinanceModule,
    DepositsModule,
    StaffPayrollModule,
    TeacherSalaryModule,
    GroupsModule,
    SystemNotificationsModule,
  ],
  providers: [
    MonthlyGenerateFinanceJob,
    MonthlyGenerateSalaryJob,
    MonthlyGenerateStaffPayrollJob,
    DailyAccrueFinanceJob,
    FinanceJobsRegistrar,
  ],
})
export class FinanceJobsModule {}
