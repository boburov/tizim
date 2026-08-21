import {
  Controller, Delete, Get, HttpCode, Patch, Post, Put, Req, Res, UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { Permissions, Validated } from '../../common/decorators/index.js';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import { APPROVAL_KINDS } from '../../common/constants/approvals.js';
import { buildMeta } from '../../common/utils/pagination.js';
import { actorOf } from '../../common/helpers/actor.js';
import { discountMetrics, groupFeeMetrics } from '../../common/helpers/config-metrics.js';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.js';
import { ExpenseApprovalsService } from '../expense-approvals/expense-approvals.service.js';
import { StudentPaymentService } from './student-payment.service.js';
import { GroupFeeService } from './group-fee.service.js';
import { DiscountService } from './discount.service.js';
import { TransactionService } from './transaction.service.js';
import {
  groupFeeListSchema, groupFeeByGroupSchema, groupFeeUpsertSchema,
  paymentListSchema, paymentObligationsSchema, paymentIdParamSchema,
  paymentStudentIdParamSchema,
  transactionCreateSchema, transactionIdParamSchema,
  discountListSchema, discountCreateSchema, discountUpdateSchema,
  discountIdParamSchema,
  type GroupFeeListRequest, type GroupFeeByGroupRequest, type GroupFeeUpsertRequest,
  type PaymentListRequest, type PaymentObligationsRequest, type PaymentIdParamRequest,
  type PaymentStudentIdParamRequest,
  type TransactionCreateRequest, type TransactionIdParamRequest,
  type DiscountListRequest, type DiscountCreateRequest, type DiscountUpdateRequest,
  type DiscountIdParamRequest,
} from './finance.validators.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MOLIYA YADROSINING MARSHRUTLARI — Express `finance.routes.js` (13/13).
 *
 * ⚠⚠ E'LON TARTIBI O'ZGARTIRILMASIN ⚠⚠
 * `/student-payments/obligations` va `/student-payments/by-student/:id`
 * `/student-payments/:id` DAN OLDIN turadi. Teskarisida NestJS
 * "obligations" ni to'lov ID'si deb o'qib, 404 qaytarardi — Express
 * routes faylida ham aynan shu izoh turibdi.
 *
 * ── RUXSAT CHEGARASI (Express bilan aynan) ──
 *   O'QISH  (`group-fees`, `student-payments`, `discounts` GET) → `finance.read`
 *   TARIF/CHEGIRMA yozish (`PUT group-fees`, `discounts` yozish)  → `finance.manage`
 *   PUL harakati (`transactions`)                                → `finance.pay`
 *
 * ⚠ `finance.manage` ≠ `finance.pay`: tarif va chegirma qo'yish
 * KELAJAKDAGI tushumni o'zgartiradi, kassaga esa tegmaydi. Ikkisini
 * birlashtirsak, hisobotchi kassaga kira olardi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Controller('finance')
@UseGuards(PermissionsGuard)
export class FinanceController {
  constructor(
    private readonly fees: GroupFeeService,
    private readonly payments: StudentPaymentService,
    private readonly transactions: TransactionService,
    private readonly discounts: DiscountService,
    private readonly approvals: ExpenseApprovalsService,
  ) {}

  // ═══════════════════════ GURUH TARIFLARI ═══════════════════════

  @Get('group-fees')
  @Permissions(PERMISSIONS.FINANCE_READ)
  async groupFeeList(@Validated(groupFeeListSchema) v: GroupFeeListRequest) {
    const data = await this.fees.list(v.query);
    return { success: true, data };
  }

  @Get('group-fees/group/:groupId')
  @Permissions(PERMISSIONS.FINANCE_READ)
  async groupFeeByGroup(@Validated(groupFeeByGroupSchema) v: GroupFeeByGroupRequest) {
    const data = await this.fees.byGroup(v.params.groupId);
    return { success: true, data };
  }

  /**
   * GURUH NARXI TASDIG'I: filialning delegatsiya matritsasi hal qiladi
   * (`Branch.delegation.group_fee_set`). Chegirma bilan bir xil qoida:
   * ikkalasi ham tushumni kamaytiradi.
   *
   * ⚠ CHEGARA YO'NALISHI TESKARI: bu yerda xavf katta raqam emas,
   * KICHIK raqam (narxni tushirib yuborish). Shuning uchun chegara
   * `minAmount` — "shu summadan pastga tushirsang, mendan so'ra".
   *
   * ⚠ 202 = "qabul qilindi, lekin hali BAJARILMADI" (yozuv YO'Q).
   */
  @Put('group-fees')
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  async groupFeeUpsert(
    @Validated(groupFeeUpsertSchema) v: GroupFeeUpsertRequest,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { needsApproval } = await this.approvals.checkConfigApproval({
      permissions: req.permissions,
      kind: APPROVAL_KINDS.GROUP_FEE_SET,
      metrics: groupFeeMetrics(v.body as Record<string, unknown>),
    });

    if (needsApproval) {
      const approval = await this.fees.requestGroupFee(v.body, actorOf(req));
      res.status(202);
      return {
        success: true,
        data: approval,
        message: "Tasdiqlash uchun yuborildi. Owner tasdiqlagach qo'llanadi.",
      };
    }

    const data = await this.fees.upsert(v.body, actorOf(req));
    return { success: true, data, message: "Guruh to'lovi saqlandi" };
  }

  // ═══════════════════════ O'QUVCHI TO'LOVLARI ═══════════════════════

  @Get('student-payments')
  @Permissions(PERMISSIONS.FINANCE_READ)
  async paymentList(@Validated(paymentListSchema) v: PaymentListRequest) {
    const { items, total, page, limit } = await this.payments.list(v.query);
    return { success: true, data: items, meta: buildMeta({ page, limit, total }) };
  }

  /**
   * ⚠ `:id` DAN OLDIN — aks holda "obligations" to'lov ID'si deb
   * o'qilardi (Express routes faylidagi izohning aynan o'zi).
   */
  @Get('student-payments/obligations')
  @Permissions(PERMISSIONS.FINANCE_READ)
  async paymentObligations(
    @Validated(paymentObligationsSchema) v: PaymentObligationsRequest,
  ) {
    const data = await this.payments.obligations(v.query);
    return { success: true, data };
  }

  @Get('student-payments/by-student/:studentId')
  @Permissions(PERMISSIONS.FINANCE_READ)
  async paymentHistoryByStudent(
    @Validated(paymentStudentIdParamSchema) v: PaymentStudentIdParamRequest,
  ) {
    const data = await this.payments.historyByStudent(v.params.studentId);
    return { success: true, data };
  }

  @Get('student-payments/:id')
  @Permissions(PERMISSIONS.FINANCE_READ)
  async paymentGetById(@Validated(paymentIdParamSchema) v: PaymentIdParamRequest) {
    const data = await this.payments.getById(v.params.id);
    return { success: true, data };
  }

  // ═══════════════════════ KIRIM (TRANZAKSIYA) ═══════════════════════

  /** ⚠ 201 — Express `res.status(201)` yozadi. */
  @Post('transactions')
  @HttpCode(201)
  @Permissions(PERMISSIONS.FINANCE_PAY)
  async transactionCreate(
    @Validated(transactionCreateSchema) v: TransactionCreateRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.transactions.create(v.body, actorOf(req));
    return { success: true, data, message: "To'lov qabul qilindi" };
  }

  @Delete('transactions/:id')
  @Permissions(PERMISSIONS.FINANCE_PAY)
  async transactionRemove(
    @Validated(transactionIdParamSchema) v: TransactionIdParamRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.transactions.remove(v.params.id, actorOf(req));
    return { success: true, data, message: "To'lov bekor qilindi" };
  }

  // ═══════════════════════════ CHEGIRMALAR ═══════════════════════════

  @Get('discounts')
  @Permissions(PERMISSIONS.FINANCE_READ)
  async discountList(@Validated(discountListSchema) v: DiscountListRequest) {
    const { items, total, page, limit } = await this.discounts.list(v.query);
    return { success: true, data: items, meta: buildMeta({ page, limit, total }) };
  }

  /**
   * CHEGIRMA TASDIG'I: filialning delegatsiya matritsasi hal qiladi
   * (`Branch.delegation.discount_set`). `threshold` rejimida chegirma
   * owner qo'ygan chegaradan oshmasa DARHOL yoziladi, oshsa — tasdiqqa.
   *
   * ⚠ 201 (yozildi) yoki 202 (tasdiqqa yuborildi).
   */
  @Post('discounts')
  @HttpCode(201)
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  async discountCreate(
    @Validated(discountCreateSchema) v: DiscountCreateRequest,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { needsApproval } = await this.approvals.checkConfigApproval({
      permissions: req.permissions,
      kind: APPROVAL_KINDS.DISCOUNT_SET,
      metrics: discountMetrics(v.body as Record<string, unknown>),
    });

    if (needsApproval) {
      const approval = await this.discounts.requestDiscount(
        { op: 'create', body: v.body }, actorOf(req),
      );
      // ⚠ `@HttpCode(201)` ni BEKOR QILAMIZ: bu shox 202 qaytaradi.
      res.status(202);
      return {
        success: true,
        data: approval,
        message: "Tasdiqlash uchun yuborildi. Owner tasdiqlagach qo'llanadi.",
      };
    }

    const data = await this.discounts.create(v.body, actorOf(req));
    return { success: true, data, message: "Chegirma qo'shildi" };
  }

  /**
   * Qarang: `discountCreate` — bir xil tasdiq qoidasi.
   *
   * ⚠ TAHRIRLASHDA `type`/`value` body'da bo'lmasligi mumkin (masalan
   * faqat izoh o'zgartirilsa). U holda o'lchov BO'SH qaytadi va
   * `threshold` rejimida o'zgarish baribir tasdiqqa tushadi — ATAYLAB
   * fail-closed.
   */
  @Patch('discounts/:id')
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  async discountUpdate(
    @Validated(discountUpdateSchema) v: DiscountUpdateRequest,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { needsApproval } = await this.approvals.checkConfigApproval({
      permissions: req.permissions,
      kind: APPROVAL_KINDS.DISCOUNT_SET,
      metrics: discountMetrics(v.body as Record<string, unknown>),
    });

    if (needsApproval) {
      const approval = await this.discounts.requestDiscount(
        { op: 'update', discountId: v.params.id, body: v.body }, actorOf(req),
      );
      res.status(202);
      return {
        success: true,
        data: approval,
        message: "Tasdiqlash uchun yuborildi. Owner tasdiqlagach qo'llanadi.",
      };
    }

    const data = await this.discounts.update(v.params.id, v.body);
    return { success: true, data, message: 'Chegirma yangilandi' };
  }

  @Delete('discounts/:id')
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  async discountRemove(
    @Validated(discountIdParamSchema) v: DiscountIdParamRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.discounts.remove(v.params.id, actorOf(req));
    return { success: true, data, message: "Chegirma o'chirildi" };
  }
}
