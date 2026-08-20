import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest } from '../types/authenticated-request.js';

/**
 * Express'dagi route qatlamini almashtiruvchi dekoratorlar.
 *
 *   requirePermission("users.read")   →  @Permissions(PERMISSIONS.USERS_READ)
 *   requireRole("owner")              →  @Roles(ROLES.OWNER)
 *   requireAnyPermission(a, b)        →  @Permissions(a, b)   (semantikasi OR)
 *   requirePermissionOrSelf(k, fn)    →  @PermissionOrSelf(k, param)
 *   req.user                          →  @CurrentUser()
 */

export const PERMISSIONS_KEY = 'permissions';
export const ROLES_KEY = 'roles';
export const PERMISSION_OR_SELF_KEY = 'permission_or_self';

/**
 * Bir nechta kalit berilsa — HAR QANDAY biri yetarli (OR).
 * Express `requirePermission(...keys)` bilan AYNAN bir xil semantika,
 * `PERMISSION_IMPLIES` iyerarxiyasi ham qo'llanadi.
 */
export const Permissions = (...keys: string[]) => SetMetadata(PERMISSIONS_KEY, keys);

/** Rol nomi YOKI roleType mos kelsa o'tadi (`requireRole` semantikasi). */
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles);

/**
 * Ruxsat bo'lsa o'tkazadi; aks holda O'QUVCHI faqat O'ZINING
 * ma'lumotini so'rasa ruxsat beradi.
 *
 * @param key     ruxsat kaliti
 * @param param   so'ralayotgan foydalanuvchi ID'si qayerdan olinadi
 * @param source  "params" (standart) yoki "query"
 */
export const PermissionOrSelf = (
  key: string,
  param: string,
  source: 'params' | 'query' = 'params',
) => SetMetadata(PERMISSION_OR_SELF_KEY, { key, param, source });

export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return data ? (req.user as Record<string, unknown> | undefined)?.[data] : req.user;
  },
);

/** Auth middleware hisoblagan filial ko'lami. */
export const BranchScopeParam = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return {
      branchId: req.branchId ?? null,
      allowedBranchIds: req.allowedBranchIds ?? [],
      canSeeAllBranches: Boolean(req.canSeeAllBranches),
      userId: req.user?.id ?? null,
    };
  },
);
