import { Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { RoomUtilizationService } from './room-utilization.service.js';
import { BranchPnlService } from './branch-pnl.service.js';
import { BranchMetricsService } from './branch-metrics.service.js';
import { BranchSalesService } from './branch-sales.service.js';
import { BranchTeachersService } from './branch-teachers.service.js';
import { BranchAlertsService } from './branch-alerts.service.js';
import { StudentTransferService } from './student-transfer.service.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { AllPermissionsGuard } from '../../common/guards/all-permissions.guard.js';
import { AllPermissions, Permissions, Validated } from '../../common/decorators/index.js';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.js';
import {
  roomUtilizationSchema, pnlSchema, rangeSchema,
  transferPreviewSchema, transferSchema,
  type RoomUtilizationRequest, type PnlRequest, type RangeRequest,
  type TransferPreviewRequest, type TransferRequest,
} from './branch-analytics.validators.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FILIAL TAHLILI — 11/11 marshrut.
 *
 * ── ⚠ RUXSATLAR MOS KELUVCHI MODULDAN OLINADI, yangi kalit YO'Q ──
 *   `/rooms`      → `classes.read`   (javobda pul yo'q, faqat jadval)
 *   `/pnl`        → `finance.read`
 *   `/normalized` → `finance.read`
 *   `/elimination`→ `system.admin_access` (butun tarmoq, owner-only)
 *   `/utilization`→ `branches.read`
 *   `/churn`      → `branches.read`
 *   `/alerts`     → `branches.read`
 *   `/sales`      → `leads.read`     (ma'lumot manbai — lidlar)
 *   `/teachers`   → `salary.read`    (javobda MAOSH summasi bor)
 *   `/students/:id/transfer*` → `students.update` (+ `finance.manage`)
 *
 * `/teachers` ni `branches.read` ga bog'lash XATO bo'lardi: filial
 * ro'yxatini ko'ra oladigan har qanday xodim MAOSH FONDINI ham ko'rib
 * qolardi. Ruxsat MA'LUMOTGA beriladi, EKRANGA emas.
 *
 * ⚠ `/elimination` ATAYLAB butun tarmoq bo'yicha va owner-only: ichki
 * aylanma faqat KONSOLIDATSIYADA ma'noga ega.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Controller('branch-analytics')
@UseGuards(PermissionsGuard)
export class BranchAnalyticsRoomsController {
  constructor(
    private readonly roomUtilization: RoomUtilizationService,
    private readonly pnlService: BranchPnlService,
    private readonly metrics: BranchMetricsService,
    private readonly salesService: BranchSalesService,
    private readonly teachersService: BranchTeachersService,
    private readonly alertsService: BranchAlertsService,
    private readonly transfers: StudentTransferService,
  ) {}

  @Get('pnl')
  @Permissions(PERMISSIONS.FINANCE_READ)
  async pnl(@Validated(pnlSchema) v: PnlRequest) {
    const data = await this.pnlService.pnl({
      from: v.query.from || null,
      to: v.query.to || null,
      consolidated: Boolean(v.query.consolidated),
    });
    return { success: true, data };
  }

  /** "Ichki o'tkazmalar hisobotni qancha shishirgan" — owner uchun. */
  @Get('elimination')
  @Permissions(PERMISSIONS.SYSTEM_ADMIN_ACCESS)
  async elimination(@Validated(rangeSchema) v: RangeRequest) {
    const data = await this.pnlService.eliminationImpact({
      from: v.query.from || null,
      to: v.query.to || null,
    });
    return { success: true, data };
  }

  /**
   * ⚠ VALIDATOR YO'Q — Express'da ham yo'q (`router.get(...)` da
   * `validate()` chaqirilmagan). Qo'shilsa yaroqsiz parametr uchun
   * status jimgina o'zgarardi.
   */
  @Get('utilization')
  @Permissions(PERMISSIONS.BRANCHES_READ)
  async utilization() {
    return { success: true, data: await this.metrics.utilization() };
  }

  @Get('churn')
  @Permissions(PERMISSIONS.BRANCHES_READ)
  async churn(@Validated(rangeSchema) v: RangeRequest) {
    const data = await this.metrics.churn({
      from: v.query.from || null,
      to: v.query.to || null,
    });
    return { success: true, data };
  }

  /** Filiallarni HAJMIDAN QAT'I NAZAR solishtirish (ARPU, CAC, bandlik). */
  @Get('normalized')
  @Permissions(PERMISSIONS.FINANCE_READ)
  async normalized(@Validated(rangeSchema) v: RangeRequest) {
    const data = await this.metrics.normalized({
      from: v.query.from || null,
      to: v.query.to || null,
    });
    return { success: true, data };
  }

  @Get('sales')
  @Permissions(PERMISSIONS.LEADS_READ)
  async sales(@Validated(rangeSchema) v: RangeRequest) {
    const data = await this.salesService.sales({
      from: v.query.from || null,
      to: v.query.to || null,
    });
    return { success: true, data };
  }

  @Get('teachers')
  @Permissions(PERMISSIONS.SALARY_READ)
  async teachers(@Validated(rangeSchema) v: RangeRequest) {
    const data = await this.teachersService.teachers({
      from: v.query.from || null,
      to: v.query.to || null,
    });
    return { success: true, data };
  }

  /**
   * ANOMALIYALAR: bo'sh xonalar, oshgan churn, yo'lda qotib qolgan
   * inkassatsiya, mos kelmagan kassa balansi.
   *
   * ⚠ VALIDATOR YO'Q — Express'da ham yo'q.
   */
  @Get('alerts')
  @Permissions(PERMISSIONS.BRANCHES_READ)
  async alerts() {
    return { success: true, data: await this.alertsService.evaluate() };
  }

  /** ⚠ Ko'chirish QAYTARIB BO'LMAYDI — operator natijani OLDIN ko'rsin. */
  @Get('students/:studentId/transfer-preview')
  @Permissions(PERMISSIONS.STUDENTS_UPDATE)
  async transferPreview(
    @Validated(transferPreviewSchema) v: TransferPreviewRequest,
  ) {
    const data = await this.transfers.preview(
      v.params.studentId, v.query.toBranchId,
    );
    return { success: true, data };
  }

  /**
   * ⚠⚠ IKKI RUXSAT BIRGA — VA BU "AND", "OR" EMAS.
   *
   * `students.update` YETARLI EMAS: ko'chirish IKKI filialga tegadi va
   * PUL harakatlanadi. Express'da bu KETMA-KET ikkita
   * `requirePermission(...)` middleware'i, ya'ni HAR IKKALASI shart.
   *
   * ⚠ `@Permissions(a, b)` BU YERDA XATO BO'LARDI: `PermissionsGuard`
   * OR semantikasida ishlaydi va faqat `students.update` bor xodim
   * o'quvchini pul bilan birga ko'chira olardi. Shuning uchun
   * `@AllPermissions` + `AllPermissionsGuard` (AND).
   *
   * ⚠ 200 — Express `res.json()` yozadi, NestJS POST standarti 201.
   */
  @Post('students/:studentId/transfer')
  @HttpCode(200)
  @UseGuards(AllPermissionsGuard)
  @AllPermissions(PERMISSIONS.STUDENTS_UPDATE, PERMISSIONS.FINANCE_MANAGE)
  async transfer(
    @Validated(transferSchema) v: TransferRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data: any = await this.transfers.transfer(
      v.params.studentId, v.body,
      {
        _id: req.user!._id,
        allowedBranchIds: req.allowedBranchIds,
        canSeeAllBranches: req.canSeeAllBranches,
      },
    );
    return {
      success: true,
      data,
      message: `O'quvchi ${data.toBranchName} filialiga ko'chirildi`,
    };
  }

  @Get('rooms')
  @Permissions(PERMISSIONS.CLASSES_READ)
  async rooms(
    @Validated(roomUtilizationSchema) v: RoomUtilizationRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    // ⚠ `undefined` va `Number(...)` FARQI SAQLANADI: Express handler'i
    // aynan shunday yozadi — berilmagan parametr standart qiymatga
    // tushadi, berilgani esa songa aylantiriladi.
    const q = req.query as Record<string, unknown>;
    const data = await this.roomUtilization.getRoomUtilization({
      branchId: v.query.branchId,
      dayStart: q.dayStart === undefined ? undefined : Number(q.dayStart),
      dayEnd: q.dayEnd === undefined ? undefined : Number(q.dayEnd),
    });
    return { success: true, data };
  }
}
