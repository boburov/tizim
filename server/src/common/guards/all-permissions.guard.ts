import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiError } from '../errors/api-error.js';
import { hasPermission } from '../rbac/permission.service.js';
import { PERMISSIONS_ALL_KEY } from '../decorators/index.js';
import type { AuthenticatedRequest } from '../types/authenticated-request.js';

/**
 * KETMA-KET `requirePermission(...)` LARNING EKVIVALENTI — AND semantikasi.
 *
 * Express bir nechta marshrutda ruxsatni ikki marta ketma-ket talab
 * qiladi (`system.admin_access` + `branches.create`, `users.read` +
 * `roles.update`). `PermissionsGuard` (OR) buni ifodalay OLMAYDI.
 *
 * ⚠ Ikkalasini bitta metodga qo'yish ham YECHIM EMAS — ular boshqa-boshqa
 * metadata kalitini o'qiydi, ya'ni bir-biriga xalaqit bermaydi va ikkalasi
 * ham bajariladi. Aynan shuning uchun kalit alohida
 * (`PERMISSIONS_ALL_KEY`).
 */
@Injectable()
export class AllPermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const keys = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_ALL_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!keys || keys.length === 0) return true;

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (!req.user) throw new ApiError(401, "Avtorizatsiyadan o'tilmagan");

    // HAR BIRI bo'lishi shart — bittasi yetmasa 403 (Express bilan bir xil).
    for (const key of keys) {
      if (!hasPermission(req.permissions, key)) {
        throw new ApiError(403, 'Ruxsat etilmagan');
      }
    }
    return true;
  }
}
