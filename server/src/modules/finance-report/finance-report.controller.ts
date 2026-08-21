import { Controller, Get, UseGuards } from '@nestjs/common';
import { FinanceReportService } from './finance-report.service.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { Permissions, Validated } from '../../common/decorators/index.js';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import {
  periodSchema,
  trendSchema,
  breakdownSchema,
  writeOffsSchema,
  type PeriodRequest,
  type TrendRequest,
  type BreakdownRequest,
  type WriteOffsRequest,
} from './finance-report.validators.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MOLIYA HISOBOTI — Express `financeReport.routes.js` EKVIVALENTI (5/5).
 *
 * Hammasi `finance.read` ostida va hammasi FAQAT O'QISH.
 *
 * ⚠ Handler'lar `req.query` NI TO'G'RIDAN-TO'G'RI servisga uzatadi
 * (`service.getSummary(req.query)`). Express `validate()` esa `req.query`
 * ni ZOD CHIQARGAN qiymat bilan ALMASHTIRIB qo'yadi — ya'ni servisga
 * SON keladi, satr emas. NestJS'da `@Validated()` `req` ni
 * o'zgartirmaydi, shuning uchun tekshirilgan qiymat OCHIQ uzatiladi.
 * Aks holda `year`/`month` satr bo'lib borardi va `Number(...)` siz
 * ishlatiladigan joylar (masalan `r.year === Number(year)`) jimgina
 * boshqacha natija berardi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Controller('finance-report')
@UseGuards(PermissionsGuard)
export class FinanceReportController {
  constructor(private readonly reports: FinanceReportService) {}

  @Get('summary')
  @Permissions(PERMISSIONS.FINANCE_READ)
  async summary(@Validated(periodSchema) v: PeriodRequest) {
    return { success: true, data: await this.reports.getSummary(v.query) };
  }

  @Get('trend')
  @Permissions(PERMISSIONS.FINANCE_READ)
  async trend(@Validated(trendSchema) v: TrendRequest) {
    return { success: true, data: await this.reports.getTrend(v.query) };
  }

  @Get('group-breakdown')
  @Permissions(PERMISSIONS.FINANCE_READ)
  async groupBreakdown(@Validated(breakdownSchema) v: BreakdownRequest) {
    return { success: true, data: await this.reports.getGroupBreakdown(v.query) };
  }

  @Get('ledger')
  @Permissions(PERMISSIONS.FINANCE_READ)
  async ledger(@Validated(breakdownSchema) v: BreakdownRequest) {
    return { success: true, data: await this.reports.getLedger(v.query) };
  }

  @Get('write-offs')
  @Permissions(PERMISSIONS.FINANCE_READ)
  async writeOffs(@Validated(writeOffsSchema) v: WriteOffsRequest) {
    return { success: true, data: await this.reports.getWriteOffs(v.query) };
  }
}
