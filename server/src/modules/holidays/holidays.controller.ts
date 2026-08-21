import { Controller, Delete, Get, HttpCode, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { HolidaysService } from './holidays.service.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Permissions, Roles, Validated } from '../../common/decorators/index.js';
import { PERMISSIONS, ROLES } from '../../common/constants/permissions.js';
import { parsePagination, buildMeta } from '../../common/utils/pagination.js';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.js';
import {
  idSchema, listSchema, createSchema, updateSchema, congratulateSchema,
  type IdRequest, type ListRequest, type CreateRequest,
  type UpdateRequest, type CongratulateRequest,
} from './holidays.validators.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BAYRAMLAR — Express `holidays.routes.js` EKVIVALENTI (7/7).
 *
 * ⚠⚠ E'LON TARTIBI: `/teacher-birthdays` VA
 * `/teacher-birthdays/:id/congratulate` `GET /:id` DAN OLDIN turishi
 * SHART — aks holda "teacher-birthdays" bayram ID'si sifatida ushlanib
 * qolardi va tug'ilgan kunlar ro'yxati 404 berardi.
 *
 * ⚠ IKKI XIL RUXSAT GURUHI:
 *   • tug'ilgan kunlar — OWNER roli VA `notifications.send` (chunki bu
 *     amal HAQIQIY xabar yuboradi);
 *   • bayram CRUD    — OWNER roli VA `holidays.manage`.
 * Ikkalasi ham AND semantikasi (Express ikki middleware'ni ketma-ket
 * ulaydi).
 *
 * ⚠ O'QISH (`GET /` va `GET /:id`) RUXSATSIZ: bayram kalendarini har
 * qanday auth'langan foydalanuvchi ko'radi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Controller('holidays')
@UseGuards(PermissionsGuard, RolesGuard)
export class HolidaysController {
  constructor(private readonly holidays: HolidaysService) {}

  /** ⚠ `GET /:id` DAN OLDIN. */
  @Get('teacher-birthdays')
  @Roles(ROLES.OWNER)
  @Permissions(PERMISSIONS.NOTIFICATIONS_SEND)
  async teacherBirthdays() {
    return { success: true, data: await this.holidays.listTeacherBirthdays() };
  }

  /** ⚠ `GET /:id` DAN OLDIN (POST bo'lsa-da, tartib Express bilan bir xil). */
  @Post('teacher-birthdays/:id/congratulate')
  @HttpCode(201)
  @Roles(ROLES.OWNER)
  @Permissions(PERMISSIONS.NOTIFICATIONS_SEND)
  async congratulate(
    @Validated(congratulateSchema) v: CongratulateRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.holidays.congratulateTeacher(v.params.id, v.body, req.user);
    return { success: true, data, message: 'Tabrik yuborildi' };
  }

  @Get()
  async list(@Validated(listSchema) v: ListRequest, @Req() req: AuthenticatedRequest) {
    const { page, limit } = parsePagination(req.query as Record<string, unknown>);
    const { items, total } = await this.holidays.list({
      search: v.query.search,
      audience: v.query.audience,
      includeInactive: v.query.includeInactive,
      includePast: v.query.includePast,
      page,
      limit,
    });
    return { success: true, data: items, meta: buildMeta({ page, limit, total }) };
  }

  @Get(':id')
  async getById(@Validated(idSchema) v: IdRequest) {
    return { success: true, data: await this.holidays.getById(v.params.id) };
  }

  @Post()
  @HttpCode(201)
  @Roles(ROLES.OWNER)
  @Permissions(PERMISSIONS.HOLIDAYS_MANAGE)
  async create(@Validated(createSchema) v: CreateRequest, @Req() req: AuthenticatedRequest) {
    const data = await this.holidays.create(v.body, req.user);
    return { success: true, data, message: "Bayram qo'shildi" };
  }

  @Patch(':id')
  @Roles(ROLES.OWNER)
  @Permissions(PERMISSIONS.HOLIDAYS_MANAGE)
  async update(@Validated(updateSchema) v: UpdateRequest) {
    const data = await this.holidays.update(v.params.id, v.body);
    return { success: true, data, message: 'Bayram yangilandi' };
  }

  @Delete(':id')
  @Roles(ROLES.OWNER)
  @Permissions(PERMISSIONS.HOLIDAYS_MANAGE)
  async remove(@Validated(idSchema) v: IdRequest) {
    await this.holidays.softRemove(v.params.id);
    return { success: true, message: "Bayram o'chirildi" };
  }
}
