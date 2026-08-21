import { Controller, Get, UseGuards } from '@nestjs/common';
import { AdminDashboardService } from './admin-dashboard.service.js';
import { StudentStatsService } from './student-stats.service.js';
import { RetentionService } from './retention.service.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { Permissions, Validated } from '../../common/decorators/index.js';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import {
  periodSchema, monthsBackSchema, cashflowSchema,
  studentStatsSchema, retentionSchema,
  type PeriodRequest, type MonthsBackRequest, type CashflowRequest,
  type StudentStatsRequest, type RetentionRequest,
} from './admin-dashboard.validators.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RAHBARIYAT PANELI — Express `adminDashboard.routes.js` NING TO'LIQ
 * EKVIVALENTI (6/6).
 *
 * ⚠ BARCHA OLTITASI `admin_dashboard.read` TALAB QILADI — bittasi ham
 * ochiq emas. Javoblar butun markazning moliyaviy va shaxsiy
 * ma'lumotini jamlaydi.
 *
 * ⚠ MARSHRUT TARTIBI MUHIM EMAS: hammasi STATIK yo'l, `/:id` YO'Q.
 * Shuning uchun bu yerda tartib qoidasi qo'llanmaydi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Controller('admin-dashboard')
@UseGuards(PermissionsGuard)
export class AdminDashboardController {
  constructor(
    private readonly dashboard: AdminDashboardService,
    private readonly studentStats: StudentStatsService,
    private readonly retention: RetentionService,
  ) {}

  @Get('overview')
  @Permissions(PERMISSIONS.ADMIN_DASHBOARD_READ)
  async overview(@Validated(periodSchema) v: PeriodRequest) {
    return { success: true, data: await this.dashboard.getOverview(v.query) };
  }

  @Get('student-flow')
  @Permissions(PERMISSIONS.ADMIN_DASHBOARD_READ)
  async studentFlow(@Validated(monthsBackSchema) v: MonthsBackRequest) {
    return { success: true, data: await this.dashboard.getStudentFlow(v.query) };
  }

  @Get('cashflow')
  @Permissions(PERMISSIONS.ADMIN_DASHBOARD_READ)
  async cashflow(@Validated(cashflowSchema) v: CashflowRequest) {
    return { success: true, data: await this.dashboard.getCashflow(v.query) };
  }

  @Get('student-stats')
  @Permissions(PERMISSIONS.ADMIN_DASHBOARD_READ)
  async studentStatsRoute(@Validated(studentStatsSchema) v: StudentStatsRequest) {
    return { success: true, data: await this.studentStats.getStudentStats(v.query) };
  }

  /** ⚠ FILIAL KO'LAMI YO'Q (B24) — servisdagi izohga qarang. */
  @Get('retention')
  @Permissions(PERMISSIONS.ADMIN_DASHBOARD_READ)
  async retentionRoute(@Validated(retentionSchema) v: RetentionRequest) {
    return { success: true, data: await this.retention.getRetentionStats(v.query) };
  }

  /** ⚠ FILIAL KO'LAMI YO'Q (B24) va javobda PII bor (ism, login). */
  @Get('churned-students')
  @Permissions(PERMISSIONS.ADMIN_DASHBOARD_READ)
  async churnedStudents(@Validated(retentionSchema) v: RetentionRequest) {
    return { success: true, data: await this.retention.getChurnedStudents(v.query) };
  }
}
