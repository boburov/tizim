import {
  Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards,
} from '@nestjs/common';
import { FinanceOpsService } from './finance-ops.service.js';
import { BudgetService } from './budget.service.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { Permissions, Validated } from '../../common/decorators/index.js';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.js';
import {
  refundSchema, transferSchema, ownerCapitalSchema,
  budgetCreateSchema, budgetUpdateSchema, budgetIdSchema, budgetListSchema,
  type RefundRequest, type TransferRequest, type OwnerCapitalRequest,
  type BudgetCreateRequest, type BudgetUpdateRequest, type BudgetIdRequest,
  type BudgetListRequest,
} from './finance-ops.validators.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MOLIYAVIY AMALLAR — Express `financeOps.routes.js` EKVIVALENTI (8/8).
 *
 * ── NEGA `finance-analytics` GA QO'SHILMADI ──
 * U ATAYLAB faqat o'qish moduli. Yozishni o'sha yerga qo'shish "o'qish
 * qatlami" chegarasini yemirardi va vaqt o'tib u yana ikkinchi
 * buxgalteriya nuqtasiga aylanardi.
 *
 * ⚠ E'LON TARTIBI: `GET /budgets` `GET /budgets/:id` DAN OLDIN.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Controller('finance-ops')
@UseGuards(PermissionsGuard)
export class FinanceOpsController {
  constructor(
    private readonly ops: FinanceOpsService,
    private readonly budgets: BudgetService,
  ) {}

  @Post('refunds')
  @HttpCode(201)
  @Permissions(PERMISSIONS.FINANCE_MANAGE_REFUNDS)
  async refund(
    @Validated(refundSchema) v: RefundRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.ops.createRefund(v.body, req.user);
    return { success: true, data };
  }

  @Post('transfers')
  @HttpCode(201)
  @Permissions(PERMISSIONS.FINANCE_MANAGE_TRANSFERS)
  async transfer(
    @Validated(transferSchema) v: TransferRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.ops.createTransfer(v.body, req.user);
    return { success: true, data };
  }

  /**
   * EGASINING PULI — ALOHIDA ruxsat.
   *
   * Ilgari bu `finance.manage_accounts` bilan qo'riqlanardi va bu juda
   * keng edi: hisob ochish huquqi bor xodim markazdan pul yechib olish
   * huquqini ham olardi. Endi kalit alohida va `manage_accounts` uni
   * QAMRAMAYDI.
   */
  @Post('owner-capital')
  @HttpCode(201)
  @Permissions(PERMISSIONS.FINANCE_MANAGE_OWNER_CAPITAL)
  async ownerCapital(
    @Validated(ownerCapitalSchema) v: OwnerCapitalRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.ops.createOwnerCapital(v.body, req.user);
    return { success: true, data };
  }

  // ══════════════════════════════════════════════════════════════════
  // BYUDJET — REJA MA'LUMOTI
  //
  // ── JURNALGA YOZILMAYDI ──
  // Byudjet niyat, pul harakati emas. Shuning uchun bu marshrutlar
  // `FinancialTransactionService` ni umuman chaqirmaydi.
  //
  // ── KO'RISH va BOSHQARISH AJRATILGAN ──
  // Ro'yxat/tafsilot `finance.read` bilan ochiladi (byudjet/fakt
  // taqqoslash umumiy manzaraning qismi), o'zgartirish esa
  // `finance.manage_budgets` talab qiladi: byudjetdan oshib ketganini
  // ko'rgan odam rejani ko'tarib qo'ymasligi kerak.
  // ══════════════════════════════════════════════════════════════════

  @Get('budgets')
  @Permissions(PERMISSIONS.FINANCE_READ)
  async budgetList(@Validated(budgetListSchema) v: BudgetListRequest) {
    return { success: true, data: await this.budgets.listBudgets(v.query) };
  }

  @Get('budgets/:id')
  @Permissions(PERMISSIONS.FINANCE_READ)
  async budgetGet(
    @Param('id') id: string,
    @Validated(budgetIdSchema) _v: BudgetIdRequest,
  ) {
    return { success: true, data: await this.budgets.getBudget(id) };
  }

  @Post('budgets')
  @HttpCode(201)
  @Permissions(PERMISSIONS.FINANCE_MANAGE_BUDGETS)
  async budgetCreate(
    @Validated(budgetCreateSchema) v: BudgetCreateRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    return { success: true, data: await this.budgets.createBudget(v.body, req.user) };
  }

  /** ⚠ `@HttpCode(200)` — Express `res.json(...)`, ya'ni 200. */
  @Patch('budgets/:id')
  @HttpCode(200)
  @Permissions(PERMISSIONS.FINANCE_MANAGE_BUDGETS)
  async budgetUpdate(
    @Param('id') id: string,
    @Validated(budgetUpdateSchema) v: BudgetUpdateRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    return { success: true, data: await this.budgets.updateBudget(id, v.body, req.user) };
  }

  @Delete('budgets/:id')
  @HttpCode(200)
  @Permissions(PERMISSIONS.FINANCE_MANAGE_BUDGETS)
  async budgetRemove(
    @Param('id') id: string,
    @Validated(budgetIdSchema) _v: BudgetIdRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    return { success: true, data: await this.budgets.removeBudget(id, req.user) };
  }
}
