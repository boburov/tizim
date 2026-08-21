import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiError } from '../errors/api-error.js';
import { hasPermission } from '../rbac/permission.service.js';
import { PERMISSION_OR_SELF_KEY } from '../decorators/index.js';
import { ROLES, ROLE_TYPES } from '../constants/permissions.js';
import type { AuthenticatedRequest } from '../types/authenticated-request.js';

/**
 * `middleware/requirePermissionOrSelf.js` NING KO'CHIRMASI.
 *
 * Ruxsat bo'lsa o'tkazadi (owner/ruxsatli xodim); aks holda o'quvchi
 * faqat O'ZINING ma'lumotini so'rasa ruxsat beradi.
 *
 * Rol NOMI emas, `roleType` tekshiriladi — custom "o'quvchi tipidagi"
 * rol ham o'z ma'lumotini ko'ra olsin.
 */
@Injectable()
export class PermissionOrSelfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const meta = this.reflector.getAllAndOverride<{
      key: string;
      param: string;
      source: 'params' | 'query';
    }>(PERMISSION_OR_SELF_KEY, [context.getHandler(), context.getClass()]);
    if (!meta) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!req.user) throw new ApiError(401, "Avtorizatsiyadan o'tilmagan");

    if (hasPermission(req.permissions, meta.key)) return true;

    if (
      req.role?.roleType === ROLE_TYPES.STUDENT ||
      req.user.role === ROLES.STUDENT
    ) {
      const bag = meta.source === 'query' ? req.query : req.params;
      const want = String((bag as Record<string, unknown>)?.[meta.param] || '');
      if (want && want === String(req.user.id)) return true;
    }

    throw new ApiError(403, 'Ruxsat etilmagan');
  }
}
