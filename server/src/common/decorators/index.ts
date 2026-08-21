import { SetMetadata, createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { ZodSchema } from 'zod';
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
export const PERMISSIONS_ALL_KEY = 'permissions_all';
export const ROLES_KEY = 'roles';
export const PERMISSION_OR_SELF_KEY = 'permission_or_self';

/**
 * Bir nechta kalit berilsa — HAR QANDAY biri yetarli (OR).
 * Express `requirePermission(...keys)` bilan AYNAN bir xil semantika,
 * `PERMISSION_IMPLIES` iyerarxiyasi ham qo'llanadi.
 */
export const Permissions = (...keys: string[]) => SetMetadata(PERMISSIONS_KEY, keys);

/**
 * HAR BIR kalit BO'LISHI SHART (AND).
 *
 * ⚠ NEGA ALOHIDA DEKORATOR KERAK: Express ba'zi marshrutlarga
 * `requirePermission(...)` ni IKKI MARTA ketma-ket ulaydi —
 *
 *     router.post("/", requireAuth,
 *       requirePermission(SYSTEM_ADMIN_ACCESS),
 *       requirePermission(BRANCHES_CREATE), ...)
 *
 * — ya'ni semantika AND. `@Permissions(a, b)` esa OR beradi va bu
 * chegarani JIMGINA yumshatardi: `branches.create` bor-u
 * `system.admin_access` yo'q filial direktori o'tib ketardi va o'ziga
 * yangi filial ochib, ko'lamini kengaytira olardi.
 *
 * `PERMISSION_IMPLIES` iyerarxiyasi har bir kalitga alohida qo'llanadi —
 * `@Permissions` bilan bir xil.
 */
export const AllPermissions = (...keys: string[]) =>
  SetMetadata(PERMISSIONS_ALL_KEY, keys);

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

/**
 * ZOD VALIDATSIYASI — Express `validate()` BILAN AYNAN BIR XIL SHAKLDA.
 *
 * Express sxemalari butun so'rovni bitta obyekt sifatida oladi:
 *     z.object({ body: ..., query: ..., params: ... })
 *
 * Shu sababli bu dekorator ham `{ body, query, params }` ni yig'ib beradi.
 * NEGA MUHIM: xato yo'li (`details[].path`) shundagina Express bilan bir
 * xil chiqadi — masalan `"params.value"`. Agar faqat bitta bo'lak
 * tekshirilsa yo'l `"value"` bo'lib qolardi va bu KLIENT SHARTNOMASINI
 * jimgina o'zgartirardi.
 *
 * `ZodError` ATAYLAB tutilmaydi — uni `AllExceptionsFilter` bir joyda
 * Express formatiga soladi.
 */
/**
 * ⚠ SXEMA O'RAMDA (`{ schema }`) UZATILADI — TO'G'RIDAN-TO'G'RI EMAS.
 *
 * NestJS `createParamDecorator` birinchi argument DATA'mi yoki PIPE'mi
 * ekanini `transform` metodi bor-yo'qligiga qarab hal qiladi. Zod
 * sxemalarida esa `.transform()` BOR — natijada Nest sxemani PIPE deb
 * o'ylab, factory'ga `data: undefined` uzatardi va so'rov
 * "Cannot read properties of undefined (reading 'parse')" bilan 500
 * berardi.
 *
 * Oddiy obyektga o'rash bu to'qnashuvni butunlay yo'q qiladi.
 * (Bu tuzoq zod + NestJS ishlatadigan HAR QANDAY joyda takrorlanadi.)
 */
const ValidatedFactory = createParamDecorator(
  (carrier: { schema: ZodSchema }, ctx: ExecutionContext) => {
    const req = ctx.switchToHttp().getRequest<{
      body?: unknown;
      query?: unknown;
      params?: unknown;
    }>();
    return carrier.schema.parse({
      body: req.body,
      query: req.query,
      params: req.params,
    });
  },
);

export const Validated = (schema: ZodSchema) => ValidatedFactory({ schema });
