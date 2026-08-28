import {
  MiddlewareConsumer, Module, NestModule, OnModuleInit, RequestMethod,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { ExpensesController } from './expenses.controller.js';
import { ExpenseService } from './expense.service.js';
import { ExpenseCategoryService } from './expense-category.service.js';
import { FinanceModule } from '../finance/finance.module.js';
import { ExpenseApprovalsModule } from '../expense-approvals/expense-approvals.module.js';
import { StorageModule } from '../storage/storage.module.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';
import { UploadAttachmentMiddleware } from '../../common/middleware/upload-attachment.js';
import { uploadLimiter } from '../../common/middleware/rate-limit.js';
import { ApprovalExecutorRegistry } from '../../common/approvals/approval-executor.registry.js';
import { APPROVAL_KINDS } from '../../common/constants/approvals.js';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import { hasAnyPermission } from '../../common/rbac/permission.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.js';

/**
 * `PermissionsGuard` NING MIDDLEWARE SHAKLI — CHEK YUKLASH UCHUN.
 *
 * ⚠ NEGA QO'RIQCHI YETARLI EMAS: NestJS qo'riqchilari middleware'dan
 * KEYIN ishlaydi. Faqat `@Permissions` ga tayanilsa, ruxsatsiz
 * foydalanuvchining fayli AVVAL xotiraga to'liq o'qilib, keyin 403
 * qaytarilardi. `assignments.module.ts` da aynan shu sabab bilan
 * aynan shunday qilingan.
 *
 * Xato matni qo'riqchi bilan BIR XIL — qaysi qatlam to'xtatgani
 * tashqaridan ko'rinmaydi.
 */
const receiptPermissionMiddleware = (
  req: Request, _res: Response, next: NextFunction,
): void => {
  const r = req as unknown as AuthenticatedRequest;
  if (!r.user) return next(new ApiError(401, "Avtorizatsiyadan o'tilmagan"));
  if (!hasAnyPermission(r.permissions, [PERMISSIONS.FINANCE_CREATE_EXPENSE])) {
    return next(new ApiError(403, 'Ruxsat etilmagan'));
  }
  next();
};

/**
 * UMUMIY CHIQIMLAR (FAZA 7.6).
 *
 * ⚠ `ExpenseService` EKSPORT QILINADI: `executeApprovedExpense` —
 * `EXPENSE_CREATE` tasdig'ining BAJARUVCHISI. `expense-approvals`
 * dagi `approve` ochilganda u shu metodni chaqiradi.
 */
@Module({
  // `StorageModule` → chek faylini saqlash/o'qish (`saveBuffer`,
  // `getReceipt`, `readFile`) va kvota hisobi.
  imports: [FinanceModule, ExpenseApprovalsModule, StorageModule],
  controllers: [ExpensesController],
  providers: [ExpenseService, ExpenseCategoryService, UploadAttachmentMiddleware],
  exports: [ExpenseService],
})
export class ExpensesModule implements NestModule, OnModuleInit {
  constructor(
    private readonly executors: ApprovalExecutorRegistry,
    private readonly svc: ExpenseService,
  ) {}

/**
 * ⚠ TASDIQ BAJARUVCHISINI RO'YXATGA OLADI.
 *
 * Bog'liqlik AYLANMA (bu servis approvals'ni chaqiradi, approvals esa
 * bajarish uchun buni chaqiradi). Express dinamik import bilan hal
 * qiladi; NestJS'da ekvivalenti — KECH BOG'LASH orqali registry.
 * Batafsil: `common/approvals/approval-executor.registry.ts`.
 */
  onModuleInit(): void {
    this.executors.register(APPROVAL_KINDS.EXPENSE_CREATE, (a) =>
      this.svc.executeApprovedExpense(a),
    );
  }

  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(ExpensesController);

    // ⚠ ZANJIR TARTIBI `assignments.module.ts` BILAN AYNAN BIR XIL:
    //   requirePermission → uploadLimiter → uploadAttachment
    // `uploadLimiter` tekshiruvlardan KEYIN, lekin tanani o'qishdan
    // OLDIN: chegaraga yetgan so'rov faylni xotiraga yutmasdan
    // to'xtaydi.
    consumer
      .apply(receiptPermissionMiddleware, uploadLimiter, UploadAttachmentMiddleware)
      .forRoutes({ path: 'expenses/receipt', method: RequestMethod.POST });
  }
}
