import {
  Controller, Delete, Get, Patch, Post, Put, Req, UseGuards,
} from '@nestjs/common';
import { CoursesService } from './courses.service.js';
import { CoursePriceService } from './course-price.service.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { Permissions, Validated } from '../../common/decorators/index.js';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.js';
import {
  listSchema, idSchema, createSchema, updateSchema,
  priceListSchema, setPriceSchema, clearPriceSchema, resolveSchema,
  type ListRequest, type IdRequest, type CreateRequest, type UpdateRequest,
  type PriceListRequest, type SetPriceRequest, type ClearPriceRequest,
  type ResolveRequest,
} from './courses.validators.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * KURSLAR — Express `courses.routes.js` NING TO'LIQ EKVIVALENTI (9/9).
 *
 * ⚠⚠ E'LON TARTIBI O'ZGARTIRILMASIN ⚠⚠
 * `GET /resolve/:groupId` `GET /:id` DAN OLDIN turadi. Teskarisida
 * NestJS "resolve" ni kurs ID'si deb o'qir edi va guruh narxini yechish
 * har doim 404 "Kurs topilmadi" berardi.
 *
 * ── RUXSATLAR ATAYLAB HAR XIL ──
 *   o'qish (`GET`)           → `courses.read`    — filial ichi ruxsati;
 *                              guruh yaratishda kurs tanlanadi.
 *   katalog yozish           → `courses.manage`  — OWNER-ONLY
 *                              (`permissionScope.js`). Filiallar o'zicha
 *                              nom o'ylab topsa tarmoq hisobotini
 *                              birlashtirib bo'lmasdi.
 *   narx yozish              → `finance.manage`  — narx MOLIYAVIY qaror,
 *                              katalog nomi EMAS.
 *
 * `courses.manage` NARX uchun ISHLATILMAYDI: u owner-only, filial
 * rahbari esa O'Z filiali uchun istisno narx belgilay olishi kerak.
 * Chegara ikki qatlamli — `finance.manage` ruxsati VA servisdagi
 * `isBranchAllowed()`.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Controller('courses')
@UseGuards(PermissionsGuard)
export class CoursesController {
  constructor(
    private readonly courses: CoursesService,
    private readonly prices: CoursePriceService,
  ) {}

  /**
   * ⚠ ENG BIRINCHI — `GET /:id` DAN OLDIN.
   *
   * Guruh uchun AMALDAGI narx va u QAYERDAN kelgani. Manba ham
   * qaytariladi — owner "nega bu narx" savoliga javob topsin.
   */
  @Get('resolve/:groupId')
  @Permissions(PERMISSIONS.COURSES_READ)
  async priceResolve(@Validated(resolveSchema) v: ResolveRequest) {
    const data = await this.prices.resolveGroupPrice(v.params.groupId, {
      year: v.query.year,
      month: v.query.month,
    });
    return { success: true, data };
  }

  @Get()
  @Permissions(PERMISSIONS.COURSES_READ)
  async list(@Validated(listSchema) v: ListRequest) {
    // ⚠ Standart `limit` = 100 (Express handler'idagi bilan bir xil),
    // `meta` da `pages` YO'Q — ikkalasi ham klient shartnomasi.
    const { items, total, page, limit } = await this.courses.list({
      search: v.query.search,
      includeInactive: v.query.includeInactive,
      page: Number(v.query.page) || 1,
      limit: Number(v.query.limit) || 100,
    });
    return { success: true, data: items, meta: { page, limit, total } };
  }

  @Get(':id')
  @Permissions(PERMISSIONS.COURSES_READ)
  async getById(@Validated(idSchema) v: IdRequest) {
    return { success: true, data: await this.courses.getById(v.params.id) };
  }

  @Post()
  @Permissions(PERMISSIONS.COURSES_MANAGE)
  async create(
    @Validated(createSchema) v: CreateRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.courses.create(v.body, req.user);
    return { success: true, data, message: "Kurs qo'shildi" };
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.COURSES_MANAGE)
  async update(@Validated(updateSchema) v: UpdateRequest) {
    const data = await this.courses.update(v.params.id, v.body);
    return { success: true, data, message: 'Saqlandi' };
  }

  /**
   * O'CHIRISH EMAS, NOFAOL QILISH: kurs guruhlarga bog'langan va
   * yo'qolsa tarixiy hisobot jimgina o'zgarardi.
   */
  @Delete(':id')
  @Permissions(PERMISSIONS.COURSES_MANAGE)
  async remove(@Validated(idSchema) v: IdRequest) {
    const { course, activeGroups } = await this.courses.softRemove(v.params.id);
    return {
      success: true,
      data: course,
      // Nechta faol guruh ta'sirlanganini AYTAMIZ — jimgina nofaol
      // qilish "nega yangi guruhda kurs yo'q" savolini keltirardi.
      message: activeGroups
        ? `Kurs nofaol qilindi. ${activeGroups} ta faol guruh o'zgarishsiz qoldi.`
        : 'Kurs nofaol qilindi',
    };
  }

  // ── NARX MATRITSASI ──

  @Get(':id/prices')
  @Permissions(PERMISSIONS.COURSES_READ)
  async priceList(@Validated(priceListSchema) v: PriceListRequest) {
    return { success: true, data: await this.prices.listForCourse(v.params.id) };
  }

  @Put(':id/prices')
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  async priceSet(
    @Validated(setPriceSchema) v: SetPriceRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.prices.setPrice(
      {
        courseId: v.params.id,
        branchId: v.body.branchId ?? null,
        amount: v.body.amount,
        validFrom: v.body.validFrom,
        note: v.body.note,
      },
      req.user,
    );
    return {
      success: true,
      data,
      message: v.body.branchId ? 'Filial narxi saqlandi' : 'Bazaviy narx saqlandi',
    };
  }

  @Delete(':id/prices/:branchId')
  @Permissions(PERMISSIONS.FINANCE_MANAGE)
  async priceClear(
    @Validated(clearPriceSchema) v: ClearPriceRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.prices.clearBranchPrice(
      v.params.id,
      v.params.branchId,
      req.user,
    );
    return {
      success: true,
      data,
      message: "Filial istisnosi olib tashlandi - bazaviy narx amal qiladi",
    };
  }
}
