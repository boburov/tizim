import {
  Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, Res, UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ExpenseService } from './expense.service.js';
import { ExpenseCategoryService } from './expense-category.service.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { Permissions, Validated } from '../../common/decorators/index.js';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.js';
import {
  createSchema, updateSchema, idParamSchema, listSchema, summarySchema,
  categoryListSchema, categoryCreateSchema, categoryUpdateSchema,
  type CreateRequest, type UpdateRequest, type IdParamRequest,
  type ListRequest, type SummaryRequest, type CategoryListRequest,
  type CategoryCreateRequest, type CategoryUpdateRequest,
} from './expenses.validators.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * UMUMIY CHIQIMLAR — Express `expenses.routes.js` EKVIVALENTI (10/10).
 *
 * ⚠ E'LON TARTIBI Express bilan AYNAN bir xil: `/categories*` va
 * `/summary` `/:id` DAN OLDIN turadi — aks holda ular chiqim ID si
 * sifatida o'qilib 404 berardi.
 *
 * ⚠ RUXSATLAR AJRATILGAN:
 *   o'qish            → expenses.read
 *   yaratish/tahrir   → finance.create_expense
 *   kategoriya, o'chirish → finance.manage_expense
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Controller('expenses')
@UseGuards(PermissionsGuard)
export class ExpensesController {
  constructor(
    private readonly expenses: ExpenseService,
    private readonly categories: ExpenseCategoryService,
  ) {}

  // ── KATEGORIYALAR (`/:id` DAN OLDIN) ──

  @Get('categories')
  @Permissions(PERMISSIONS.EXPENSES_READ)
  async categoryList(@Validated(categoryListSchema) v: CategoryListRequest) {
    return { success: true, data: await this.categories.list(v.query) };
  }

  @Post('categories')
  @HttpCode(201)
  @Permissions(PERMISSIONS.FINANCE_MANAGE_EXPENSE)
  async categoryCreate(
    @Validated(categoryCreateSchema) v: CategoryCreateRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.categories.create(v.body, req.user);
    return { success: true, data, message: "Kategoriya qo'shildi" };
  }

  @Patch('categories/:id')
  @HttpCode(200)
  @Permissions(PERMISSIONS.FINANCE_MANAGE_EXPENSE)
  async categoryUpdate(
    @Param('id') id: string,
    @Validated(categoryUpdateSchema) v: CategoryUpdateRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.categories.update(id, v.body, req.user);
    return { success: true, data, message: 'Kategoriya yangilandi' };
  }

  @Delete('categories/:id')
  @HttpCode(200)
  @Permissions(PERMISSIONS.FINANCE_MANAGE_EXPENSE)
  async categoryRemove(
    @Param('id') id: string,
    @Validated(idParamSchema) _v: IdParamRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.categories.remove(id, req.user);
    return { success: true, message: "Kategoriya o'chirildi" };
  }

  // ── HISOBOT (`/:id` DAN OLDIN) ──

  @Get('summary')
  @Permissions(PERMISSIONS.EXPENSES_READ)
  async summary(@Validated(summarySchema) v: SummaryRequest) {
    return {
      success: true,
      data: await this.expenses.summaryByCategory(v.query as never),
    };
  }

  // ── CHIQIMLAR ──

  @Get()
  @Permissions(PERMISSIONS.EXPENSES_READ)
  async list(@Validated(listSchema) v: ListRequest) {
    const { items, total, page, limit, totalAmount } =
      await this.expenses.list(v.query as never);
    return {
      success: true,
      data: items,
      meta: { page, limit, total, totalAmount },
    };
  }

  /**
   * Chiqim yaratish.
   *
   * ⚠ IKKI XIL MUVAFFAQIYAT STATUSI:
   *   201 — chiqim YOZILDI;
   *   202 — summa filial limitidan oshdi (yoki markaz umumiy chiqimi),
   *         hujjat YARATILMADI, tasdiq so'rovi ochildi.
   *
   * NestJS bitta metod uchun bitta statik `@HttpCode` beradi, shuning
   * uchun status ISH VAQTIDA qo'yiladi (`@Res({ passthrough: true })`).
   * `passthrough` MUHIM: usiz Nest javobni O'ZI yubormaydi va so'rov
   * osilib qolardi.
   */
  @Post()
  @Permissions(PERMISSIONS.FINANCE_CREATE_EXPENSE)
  async create(
    @Validated(createSchema) v: CreateRequest,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.expenses.create(v.body as never, req.user);

    if ((result as { pendingApproval?: boolean })?.pendingApproval) {
      res.status(202);
      return {
        success: true,
        data: (result as { approval: unknown }).approval,
        message: "Tasdiqlash uchun yuborildi. Owner tasdiqlagach chiqim yoziladi.",
      };
    }

    res.status(201);
    return { success: true, data: result, message: "Chiqim qo'shildi" };
  }

  @Get(':id')
  @Permissions(PERMISSIONS.EXPENSES_READ)
  async getById(
    @Param('id') id: string,
    @Validated(idParamSchema) _v: IdParamRequest,
  ) {
    return { success: true, data: await this.expenses.getById(id) };
  }

  @Patch(':id')
  @HttpCode(200)
  @Permissions(PERMISSIONS.FINANCE_CREATE_EXPENSE)
  async update(
    @Param('id') id: string,
    @Validated(updateSchema) v: UpdateRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.expenses.update(id, v.body as never, req.user);
    return { success: true, data, message: 'Chiqim yangilandi' };
  }

  @Delete(':id')
  @HttpCode(200)
  @Permissions(PERMISSIONS.FINANCE_MANAGE_EXPENSE)
  async remove(
    @Param('id') id: string,
    @Validated(idParamSchema) _v: IdParamRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.expenses.remove(id, req.user);
    return { success: true, message: "Chiqim o'chirildi" };
  }
}
