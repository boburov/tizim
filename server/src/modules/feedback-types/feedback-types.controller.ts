import { Controller, Delete, Get, HttpCode, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { FeedbackTypesService } from './feedback-types.service.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Permissions, Roles, Validated } from '../../common/decorators/index.js';
import { PERMISSIONS, ROLES } from '../../common/constants/permissions.js';
import { parsePagination, buildMeta } from '../../common/utils/pagination.js';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.js';
import {
  idSchema, listSchema, createSchema, updateSchema,
  type IdRequest, type ListRequest, type CreateRequest, type UpdateRequest,
} from './feedback-types.validators.js';

/**
 * FIKR TURLARI — Express `feedbackTypes.routes.js` EKVIVALENTI (5/5).
 *
 * ⚠ O'QISH RUXSATSIZ: yangi fikr yozayotgan HAR QANDAY foydalanuvchi
 * turni tanlaydi.
 *
 * ⚠ YOZISH ROL **VA** RUXSAT (AND) — `lead-options` dagi izohga qarang.
 */
@Controller('feedback-types')
@UseGuards(PermissionsGuard, RolesGuard)
export class FeedbackTypesController {
  constructor(private readonly types: FeedbackTypesService) {}

  @Get()
  async list(@Validated(listSchema) v: ListRequest, @Req() req: AuthenticatedRequest) {
    const { page, limit } = parsePagination(req.query as Record<string, unknown>);
    const { items, total } = await this.types.list({
      search: v.query.search,
      includeInactive: v.query.includeInactive,
      page,
      limit,
    });
    return { success: true, data: items, meta: buildMeta({ page, limit, total }) };
  }

  @Get(':id')
  async getById(@Validated(idSchema) v: IdRequest) {
    return { success: true, data: await this.types.getById(v.params.id) };
  }

  @Post()
  @HttpCode(201)
  @Roles(ROLES.OWNER)
  @Permissions(PERMISSIONS.FEEDBACK_TYPES_MANAGE)
  async create(@Validated(createSchema) v: CreateRequest) {
    const data = await this.types.create(v.body);
    return { success: true, data, message: 'Tur yaratildi' };
  }

  @Patch(':id')
  @Roles(ROLES.OWNER)
  @Permissions(PERMISSIONS.FEEDBACK_TYPES_MANAGE)
  async update(@Validated(updateSchema) v: UpdateRequest) {
    const data = await this.types.update(v.params.id, v.body);
    return { success: true, data, message: 'Tur yangilandi' };
  }

  @Delete(':id')
  @Roles(ROLES.OWNER)
  @Permissions(PERMISSIONS.FEEDBACK_TYPES_MANAGE)
  async remove(@Validated(idSchema) v: IdRequest) {
    await this.types.softRemove(v.params.id);
    return { success: true, message: "Tur o'chirildi" };
  }
}
