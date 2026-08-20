import { Controller, Get, UseGuards } from '@nestjs/common';
import { RolesService } from './roles.service.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { Permissions, Validated } from '../../common/decorators/index.js';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import { valueSchema, type ValueRequest } from './roles.validators.js';

/**
 * Express `roles.routes.js` ning O'QISH yo'llari.
 *
 *   GET /api/roles         ← requireAuth + requirePermission(ROLES_READ)
 *   GET /api/roles/:value   ← + validate(valueSchema)
 *
 * ⚠ `GET /matrix` va BARCHA mutatsiyalar Express'da qoladi (Faza 2).
 *
 * Autentifikatsiya bu yerda KO'RINMAYDI — u `RolesModule.configure()`
 * da middleware sifatida ulanadi, chunki faqat middleware ALS
 * kontekstini butun so'rov bo'ylab ocha oladi.
 */
@Controller('roles')
@UseGuards(PermissionsGuard)
export class RolesController {
  constructor(private readonly roles: RolesService) {}

  @Get()
  @Permissions(PERMISSIONS.ROLES_READ)
  async list() {
    return { success: true, data: await this.roles.list() };
  }

  @Get(':value')
  @Permissions(PERMISSIONS.ROLES_READ)
  async getByValue(@Validated(valueSchema) req: ValueRequest) {
    return { success: true, data: await this.roles.getByValue(req.params.value) };
  }
}
