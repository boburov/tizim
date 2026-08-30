import { Controller, Delete, Get, HttpCode, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { ArchiveReasonsService } from './archive-reasons.service.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Permissions, Roles, Validated } from '../../common/decorators/index.js';
import { PERMISSIONS, ROLES } from '../../common/constants/permissions.js';
import { parsePagination, buildMeta } from '../../common/utils/pagination.js';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.js';
import {
  idSchema, listSchema, reportSchema, createSchema, updateSchema,
  type IdRequest, type ListRequest, type ReportRequest,
  type CreateRequest, type UpdateRequest,
} from './archive-reasons.validators.js';

/**
 * ARXIVLASH SABABLARI — Express `archiveReasons.routes.js` EKVIVALENTI (6/6).
 *
 * ⚠⚠ E'LON TARTIBI: `GET /report` `GET /:id` DAN OLDIN turishi SHART.
 * Aks holda "report" sabab ID'si deb o'qilardi va hisobot 404 berardi —
 * bundan ham yomoni, `/report` OWNER roli ostida, `/:id` esa ochiq,
 * ya'ni to'siq JIMGINA yo'qolardi.
 *
 * ⚠ O'QISH RUXSATSIZ: arxivlash modalidagi sabab `<select>` i uchun.
 * ⚠ YOZISH ROL **VA** RUXSAT (AND).
 */
@Controller('archive-reasons')
@UseGuards(PermissionsGuard, RolesGuard)
export class ArchiveReasonsController {
  constructor(private readonly reasons: ArchiveReasonsService) {}

  @Get()
  async list(@Validated(listSchema) v: ListRequest, @Req() req: AuthenticatedRequest) {
    const { page, limit } = parsePagination(req.query as Record<string, unknown>);
    const { items, total } = await this.reasons.list({
      search: v.query.search,
      includeInactive: v.query.includeInactive,
      page,
      limit,
    });
    return { success: true, data: items, meta: buildMeta({ page, limit, total }) };
  }

  /** ⚠ `GET /:id` DAN OLDIN — yuqoridagi izohga qarang. */
  @Get('report')
  @Roles(ROLES.OWNER)
  async report(@Validated(reportSchema) v: ReportRequest) {
    const data = await this.reasons.report({
      from: v.query.from,
      to: v.query.to,
      action: v.query.action,
    });
    return { success: true, data };
  }

  @Get(':id')
  async getById(@Validated(idSchema) v: IdRequest) {
    return { success: true, data: await this.reasons.getById(v.params.id) };
  }

  @Post()
  @HttpCode(201)
  @Permissions(PERMISSIONS.ARCHIVE_REASONS_MANAGE)
  async create(@Validated(createSchema) v: CreateRequest, @Req() req: AuthenticatedRequest) {
    const data = await this.reasons.create(v.body, req.user);
    return { success: true, data, message: "Sabab qo'shildi" };
  }

  @Patch(':id')
  @Permissions(PERMISSIONS.ARCHIVE_REASONS_MANAGE)
  async update(@Validated(updateSchema) v: UpdateRequest) {
    const data = await this.reasons.update(v.params.id, v.body);
    return { success: true, data, message: 'Saqlandi' };
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.ARCHIVE_REASONS_MANAGE)
  async remove(@Validated(idSchema) v: IdRequest) {
    await this.reasons.softRemove(v.params.id);
    return { success: true, message: "O'chirildi" };
  }
}
