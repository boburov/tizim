import { Controller, Delete, Get, HttpCode, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { RoomsService } from './rooms.service.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { Permissions, Validated } from '../../common/decorators/index.js';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.js';
import {
  idSchema,
  listSchema,
  createSchema,
  updateSchema,
  type IdRequest,
  type ListRequest,
  type CreateRequest,
  type UpdateRequest,
} from './rooms.validators.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * XONALAR — Express `rooms.routes.js` NING TO'LIQ EKVIVALENTI (5/5).
 *
 * Xona filialning FIZIK resursi, ya'ni hamma amal filial ichida.
 *
 * `classes.*` ruxsatlari `constants/permissions.js` da ancha vaqtdan beri
 * bor edi, lekin model ham marshrut ham yo'q edi — o'lik ruxsat guruhi.
 * Ular FILIAL ICHI ruxsatlari, ya'ni filial rahbari o'z xonalarini o'zi
 * boshqaradi.
 *
 * FILIAL CHEGARASI servis qatlamida: `branchFilter` (ro'yxat),
 * `isBranchAllowed` (bitta xona), `resolveBranchForWrite` (yaratish).
 *
 * ⚠ SAHIFALASH STANDARTI BU YERDA BOSHQACHA: `limit` standarti **200**
 * (umumiy `parsePagination` dagi 20 EMAS) va `meta` da `pages` maydoni
 * YO'Q. Express handler'i aynan shunday yozilgan va xona tanlagichi
 * bitta so'rovda butun ro'yxatni oladi. `parsePagination` ga
 * "birlashtirish" klient shartnomasini JIMGINA buzardi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Controller('rooms')
@UseGuards(PermissionsGuard)
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  @Get()
  @Permissions(PERMISSIONS.CLASSES_READ)
  async list(@Validated(listSchema) v: ListRequest) {
    const { items, total, page, limit } = await this.rooms.list({
      search: v.query.search,
      branchId: v.query.branchId,
      includeInactive: v.query.includeInactive,
      page: Number(v.query.page) || 1,
      limit: Number(v.query.limit) || 200,
    });
    return { success: true, data: items, meta: { page, limit, total } };
  }

  @Get(':id')
  @Permissions(PERMISSIONS.CLASSES_READ)
  async getById(@Validated(idSchema) v: IdRequest) {
    return { success: true, data: await this.rooms.getById(v.params.id) };
  }

  @Post()
  @HttpCode(201)
  @Permissions(PERMISSIONS.CLASSES_CREATE)
  async create(
    @Validated(createSchema) v: CreateRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.rooms.create(v.body, req.user);
    return { success: true, data, message: "Xona qo'shildi" };
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.CLASSES_UPDATE)
  async update(@Validated(updateSchema) v: UpdateRequest) {
    const data = await this.rooms.update(v.params.id, v.body);
    return { success: true, data, message: 'Saqlandi' };
  }

  /** Javobda `data` YO'Q — Express handler'i faqat xabar qaytaradi. */
  @Delete(':id')
  @Permissions(PERMISSIONS.CLASSES_DELETE)
  async remove(@Validated(idSchema) v: IdRequest, @Req() req: AuthenticatedRequest) {
    await this.rooms.softRemove(v.params.id, req.user);
    return { success: true, message: "Xona o'chirildi" };
  }
}
