import { Controller, Delete, Get, HttpCode, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { NotificationTemplatesService } from './notification-templates.service.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Permissions, Validated } from '../../common/decorators/index.js';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import { parsePagination, buildMeta } from '../../common/utils/pagination.js';
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
} from './notification-templates.validators.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * XABAR SHABLONLARI — Express `notificationTemplates.routes.js` NING
 * TO'LIQ EKVIVALENTI (5/5).
 *
 * ⚠ O'QISH ATAYLAB RUXSATSIZ: har qanday auth'langan foydalanuvchi
 * shablonlarni o'qiy oladi, chunki O'QITUVCHI ham "xabar yuborish"
 * oynasida shablon tanlaydi. Ruxsat qo'yilsa o'qituvchining yuborish
 * oynasi bo'sh chiqardi.
 *
 * ⚠ YOZISH ROL **VA** RUXSATNI BIRGA TALAB QILADI (AND, OR EMAS).
 * Express uchala yozish marshrutiga IKKI middleware'ni KETMA-KET ulaydi:
 *
 *     requireRole(ROLES.OWNER)
 *     requirePermission(NOTIFICATION_TEMPLATES_MANAGE)
 *
 * NestJS'da bu `@Roles(...)` + `@Permissions(...)` juftligi bilan
 * ifodalanadi — ikkala qo'riqchi ham MUSTAQIL ishlaydi va ikkalasi ham
 * o'tishi shart. Faqat bittasini qoldirish chegarani JIMGINA
 * yumshatardi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Controller('notification-templates')
@UseGuards(PermissionsGuard, RolesGuard)
export class NotificationTemplatesController {
  constructor(private readonly templates: NotificationTemplatesService) {}

  @Get()
  async list(@Validated(listSchema) v: ListRequest, @Req() req: AuthenticatedRequest) {
    const { page, limit } = parsePagination(req.query as Record<string, unknown>);
    const { items, total } = await this.templates.list({
      search: v.query.search,
      category: v.query.category,
      includeInactive: v.query.includeInactive,
      page,
      limit,
    });
    return { success: true, data: items, meta: buildMeta({ page, limit, total }) };
  }

  @Get(':id')
  async getById(@Validated(idSchema) v: IdRequest) {
    return { success: true, data: await this.templates.getById(v.params.id) };
  }

  @Post()
  @HttpCode(201)
  @Permissions(PERMISSIONS.NOTIFICATION_TEMPLATES_MANAGE)
  async create(@Validated(createSchema) v: CreateRequest) {
    const data = await this.templates.create(v.body);
    return { success: true, data, message: 'Shablon yaratildi' };
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.NOTIFICATION_TEMPLATES_MANAGE)
  async update(@Validated(updateSchema) v: UpdateRequest) {
    const data = await this.templates.update(v.params.id, v.body);
    return { success: true, data, message: 'Shablon yangilandi' };
  }

  /** Javobda `data` YO'Q — Express handler'i faqat xabar qaytaradi. */
  @Delete(':id')
  @Permissions(PERMISSIONS.NOTIFICATION_TEMPLATES_MANAGE)
  async remove(@Validated(idSchema) v: IdRequest) {
    await this.templates.softRemove(v.params.id);
    return { success: true, message: "Shablon o'chirildi" };
  }
}
