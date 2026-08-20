import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiError } from '../errors/api-error.js';
import { hasAnyPermission } from '../rbac/permission.service.js';
import { PERMISSIONS_KEY } from '../decorators/index.js';
import type { AuthenticatedRequest } from '../types/authenticated-request.js';

/**
 * `middleware/requirePermission.js` + `requireAnyPermission.js` NING
 * EKVIVALENTI (ikkalasi ham OR semantikasida — birlashtirildi).
 *
 * Iyerarxiya (`PERMISSION_IMPLIES`) `hasPermission` ichida qo'llanadi.
 *
 * ⚠ BU GUARD AUTENTIFIKATSIYA QILMAYDI. U faqat AVTORIZATSIYA qarorini
 * chiqaradi va `AuthMiddleware` to'ldirgan `req.permissions` ni o'qiydi.
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const keys = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!keys || keys.length === 0) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!req.user) throw new ApiError(401, "Avtorizatsiyadan o'tilmagan");
    if (!hasAnyPermission(req.permissions, keys)) {
      throw new ApiError(403, 'Ruxsat etilmagan');
    }
    return true;
  }
}
