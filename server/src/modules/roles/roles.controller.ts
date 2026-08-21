import {
  Controller,
  Delete,
  Get,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RolesService } from './roles.service.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { Permissions, Validated } from '../../common/decorators/index.js';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.js';
import {
  valueSchema,
  removeSchema,
  createSchema,
  updateSchema,
  freezeSchema,
  type ValueRequest,
  type RemoveRequest,
  type CreateRequest,
  type UpdateRequest,
  type FreezeRequest,
} from './roles.validators.js';

/**
 * Express `roles.routes.js` NING TO'LIQ EKVIVALENTI (7/7 marshrut).
 *
 * ⚠ E'LON TARTIBI MUHIM va Express bilan AYNAN bir xil:
 *   • `GET /matrix` — `GET /:value` DAN OLDIN, aks holda "matrix" rol
 *     value'si sifatida ushlanib qolardi;
 *   • `PATCH /:value/freeze` — `PATCH /:value` DAN OLDIN.
 * NestJS marshrutlarni e'lon tartibida ro'yxatdan o'tkazadi (ostida
 * o'sha Express router turadi), ya'ni tartibni buzish JIMGINA noto'g'ri
 * handler'ni chaqirardi.
 *
 * Autentifikatsiya bu yerda KO'RINMAYDI — u `RolesModule.configure()` da
 * middleware sifatida ulanadi, chunki faqat middleware ALS kontekstini
 * butun so'rov bo'ylab ocha oladi.
 */
@Controller('roles')
@UseGuards(PermissionsGuard)
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  /** Ruxsatlar matritsasi (module × action). */
  @Get('matrix')
  @Permissions(PERMISSIONS.ROLES_READ)
  async matrix() {
    return { success: true, data: await this.roles.getMatrix() };
  }

  @Get()
  @Permissions(PERMISSIONS.ROLES_READ)
  async list() {
    return { success: true, data: await this.roles.list() };
  }

  @Get(':value')
  @Permissions(PERMISSIONS.ROLES_READ)
  async getByValue(@Validated(valueSchema) v: ValueRequest) {
    return { success: true, data: await this.roles.getByValue(v.params.value) };
  }

  /** Express `res.status(201)` — NestJS standarti ham POST uchun 201. */
  @Post()
  @Permissions(PERMISSIONS.ROLES_CREATE)
  async create(
    @Validated(createSchema) v: CreateRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.roles.create(v.body, req.user, req.permissions);
    return { success: true, data, message: 'Rol yaratildi' };
  }

  /**
   * MUZLATISH/MUZDAN CHIQARISH — `PATCH /:value` DAN OLDIN e'lon qilingan.
   */
  @Patch(':value/freeze')
  @Permissions(PERMISSIONS.ROLES_UPDATE)
  async setFrozen(
    @Validated(freezeSchema) v: FreezeRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.roles.setFrozen(v.params.value, v.body, req.user!);
    return {
      success: true,
      data,
      message: data.isFrozen ? 'Rol muzlatildi' : 'Rol muzdan chiqarildi',
    };
  }

  @Patch(':value')
  @Permissions(PERMISSIONS.ROLES_UPDATE)
  async update(
    @Validated(updateSchema) v: UpdateRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.roles.update(
      v.params.value,
      v.body,
      req.user,
      req.permissions,
    );
    return { success: true, data, message: 'Rol yangilandi' };
  }

  @Delete(':value')
  @Permissions(PERMISSIONS.ROLES_DELETE)
  async remove(@Validated(removeSchema) v: RemoveRequest) {
    const data = await this.roles.remove(v.params.value, {
      migrateTo: v.query.migrateTo,
    });
    return { success: true, data, message: "Rol o'chirildi" };
  }
}
