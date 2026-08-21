import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiError } from '../errors/api-error.js';
import { hasPermission } from '../rbac/permission.service.js';
import { ROLES_KEY } from '../decorators/index.js';
import { PERMISSIONS, ROLES } from '../constants/permissions.js';
import type { AuthenticatedRequest } from '../types/authenticated-request.js';

/**
 * `middleware/requireRole.js` NING KO'CHIRMASI.
 *
 * Rollar DINAMIK, shuning uchun ikkita kengaytma bor — ikkalasi ham
 * saqlanadi, aks holda custom rollar hard-block bo'lardi:
 *
 *  1) roleType bo'yicha moslik: `@Roles("teacher")` custom "Katta
 *     o'qituvchi" rolini ham o'tkazadi, agar uning roleType'i
 *     "teacher" bo'lsa.
 *  2) `@Roles("owner")` — `system.admin_access` ruxsatiga ega custom rol
 *     ham o'tadi.
 *
 * ⚠ (2) ni "qattiqlashtirish" vasvasasiga berilmang: u ATAYLAB shunday
 * va 32 ta owner-only marshrutga ta'sir qiladi. Parol maxfiyligi bu
 * yerda emas, `credential-scope.ts` da hal qilinadi.
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!roles || roles.length === 0) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!req.user) throw new ApiError(401, "Avtorizatsiyadan o'tilmagan");

    // To'g'ridan-to'g'ri rol nomi mos keldi (built-in holat).
    if (roles.includes(req.user.role)) return true;

    // roleType bo'yicha moslik: custom rol built-in rol o'rnini bosa oladi.
    const roleType = req.role?.roleType;
    if (roleType && roles.includes(roleType)) return true;

    // Owner-only marshrutlar: `system.admin_access` bo'lgan rol o'tadi.
    if (
      roles.includes(ROLES.OWNER) &&
      hasPermission(req.permissions, PERMISSIONS.SYSTEM_ADMIN_ACCESS)
    ) {
      return true;
    }

    throw new ApiError(403, 'Ruxsat etilmagan');
  }
}
