import {
  Controller, Delete, Get, HttpCode, Patch, Post, Req, Res, UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { TeacherSalaryService } from './teacher-salary.service.js';
import { SalaryTransactionService } from './salary-transaction.service.js';
import { SalaryAdjustmentService } from './salary-adjustment.service.js';
import { TeacherCompensationService } from './teacher-compensation.service.js';
import { ExpenseApprovalsService } from '../expense-approvals/index.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { Permissions, Validated } from '../../common/decorators/index.js';
import { PERMISSIONS, ROLES } from '../../common/constants/permissions.js';
import { APPROVAL_KINDS } from '../../common/constants/approvals.js';
import { compensationMetrics } from '../../common/helpers/config-metrics.js';
import { ApiError } from '../../common/errors/api-error.js';
import { buildMeta } from '../../common/utils/pagination.js';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.js';
import {
  salaryListSchema, salaryIdSchema, salaryTeacherIdSchema, obligationsSchema,
  transactionCreateSchema, transactionIdSchema,
  compensationSetSchema, compensationAmendSchema, compensationIdSchema,
  compensationTeacherIdSchema, adjustmentCreateSchema, adjustmentSettleSchema,
  type SalaryListRequest, type SalaryIdRequest, type SalaryTeacherIdRequest,
  type ObligationsRequest, type TransactionCreateRequest, type TransactionIdRequest,
  type CompensationSetRequest, type CompensationAmendRequest,
  type CompensationIdRequest, type CompensationTeacherIdRequest,
  type AdjustmentCreateRequest, type AdjustmentSettleRequest,
} from './teacher-salary.validators.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O'QITUVCHI MAOSHI — Express `teacherSalary.routes.js` EKVIVALENTI (15/15).
 *
 * ⚠⚠ E'LON TARTIBI O'ZGARTIRILMASIN ⚠⚠
 * `GET /me/finance` `GET /salaries/:id` DAN OLDIN turadi. Teskarisida
 * "me" param sifatida ushlanib qolardi.
 * `by-teacher/:teacherId` va `by-teacher/:teacherId/balance` ham
 * `/salaries/:id` dan OLDIN — aks holda "by-teacher" maosh ID'si deb
 * o'qilardi.
 *
 * ── RUXSATLAR ATAYLAB HAR XIL ──
 *   o'qish              → `salary.read`
 *   STAVKA belgilash    → `finance.manage`  ⚠ `salary.pay` EMAS
 *   mukofot/jarima      → `finance.manage`
 *   TO'LOV (chiqim)     → `salary.pay`
 *
 * ⚠ "Maosh TO'LASH" va "maosh STAVKASINI belgilash" BOSHQA-BOSHQA
 * vakolat: kassir to'laydi, stavkani RAHBARIYAT belgilaydi. Ikkalasiga
 * bitta ruxsat berilsa kassir o'zi stavka qo'yib, o'zi to'lay olardi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Controller('teacher-salary')
@UseGuards(PermissionsGuard)
export class TeacherSalaryController {
  constructor(
    private readonly salaries: TeacherSalaryService,
    private readonly transactions: SalaryTransactionService,
    private readonly adjustments: SalaryAdjustmentService,
    private readonly compensations: TeacherCompensationService,
    private readonly approvals: ExpenseApprovalsService,
  ) {}

  /**
   * O'qituvchining O'Z moliyasi (teacher panel).
   *
   * ⚠ RUXSAT YO'Q, faqat ROL: o'qituvchida `salary.read` bo'lmaydi,
   * lekin u O'Z maoshini ko'rishi SHART. ID DOIMO `req.user._id` —
   * boshqa o'qituvchi ID'sini olib bo'lmaydi.
   */
  @Get('me/finance')
  async myFinance(@Req() req: AuthenticatedRequest) {
    if (req.user!.role !== ROLES.TEACHER) {
      throw new ApiError(403, "Faqat o'qituvchilar uchun");
    }
    const data = await this.salaries.myFinance(req.user!._id);
    return { success: true, data };
  }

  // ═══════════════════════ MAOSHLAR (o'qish) ═══════════════════════

  @Get('salaries')
  @Permissions(PERMISSIONS.SALARY_READ)
  async salaryList(@Validated(salaryListSchema) v: SalaryListRequest) {
    const { items, total, page, limit } = await this.salaries.list(v.query);
    return { success: true, data: items, meta: buildMeta({ page, limit, total }) };
  }

  @Get('salaries/by-teacher/:teacherId')
  @Permissions(PERMISSIONS.SALARY_READ)
  async salaryHistoryByTeacher(
    @Validated(salaryTeacherIdSchema) v: SalaryTeacherIdRequest,
  ) {
    const data = await this.salaries.historyByTeacher(v.params.teacherId);
    return { success: true, data };
  }

  /** Joriy holat (fiksa stavka, jami daromad, oy boshigacha qoldiq). */
  @Get('salaries/by-teacher/:teacherId/balance')
  @Permissions(PERMISSIONS.SALARY_READ)
  async salaryBalanceByTeacher(
    @Validated(salaryTeacherIdSchema) v: SalaryTeacherIdRequest,
  ) {
    const data = await this.salaries.balanceByTeacher(v.params.teacherId);
    return { success: true, data };
  }

  @Get('salaries/:id')
  @Permissions(PERMISSIONS.SALARY_READ)
  async salaryGetById(@Validated(salaryIdSchema) v: SalaryIdRequest) {
    return { success: true, data: await this.salaries.getById(v.params.id) };
  }

  @Get('obligations')
  @Permissions(PERMISSIONS.SALARY_READ)
  async obligations(@Validated(obligationsSchema) v: ObligationsRequest) {
    return { success: true, data: await this.salaries.obligations(v.query) };
  }

  // ═══════════════════════ STAVKA (markaz darajasi) ═══════════════════════

  @Get('compensations/by-teacher/:teacherId')
  @Permissions(PERMISSIONS.SALARY_READ)
  async compensationList(
    @Validated(compensationTeacherIdSchema) v: CompensationTeacherIdRequest,
  ) {
    const { teacherId } = v.params;
    const [items, active] = await Promise.all([
      this.compensations.listByTeacher(teacherId),
      this.compensations.getActive(teacherId),
    ]);
    return { success: true, data: { items, active } };
  }

  /**
   * MAOSH STAVKASINI BELGILASH.
   *
   * ⚠ TASDIQ GATE'i KONTROLLER QATLAMIDA (servisda EMAS):
   * `setCompensation()` ishga olish oqimidan (`createStaff`) ham
   * chaqiriladi — u yerda ishga olish so'rovining O'ZI allaqachon
   * tasdiqdan o'tgan bo'ladi va ikkinchi tasdiq so'rash foydalanuvchini
   * IKKI MARTA kutishga majburlardi.
   *
   * ⚠ 202 (201 EMAS) — tasdiqqa ketganda: "qabul qilindi, lekin hali
   * BAJARILMADI".
   */
  @Post('compensations')
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  async compensationSet(
    @Validated(compensationSetSchema) v: CompensationSetRequest,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { needsApproval } = await this.approvals.checkConfigApproval({
      permissions: req.permissions,
      kind: APPROVAL_KINDS.TEACHER_COMPENSATION_SET,
      metrics: compensationMetrics(v.body),
    });

    if (needsApproval) {
      const approval = await this.compensations.requestSet(v.body, req.user);
      res.status(202);
      return {
        success: true,
        data: approval,
        message: "Tasdiqlash uchun yuborildi. Owner tasdiqlagach qo'llanadi.",
      };
    }

    res.status(201);
    const data = await this.compensations.setCompensation(v.body, req.user);
    return { success: true, data, message: 'Maosh stavkasi belgilandi' };
  }

  /** AMALDAGI stavkani TUZATISH — yangi davr ochmaydi. */
  @Patch('compensations/:id')
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  async compensationAmend(
    @Validated(compensationAmendSchema) v: CompensationAmendRequest,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { needsApproval } = await this.approvals.checkConfigApproval({
      permissions: req.permissions,
      kind: APPROVAL_KINDS.TEACHER_COMPENSATION_SET,
      metrics: compensationMetrics(v.body),
    });

    if (needsApproval) {
      const approval = await this.compensations.requestSet(
        { ...v.body, op: 'amend', compensationId: v.params.id },
        req.user,
      );
      res.status(202);
      return {
        success: true,
        data: approval,
        message: "Tasdiqlash uchun yuborildi. Owner tasdiqlagach qo'llanadi.",
      };
    }

    const data = await this.compensations.amendCompensation(
      v.params.id, v.body, req.user,
    );
    return { success: true, data, message: 'Maosh stavkasi tuzatildi' };
  }

  @Delete('compensations/:id')
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  async compensationRemove(
    @Validated(compensationIdSchema) v: CompensationIdRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.compensations.removeCompensation(v.params.id, req.user);
    return { success: true, message: "Maosh stavkasi o'chirildi" };
  }

  // ═══════════════════════ MUKOFOT / JARIMA ═══════════════════════

  @Post('adjustments')
  @HttpCode(201)
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  async adjustmentCreate(
    @Validated(adjustmentCreateSchema) v: AdjustmentCreateRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.adjustments.create(v.body, req.user);
    return {
      success: true,
      data,
      message: v.body.kind === 'deduction' ? "Jarima qo'shildi" : "Mukofot qo'shildi",
    };
  }

  /**
   * HISOB-KITOBNI YOPISH (ishdan bo'shatish).
   *
   * ⚠ `FINANCE_MANAGE` — bu STAVKA emas, CHIQIMNI BEKOR QILISH qarori
   * (jarima bilan bir xil vakolat).
   */
  @Post('adjustments/settle/:teacherId')
  @HttpCode(201)
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  async adjustmentSettle(
    @Validated(adjustmentSettleSchema) v: AdjustmentSettleRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.adjustments.settleBalance(
      v.params.teacherId, v.body, req.user,
    );
    return {
      success: true,
      data,
      message: `Hisob yopildi: ${data.settled.toLocaleString('ru-RU')} so'm hisobdan chiqarildi`,
    };
  }

  @Delete('adjustments/:id')
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  async adjustmentRemove(
    @Validated(compensationIdSchema) v: CompensationIdRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.adjustments.remove(v.params.id, req.user);
    return { success: true, message: "O'chirildi" };
  }

  // ═══════════════════════ MAOSH TO'LOVLARI ═══════════════════════

  @Post('transactions')
  @Permissions(PERMISSIONS.SALARY_PAY)
  async transactionCreate(
    @Validated(transactionCreateSchema) v: TransactionCreateRequest,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    // ⚠ `permissions` `req` da (auth middleware o'rnatadi), `req.user` da
    // EMAS — chiqim limiti tekshiruvi uchun ochiq uzatiladi.
    const data = await this.transactions.create(v.body, {
      _id: req.user!._id,
      permissions: req.permissions,
    });

    // ⚠ LIMITDAN OSHDI: pul CHIQMADI, tasdiq kutilmoqda.
    // 202 Accepted — "qabul qilindi, lekin hali bajarilmadi".
    if ((data as any)?.pendingApproval) {
      res.status(202);
      return {
        success: true,
        data: (data as any).approval,
        pendingApproval: true,
        message: "Summa limitdan oshdi - tasdiqlash uchun yuborildi",
      };
    }

    res.status(201);
    return { success: true, data, message: "To'lov amalga oshirildi" };
  }

  @Delete('transactions/:id')
  @Permissions(PERMISSIONS.SALARY_PAY)
  async transactionRemove(
    @Validated(transactionIdSchema) v: TransactionIdRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.transactions.remove(v.params.id, req.user);
    return { success: true, data, message: "To'lov bekor qilindi" };
  }
}
