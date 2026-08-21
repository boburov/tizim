import { Controller, Delete, Get, HttpCode, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { LeadOptionsService } from './lead-options.service.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Permissions, Roles, Validated } from '../../common/decorators/index.js';
import { PERMISSIONS, ROLES } from '../../common/constants/permissions.js';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.js';
import {
  idSchema, listSchema, createSchema, updateSchema,
  type IdRequest, type ListRequest, type CreateRequest, type UpdateRequest,
} from './lead-options.validators.js';

/**
 * LID KATALOGLARI — Express `leadOptions.routes.js` EKVIVALENTI (4/4).
 *
 * ⚠ O'QISH RUXSATSIZ: lid formasi `<select>` ini har qanday auth'langan
 * xodim to'ldiradi. Ruxsat qo'yilsa forma bo'sh ro'yxat bilan ochilardi.
 *
 * ⚠ YOZISH ROL **VA** RUXSATNI BIRGA TALAB QILADI (AND). Express
 * `requireRole(OWNER)` va `requirePermission(LEADS_MANAGE)` ni KETMA-KET
 * ulaydi — ikkala qo'riqchi ham mustaqil ishlaydi va ikkalasi ham
 * o'tishi shart.
 *
 * ⚠ `GET /:id` MARSHRUTI YO'Q — Express'da ham yo'q. "Simmetriya uchun"
 * qo'shilsa bu YANGI endpoint bo'lardi.
 */
@Controller('lead-options')
@UseGuards(PermissionsGuard, RolesGuard)
export class LeadOptionsController {
  constructor(private readonly options: LeadOptionsService) {}

  /** ⚠ `meta` faqat `{ total }` — sahifalash YO'Q (servisdagi izohga qarang). */
  @Get()
  async list(@Validated(listSchema) v: ListRequest) {
    const { items, total } = await this.options.list({
      kind: v.query.kind,
      search: v.query.search,
      includeInactive: v.query.includeInactive,
    });
    return { success: true, data: items, meta: { total } };
  }

  @Post()
  @HttpCode(201)
  @Roles(ROLES.OWNER)
  @Permissions(PERMISSIONS.LEADS_MANAGE)
  async create(@Validated(createSchema) v: CreateRequest, @Req() req: AuthenticatedRequest) {
    const data = await this.options.create(v.body, req.user);
    return { success: true, data, message: "Qo'shildi" };
  }

  @Patch(':id')
  @Roles(ROLES.OWNER)
  @Permissions(PERMISSIONS.LEADS_MANAGE)
  async update(@Validated(updateSchema) v: UpdateRequest) {
    const data = await this.options.update(v.params.id, v.body);
    return { success: true, data, message: 'Saqlandi' };
  }

  /** Javobda `data` YO'Q — Express handler'i faqat xabar qaytaradi. */
  @Delete(':id')
  @Roles(ROLES.OWNER)
  @Permissions(PERMISSIONS.LEADS_MANAGE)
  async remove(@Validated(idSchema) v: IdRequest) {
    await this.options.softRemove(v.params.id);
    return { success: true, message: "O'chirildi" };
  }
}
