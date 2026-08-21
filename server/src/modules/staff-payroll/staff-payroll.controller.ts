import {
  Controller, Delete, Get, HttpCode, Patch, Post, Req, Res, UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { StaffPayrollService } from './staff-payroll.service.js';
import { StaffCompensationService } from './staff-compensation.service.js';
import { StaffAdjustmentService } from './staff-adjustment.service.js';
import { KpiRuleService } from './kpi-rule.service.js';
import { StaffSalaryTransactionService } from './staff-salary-transaction.service.js';
import { PayrollHistoryService } from './payroll-history.service.js';
import { PayrollAuditService } from './payroll-audit.service.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { Permissions, Validated } from '../../common/decorators/index.js';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import { parsePagination, buildMeta } from '../../common/utils/pagination.js';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.js';
import {
  listSchema, idParamSchema, employeeParamSchema, generateSchema,
  recomputeSchema, lifecycleSchema, compensationSetSchema,
  compensationPatchSchema, adjustmentCreateSchema, ruleCreateSchema,
  ruleUpdateSchema, ruleListSchema, assignmentSetSchema,
  transactionCreateSchema, generateRangeSchema, recalcUnlockedSchema,
  payrollStartSchema, previewSchema, lockSchema,
  type ListRequest, type IdParamRequest, type EmployeeParamRequest,
  type GenerateRequest, type RecomputeRequest, type LifecycleRequest,
  type CompensationSetRequest, type CompensationPatchRequest,
  type AdjustmentCreateRequest, type RuleCreateRequest, type RuleUpdateRequest,
  type RuleListRequest, type AssignmentSetRequest, type TransactionCreateRequest,
  type GenerateRangeRequest, type RecalcUnlockedRequest, type PayrollStartRequest,
  type PreviewRequest, type LockRequest,
} from './staff-payroll.validators.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * XODIMLAR MAOSHI — Express `staffPayroll.routes.js` NING TO'LIQ
 * EKVIVALENTI (30/30).
 *
 * ── UCH DARAJA ATAYLAB AJRATILGAN ──
 *   `payroll.read`   — maoshni ko'rish (hisobotchi)
 *   `payroll.manage` — shartnoma va KPI qoidalari ("shartlarni belgilash")
 *   `payroll.pay`    — PUL CHIQISHI
 * Ko'rish huquqi bergan odam avtomatik ravishda TO'LASH huquqini OLMAYDI.
 *
 * ⚠⚠ E'LON TARTIBI O'ZGARTIRILMASIN ⚠⚠
 * `/kpi/*`, `/compensations/*`, `/adjustments/*`, `/transactions/*`,
 * `/history/*`, `/generate`, `/by-employee/:employeeId` — HAMMASI
 * `/:id` DAN OLDIN. Express'da aks holda `/:id` ularni yutib yuborardi
 * va `id` validatori 400 qaytarardi. NestJS aniq segmentni parametrdan
 * ustun ko'rsa ham, tartib ATAYLAB takrorlangan.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Controller('staff-payroll')
@UseGuards(PermissionsGuard)
export class StaffPayrollController {
  constructor(
    private readonly payroll: StaffPayrollService,
    private readonly compensation: StaffCompensationService,
    private readonly adjustment: StaffAdjustmentService,
    private readonly rules: KpiRuleService,
    private readonly transactions: StaffSalaryTransactionService,
    private readonly history: PayrollHistoryService,
    private readonly audit: PayrollAuditService,
  ) {}

  // ═══════════════════════ KPI QOIDALARI ═══════════════════════

  @Get('kpi/triggers')
  @Permissions(PERMISSIONS.PAYROLL_MANAGE)
  triggers() {
    return { success: true, data: this.rules.triggers() };
  }

  @Get('kpi/rules')
  @Permissions(PERMISSIONS.PAYROLL_MANAGE)
  async ruleList(@Validated(ruleListSchema) v: RuleListRequest) {
    // ⚠ `enabled` SATR bo'lib keladi ("true"/"false") va servis BOOLEAN
    // kutadi. `undefined` esa "filtr yo'q" — uni `false` ga aylantirish
    // o'chirilgan qoidalarni ko'rsatib qo'yardi.
    const data = await this.rules.list({
      enabled: v.query.enabled === undefined ? undefined : v.query.enabled === 'true',
      trigger: v.query.trigger,
    });
    return { success: true, data };
  }

  @Post('kpi/rules')
  @HttpCode(201)
  @Permissions(PERMISSIONS.PAYROLL_MANAGE)
  async ruleCreate(
    @Validated(ruleCreateSchema) v: RuleCreateRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.rules.create(v.body as never, req.user!);
    return { success: true, data, message: "KPI qoidasi qo'shildi" };
  }

  @Patch('kpi/rules/:id')
  @Permissions(PERMISSIONS.PAYROLL_MANAGE)
  async ruleUpdate(
    @Validated(ruleUpdateSchema) v: RuleUpdateRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.rules.update(v.params.id, v.body as never, req.user!);
    return { success: true, data, message: 'KPI qoidasi yangilandi' };
  }

  @Delete('kpi/rules/:id')
  @Permissions(PERMISSIONS.PAYROLL_MANAGE)
  async ruleRemove(
    @Validated(idParamSchema) v: IdParamRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.rules.remove(v.params.id, req.user!);
    return { success: true, data, message: "KPI qoidasi o'chirildi" };
  }

  // ═══════════════════════ BIRIKTIRUVLAR ═══════════════════════

  @Get('kpi/assignments/:employeeId')
  @Permissions(PERMISSIONS.PAYROLL_MANAGE)
  async assignmentList(@Validated(employeeParamSchema) v: EmployeeParamRequest) {
    const data = await this.rules.listAssignments(v.params.employeeId);
    return { success: true, data };
  }

  /** ⚠ 200 — Express `res.json()`. NestJS `POST` standart 201 berardi. */
  @Post('kpi/assignments')
  @HttpCode(200)
  @Permissions(PERMISSIONS.PAYROLL_MANAGE)
  async assignmentSet(
    @Validated(assignmentSetSchema) v: AssignmentSetRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.rules.setAssignment(v.body as never, req.user!);
    return { success: true, data, message: 'Biriktiruv saqlandi' };
  }

  @Delete('kpi/assignments/:id')
  @Permissions(PERMISSIONS.PAYROLL_MANAGE)
  async assignmentRemove(
    @Validated(idParamSchema) v: IdParamRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.rules.removeAssignment(v.params.id, req.user!);
    return { success: true, data, message: "Biriktiruv o'chirildi" };
  }

  // ═══════════════════════ SHARTNOMALAR ═══════════════════════

  @Get('compensations/by-employee/:employeeId')
  @Permissions(PERMISSIONS.PAYROLL_READ)
  async compensationsByEmployee(
    @Validated(employeeParamSchema) v: EmployeeParamRequest,
  ) {
    const data = await this.compensation.listByEmployee(v.params.employeeId);
    return { success: true, data };
  }

  /**
   * ⚠ `/compensations/missing` `/compensations/by-employee/:employeeId`
   * DAN KEYIN, lekin `/compensations/:id` (PATCH/DELETE) bilan
   * to'qnashmaydi — u GET emas.
   */
  @Get('compensations/missing')
  @Permissions(PERMISSIONS.PAYROLL_MANAGE)
  async compensationsMissing() {
    const data = await this.compensation.employeesWithoutCompensation();
    return { success: true, data };
  }

  @Post('compensations')
  @HttpCode(201)
  @Permissions(PERMISSIONS.PAYROLL_MANAGE)
  async compensationSet(
    @Validated(compensationSetSchema) v: CompensationSetRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.compensation.setCompensation(v.body as never, req.user!);
    return { success: true, data, message: 'Maosh shartnomasi saqlandi' };
  }

  @Patch('compensations/:id')
  @Permissions(PERMISSIONS.PAYROLL_MANAGE)
  async compensationPatch(
    @Validated(compensationPatchSchema) v: CompensationPatchRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.compensation.amendCompensation(
      v.params.id, v.body as never, req.user!);
    return { success: true, data, message: 'Shartnoma tuzatildi' };
  }

  @Delete('compensations/:id')
  @Permissions(PERMISSIONS.PAYROLL_MANAGE)
  async compensationRemove(
    @Validated(idParamSchema) v: IdParamRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.compensation.removeCompensation(v.params.id, req.user!);
    return { success: true, data, message: "Shartnoma o'chirildi" };
  }

  // ═══════════════════════ BONUS / JARIMA ═══════════════════════

  @Post('adjustments')
  @HttpCode(201)
  @Permissions(PERMISSIONS.PAYROLL_MANAGE)
  async adjustmentCreate(
    @Validated(adjustmentCreateSchema) v: AdjustmentCreateRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.adjustment.create(v.body as never, req.user!);
    return {
      success: true,
      data,
      message: v.body.kind === 'penalty' ? "Jarima qo'shildi" : "Bonus qo'shildi",
    };
  }

  @Delete('adjustments/:id')
  @Permissions(PERMISSIONS.PAYROLL_MANAGE)
  async adjustmentRemove(
    @Validated(idParamSchema) v: IdParamRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.adjustment.remove(v.params.id, req.user!);
    return { success: true, data, message: "Yozuv o'chirildi" };
  }

  // ═══════════════════════ TO'LOVLAR ═══════════════════════

  /**
   * ⚠ `permissions` `req` DA, `req.user` DA EMAS — limitdan ozod
   * qilish (`finance.approve`) shu ro'yxatga qarab hal qilinadi.
   *
   * ⚠ 201 yoki 202: chegaradan oshsa tasdiqqa tushadi va PUL
   * YOZILMAYDI.
   */
  @Post('transactions')
  @HttpCode(201)
  @Permissions(PERMISSIONS.PAYROLL_PAY)
  async transactionCreate(
    @Validated(transactionCreateSchema) v: TransactionCreateRequest,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = (await this.transactions.create(v.body as never, {
      _id: req.user!._id,
      permissions: req.permissions,
    })) as { pendingApproval?: boolean; approval?: unknown };

    if (result?.pendingApproval) {
      res.status(202);
      return {
        success: true,
        pendingApproval: true,
        data: result.approval,
        message: "Tasdiqlash uchun yuborildi. Owner tasdiqlagach to'lov yoziladi.",
      };
    }
    return { success: true, data: result, message: "To'lov yozildi" };
  }

  @Delete('transactions/:id')
  @Permissions(PERMISSIONS.PAYROLL_PAY)
  async transactionRemove(
    @Validated(idParamSchema) v: IdParamRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.transactions.remove(v.params.id, req.user!);
    return { success: true, data, message: "To'lov bekor qilindi" };
  }

  // ═══════════════════════ HR / MAOSH TARIXI ═══════════════════════
  //
  // ⚠ Bu bo'limdagi hamma amal QO'LDA chaqiriladi. Ishga olingan sanani
  // o'zgartirish (`PATCH /users/:id`) bularning HECH BIRINI ishga
  // tushirmaydi — HR va moliya ATAYLAB ajratilgan.

  @Get('history/impact/:employeeId')
  @Permissions(PERMISSIONS.PAYROLL_READ)
  async historyImpact(@Validated(employeeParamSchema) v: EmployeeParamRequest) {
    const data = await this.history.getImpact(v.params.employeeId);
    return { success: true, data };
  }

  @Patch('history/payroll-start/:employeeId')
  @Permissions(PERMISSIONS.PAYROLL_MANAGE)
  async historyPayrollStart(
    @Validated(payrollStartSchema) v: PayrollStartRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.history.setPayrollStart(
      v.params.employeeId,
      v.body.payrollStartFrom,
      {
        currentUser: req.user!,
        reason: v.body.reason,
        confirm: v.body.confirm,
      },
    );
    return {
      success: true,
      data,
      message: "Maosh hisobining boshlanish sanasi saqlandi",
    };
  }

  @Post('history/generate-range')
  @HttpCode(200)
  @Permissions(PERMISSIONS.PAYROLL_MANAGE)
  async historyGenerateRange(
    @Validated(generateRangeSchema) v: GenerateRangeRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.history.generateRange(v.body as never, req.user!);
    return {
      success: true,
      data,
      message: `${data.created} ta oy yaratildi, ${data.skipped} tasi allaqachon mavjud`,
    };
  }

  @Post('history/recalculate')
  @HttpCode(200)
  @Permissions(PERMISSIONS.PAYROLL_MANAGE)
  async historyRecalculate(
    @Validated(recalcUnlockedSchema) v: RecalcUnlockedRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.history.recalcUnlocked(v.body as never, req.user!);
    return {
      success: true,
      data,
      message:
        `${data.recalculated} ta oy qayta hisoblandi, ` +
        `${data.lockedSkipped} tasi qulflangani uchun tegilmadi`,
    };
  }

  /** QURUQ YUGURISH — hech narsa yozilmaydi, faqat "nima bo'ladi". */
  @Post('history/preview')
  @HttpCode(200)
  @Permissions(PERMISSIONS.PAYROLL_MANAGE)
  async historyPreview(@Validated(previewSchema) v: PreviewRequest) {
    const data = await this.history.previewGenerate(v.body as never);
    return { success: true, data };
  }

  /** XODIM TAYMLAYNI — moliyaviy audit tarixi. */
  @Get('history/timeline/:employeeId')
  @Permissions(PERMISSIONS.PAYROLL_READ)
  async historyTimeline(
    @Validated(employeeParamSchema) v: EmployeeParamRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    // ⚠ `req.query` XOM uzatiladi — Express'da ham shunday
    // (`auditService.timeline(id, req.query)`). Validator YO'Q, servis
    // `limit` ni 300 bilan cheklaydi.
    const data = await this.audit.timeline(
      v.params.employeeId, req.query as Record<string, unknown>);
    return { success: true, data };
  }

  @Post('history/lock')
  @HttpCode(200)
  @Permissions(PERMISSIONS.PAYROLL_MANAGE)
  async historyLock(
    @Validated(lockSchema) v: LockRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.history.setLock(v.body as never, req.user!);
    return {
      success: true,
      data,
      message: v.body.locked ? 'Oy qulflandi' : "Qulf ochildi",
    };
  }

  // ═══════════════════════ MAOSH QATORLARI ═══════════════════════

  @Post('generate')
  @HttpCode(200)
  @Permissions(PERMISSIONS.PAYROLL_MANAGE)
  async generate(@Validated(generateSchema) v: GenerateRequest) {
    const data = await this.payroll.generateMonth(v.body.year, v.body.month);
    return { success: true, data, message: 'Maoshlar hisoblandi' };
  }

  @Get('by-employee/:employeeId')
  @Permissions(PERMISSIONS.PAYROLL_READ)
  async byEmployee(@Validated(employeeParamSchema) v: EmployeeParamRequest) {
    const data = await this.payroll.historyByEmployee(v.params.employeeId);
    return { success: true, data };
  }

  @Get()
  @Permissions(PERMISSIONS.PAYROLL_READ)
  async list(
    @Validated(listSchema) v: ListRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const { page, limit } = parsePagination(req.query as Record<string, unknown>);
    const { items, total } = await this.payroll.list({
      ...v.query,
      page,
      limit,
    });
    return { success: true, data: items, meta: buildMeta({ page, limit, total }) };
  }

  /**
   * ⚠ `force` YO'Q: qulflangan oy bu yerdan ham o'zgarmaydi. Uni
   * o'zgartirish uchun avval ATAYLAB qulf ochiladi (lifecycle).
   *
   * ⚠ 400 javobi `ApiError` EMAS, ochiq `res.status(400).json(...)` —
   * shuning uchun tanada `message` bor, lekin `code` YO'Q. Express
   * bilan aynan bir xil shakl.
   */
  @Post(':id/recompute')
  @HttpCode(200)
  @Permissions(PERMISSIONS.PAYROLL_MANAGE)
  async recompute(
    @Validated(recomputeSchema) v: RecomputeRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const current = (await this.payroll.getById(v.params.id)) as unknown as {
      lifecycle?: string; employee?: { _id?: string }; year: number; month: number;
    };
    if (current.lifecycle === 'finalized') {
      res.status(400);
      return { success: false, message: "Oy yopilgan. Avval qulfni oching." };
    }
    const data = await this.payroll.computePayroll(
      current.employee!._id as string,
      current.year,
      current.month,
    );
    return { success: true, data, message: 'Qayta hisoblandi' };
  }

  @Patch(':id/lifecycle')
  @Permissions(PERMISSIONS.PAYROLL_MANAGE)
  async lifecycle(
    @Validated(lifecycleSchema) v: LifecycleRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.payroll.setLifecycle(
      v.params.id,
      v.body.lifecycle,
      req.user!,
      { reason: v.body.reason },
    );
    return {
      success: true,
      data,
      message: v.body.lifecycle === 'finalized' ? 'Oy yopildi' : 'Oy qayta ochildi',
    };
  }

  @Get(':id')
  @Permissions(PERMISSIONS.PAYROLL_READ)
  async getById(@Validated(idParamSchema) v: IdParamRequest) {
    const [payroll, transactions] = await Promise.all([
      this.payroll.getById(v.params.id),
      this.transactions.listByPayroll(v.params.id),
    ]);
    return { success: true, data: { ...payroll, transactions } };
  }
}
