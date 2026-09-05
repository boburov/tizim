import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { DepositsService } from './deposits.service.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { Permissions, Validated } from '../../common/decorators/index.js';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import { BranchAccessService } from '../../common/rbac/branch-access.service.js';
import { buildMeta } from '../../common/utils/pagination.js';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.js';
import {
  topupSchema,
  withdrawSchema,
  applySchema,
  studentIdParamSchema,
  idParamSchema,
  listSchema,
  reportSchema,
  type TopupRequest,
  type WithdrawRequest,
  type ApplyRequest,
  type StudentIdParamRequest,
  type IdParamRequest,
  type ListRequest,
  type ReportRequest,
} from './deposits.validators.js';

/**
 * Express `deposits.routes.js` — 8/8 marshrut.
 *
 * ⚠ E'LON TARTIBI Express bilan bir xil. `/report` va `/transactions`
 * aniq yo'llar, `/students/:studentId` esa parametrli — ular BOSHQA
 * segmentlarda, ya'ni to'qnashuv yo'q, lekin tartib saqlanadi.
 *
 * ── RUXSAT CHEGARASI ──
 *   O'QISH (`/report`, `/transactions`, `/students/*`) → `finance.read`
 *   PUL AMALLARI (`/topup`, `/withdraw`, `/apply`, `DELETE`) → `finance.pay`
 *
 * Ikkisi ATAYLAB ajratilgan: hisobotchi pulni ko'radi, lekin
 * KO'CHIRA OLMAYDI.
 */
@Controller('deposits')
@UseGuards(PermissionsGuard)
export class DepositsController {
  constructor(
    private readonly deposits: DepositsService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  // ───────────────────────────── O'QISH ─────────────────────────────

  @Get('report')
  @Permissions(PERMISSIONS.FINANCE_READ)
  async report(@Validated(reportSchema) v: ReportRequest) {
    const data = await this.deposits.report(v.query);
    return { success: true, data };
  }

  @Get('transactions')
  @Permissions(PERMISSIONS.FINANCE_READ)
  async list(@Validated(listSchema) v: ListRequest) {
    const { items, total, page, limit } = await this.deposits.list(v.query);
    return { success: true, data: items, meta: buildMeta({ page, limit, total }) };
  }

  @Get('students/:studentId')
  @Permissions(PERMISSIONS.FINANCE_READ)
  async balance(@Validated(studentIdParamSchema) v: StudentIdParamRequest) {
    const data = await this.deposits.summaryFor(v.params.studentId);
    return { success: true, data };
  }

  @Get('students/:studentId/history')
  @Permissions(PERMISSIONS.FINANCE_READ)
  async history(@Validated(studentIdParamSchema) v: StudentIdParamRequest) {
    const data = await this.deposits.historyFor(v.params.studentId);
    return { success: true, data };
  }

  // ──────────────────────────── PUL AMALLARI ────────────────────────

  /** ⚠ 201 — Express `res.status(201)` yozadi (yangi tranzaksiya yaratildi). */
  @Post('topup')
  @HttpCode(201)
  @Permissions(PERMISSIONS.FINANCE_PAY)
  async topup(
    @Validated(topupSchema) v: TopupRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const { studentId, ...body } = v.body;
    // ⚠ FILIAL QO'RIQCHISI MARSHRUTDA, SERVISDA EMAS: `deposits.topup` ni
    // ichkaridan `finance/transaction` (ortiqcha to'lovni garovga) va
    // `opening-balance` ham chaqiradi — u yerda `studentId` mijozdan
    // emas, allaqachon ko'lamlangan plandan keladi. Marshrutda esa u
    // MIJOZ bergan ID: qo'riqchisiz A filial direktori B filial
    // o'quvchisining depozitiga pul yozib qo'yardi.
    await this.branchAccess.assertUserInBranchScope(studentId);
    const data = await this.deposits.topup(studentId, body, req.user);
    return { success: true, data, message: "To'lov qo'shildi" };
  }

  /**
   * ⚠ IKKI XIL MUVAFFAQIYAT STATUSI:
   *   200 — pul chiqdi;
   *   202 — summa CHIQIM LIMITIDAN oshdi, pul CHIQMADI, tasdiq kutilmoqda.
   *
   * 202 ni `@HttpCode` bilan ifodalab bo'lmaydi (bitta metod, ikki holat),
   * shuning uchun status shu shoxda ochiq yoziladi.
   *
   * ⚠ `permissions` `req` DA (auth middleware o'rnatadi), `req.user` da
   * EMAS — chiqim limiti aynan shunga qaraydi.
   */
  @Post('withdraw')
  @HttpCode(200)
  @Permissions(PERMISSIONS.FINANCE_PAY)
  async withdraw(
    @Validated(withdrawSchema) v: WithdrawRequest,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { studentId, ...body } = v.body;
    const data: any = await this.deposits.withdraw(studentId, body, {
      _id: req.user!._id,
      permissions: req.permissions,
    });

    if (data?.pendingApproval) {
      res.status(202);
      return {
        success: true,
        data: data.approval,
        pendingApproval: true,
        message: "Summa limitdan oshdi - tasdiqlash uchun yuborildi",
      };
    }

    return { success: true, data, message: "To'lovdan yechib olindi" };
  }

  @Post('apply')
  @HttpCode(200)
  @Permissions(PERMISSIONS.FINANCE_PAY)
  async apply(
    @Validated(applySchema) v: ApplyRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    // ⚠ FILIAL QO'RIQCHISI — `studentId` MIJOZDAN keladi. `autoApply` ni
    // oylik job va `opening-balance` ham chaqiradi (kontekstsiz, ya'ni
    // qo'riqchi o'z-o'zidan o'tkazib yuboradi), shuning uchun tekshiruv
    // aynan shu marshrutda: begona filial o'quvchisining depoziti uning
    // to'lovlariga qoplanib ketmasin.
    await this.branchAccess.assertUserInBranchScope(v.body.studentId);
    const data = await this.deposits.autoApply(v.body.studentId, req.user);
    return { success: true, data, message: "To'lovdan qoplandi" };
  }

  @Delete('transactions/:id')
  @Permissions(PERMISSIONS.FINANCE_PAY)
  async remove(
    @Validated(idParamSchema) v: IdParamRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.deposits.removeDepositTxn(v.params.id, req.user);
    return { success: true, data, message: "Tranzaksiya o'chirildi" };
  }
}
