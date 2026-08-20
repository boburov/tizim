import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { Permissions, Validated } from '../../common/decorators/index.js';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import { credentialScope } from '../../common/rbac/credential-scope.js';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.js';
import { idSchema, type IdRequest } from './users.validators.js';

/**
 * Express `users.routes.js` dan BITTA yo'l (Faza 2.2 isboti):
 *
 *   GET /api/users/:id/password
 *     ← requireAuth + requirePermission(USERS_PASSWORD) + validate(idSchema)
 */
@Controller('users')
@UseGuards(PermissionsGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get(':id/password')
  @Permissions(PERMISSIONS.USERS_PASSWORD)
  async getPassword(
    @Validated(idSchema) v: IdRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    // Filial ko'lami `req` da (auth middleware o'rnatadi), lekin parol
    // uchun u TORAYTIRILADI — `credentialScope` izohiga qarang.
    const data = await this.users.getPassword(v.params.id, credentialScope(req));
    return { success: true, data };
  }
}
