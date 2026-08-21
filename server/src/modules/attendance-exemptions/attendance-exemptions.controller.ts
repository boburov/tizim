import {
  Controller, Delete, Get, HttpCode, Param, Patch, Post, Req, UseGuards,
} from '@nestjs/common';
import { AttendanceExemptionsService } from './attendance-exemptions.service.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Permissions, Roles, Validated } from '../../common/decorators/index.js';
import { PERMISSIONS, ROLES } from '../../common/constants/permissions.js';
import { parsePagination, buildMeta } from '../../common/utils/pagination.js';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.js';
import {
  listSchema, createSchema, updateSchema, idSchema,
  type ListRequest, type CreateRequest, type UpdateRequest, type IdRequest,
} from './attendance-exemptions.validators.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DAVOMATDAN OZOD DAVRLARI — Express `attendanceExemptions.routes.js`
 * EKVIVALENTI (4/4).
 *
 * ⚠ QO'RIQCHI TARTIBI EXPRESS BILAN AYNAN BIR XIL BO'LISHI SHART:
 *   requireAuth → requireRole(...) → requirePermission(...)
 *
 * NestJS `@UseGuards(A, B)` ni E'LON TARTIBIDA ishlatadi, shuning uchun
 * `RolesGuard` `PermissionsGuard` DAN OLDIN yoziladi. Tartib almashsa
 * XATO KODI o'zgarardi: rol ham, ruxsat ham yo'q foydalanuvchi Express'da
 * rol xatosini oladi, teskarisida esa ruxsat xatosini — ya'ni `message`
 * boshqacha bo'lardi.
 *
 * ⚠ CREATE/PATCH/DELETE: owner — barchasi; teacher — faqat O'Z guruhidagi
 * o'quvchi uchun (EGALIK SERVIS QATLAMIDA tekshiriladi). Teacher'da
 * `ATTENDANCE_MANAGE` yo'q, shuning uchun `ATTENDANCE_RECORD` bilan gate
 * qilinadi (teacher davomatni belgilay olgani kabi ozod davrini ham
 * qo'ya oladi).
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Controller('attendance-exemptions')
export class AttendanceExemptionsController {
  constructor(private readonly exemptions: AttendanceExemptionsService) {}

  @Get()
  @UseGuards(PermissionsGuard)
  @Permissions(PERMISSIONS.ATTENDANCE_READ)
  async list(
    @Validated(listSchema) v: ListRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const { page, limit } = parsePagination(v.query as Record<string, unknown>);
    const { items, total } = await this.exemptions.list(
      {
        studentId: v.query.studentId,
        isActive: v.query.isActive,
        page,
        limit,
      },
      req.user,
    );
    return { success: true, data: items, meta: buildMeta({ page, limit, total }) };
  }

  @Post()
  @HttpCode(201)
  @UseGuards(RolesGuard, PermissionsGuard)
  @Roles(ROLES.OWNER, ROLES.TEACHER)
  @Permissions(PERMISSIONS.ATTENDANCE_RECORD)
  async create(
    @Validated(createSchema) v: CreateRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.exemptions.create(v.body as never, req.user);
    return {
      success: true,
      data,
      message: 'Davomatdan ozod davri yaratildi',
    };
  }

  /** ⚠ `@HttpCode(200)` — Express `res.json(...)`, NestJS standarti emas. */
  @Patch(':id')
  @HttpCode(200)
  @UseGuards(RolesGuard, PermissionsGuard)
  @Roles(ROLES.OWNER, ROLES.TEACHER)
  @Permissions(PERMISSIONS.ATTENDANCE_RECORD)
  async update(
    @Param('id') id: string,
    @Validated(updateSchema) v: UpdateRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.exemptions.update(id, v.body as never, req.user);
    return { success: true, data, message: 'Saqlandi' };
  }

  @Delete(':id')
  @HttpCode(200)
  @UseGuards(RolesGuard, PermissionsGuard)
  @Roles(ROLES.OWNER, ROLES.TEACHER)
  @Permissions(PERMISSIONS.ATTENDANCE_RECORD)
  async remove(
    @Param('id') id: string,
    @Validated(idSchema) _v: IdRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.exemptions.remove(id, req.user);
    return { success: true, message: "Davomatdan ozod davri o'chirildi" };
  }
}
