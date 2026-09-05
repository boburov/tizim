import {
  Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, Res, UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { ExpenseService } from './expense.service.js';
import { ExpenseCategoryService } from './expense-category.service.js';
import { StorageService } from '../storage/index.js';
import { canonicalMimeOf } from '../../common/middleware/upload-attachment.js';
import { contentDisposition } from '../../common/utils/content-disposition.js';
import { ApiError } from '../../common/errors/api-error.js';
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
    private readonly storage: StorageService,
  ) {}

  // ══════════════════════════════════════════════════════════════════
  // CHEK / KVITANSIYA (`/:id` DAN OLDIN)
  // ══════════════════════════════════════════════════════════════════
  //
  // ── NEGA `/storage` DA EMAS ──
  // `StorageModule` da yuklash marshruti YO'Q va uni umumiy qilib
  // ochish "kim istasa fayl yuklaydi" degani bo'lardi. Chek — MOLIYAVIY
  // hujjat ilovasi, ya'ni uni yuklash huquqi chiqim yozish huquqi
  // bilan BIR XIL (`finance.create_expense`) va shu modulda qoladi.
  //
  // ── IKKI QADAM, BITTA SO'ROV EMAS ──
  // Fayl AVVAL yuklanadi (`StoredFile` yaratiladi), keyin uning ID si
  // chiqim tanasidagi `receipt` maydoniga qo'yiladi. Sabab: chiqim
  // tasdiqqa tushishi mumkin va o'sha holatda hujjat hali YO'Q —
  // faylni chiqimga bog'lab yuborish uni yetim qoldirardi. ID esa
  // tasdiq payload'ida bemalol saqlanadi.

  /**
   * Chek yuklash. Fayl `UploadAttachmentMiddleware` orqali keladi
   * (tur oq ro'yxati + imzo tekshiruvi + kvota) — modulda ulangan.
   */
  @Post('receipt')
  @HttpCode(201)
  @Permissions(PERMISSIONS.FINANCE_CREATE_EXPENSE)
  async receiptUpload(@Req() req: AuthenticatedRequest) {
    const file = (req as { file?: Express.Multer.File }).file;
    if (!file?.buffer?.length) throw new ApiError(400, 'Fayl biriktirilmagan');

    const saved = await this.storage.saveBuffer({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      userId: req.user?.id || null,
      // `FilePurpose.receipt` — tozalash siyosati chek fayllarini
      // vazifa ilovalaridan AJRATIB ko'radi: moliyaviy hujjat
      // ilovasini avtomatik tozalab yuborish mumkin emas.
      purpose: 'receipt',
    });

    return {
      success: true,
      data: {
        id: (saved as { id: string }).id,
        originalName: (saved as { originalName: string }).originalName,
        size: (saved as { size: number }).size,
      },
      message: 'Chek yuklandi',
    };
  }

  /**
   * Chekni yuklab olish.
   *
   * ⚠ Content-Type SAQLANGAN `mimeType` dan emas, KENGAYTMADAN
   * olinadi va fayl HAR DOIM `attachment` sifatida beriladi —
   * `assignments/:id/file` dagi bilan bir xil sabab: yuklovchi
   * yozgan MIME'ga ishonib bo'lmaydi.
   */
  @Get('receipt/:id')
  @Permissions(PERMISSIONS.EXPENSES_READ)
  async receiptDownload(@Param('id') id: string, @Res() res: Response) {
    const file = await this.storage.getReceipt(String(id));
    const buffer = await this.storage.readFile(file as never);
    const originalName = (file as { originalName: string }).originalName;

    res.setHeader('Content-Type', canonicalMimeOf(originalName));
    res.setHeader('Content-Length', buffer.length);
    res.setHeader('Content-Disposition', contentDisposition(originalName));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(buffer);
  }

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
