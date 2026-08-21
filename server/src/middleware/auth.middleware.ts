import { Inject, Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';
import { ApiError } from '../common/errors/api-error.js';
import { verifyAccess, type JwtSettings } from '../common/utils/jwt.js';
import { PermissionService } from '../common/rbac/permission.service.js';
import {
  BranchAccessService,
  resolveRoleForBranch,
} from '../common/rbac/branch-access.service.js';
import { assertBranchIntent } from '../common/rbac/branch-intent.js';
import { runWithBranchContext } from '../common/als/branch-context.js';
import type { AuthenticatedRequest } from '../common/types/authenticated-request.js';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../config/env.validation.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * `server/src/middleware/auth.js` (`requireAuth`) NING KO'CHIRMASI.
 *
 * ⚠⚠ NEGA GUARD EMAS, MIDDLEWARE ⚠⚠
 *
 * NestJS Guard `boolean` qaytaradi — u keyingi bajarilishni O'RAY OLMAYDI.
 * Filial ko'lami esa AsyncLocalStorage'da yashaydi va u `als.run(ctx, next)`
 * bilan OCHILISHI shart. Guard'da bu imkonsiz.
 *
 * Agar kontekst ochilmasa `branchFilter()` bo'sh obyekt qaytaradi — bu
 * "filtr yo'q" degani, ya'ni BARCHA FILIAL ma'lumoti 200 status bilan
 * qaytadi. Xato ham chiqmaydi, log ham qolmaydi.
 *
 * Middleware `next()` ni o'rab beradi va Express'dagi xatti-harakat
 * AYNAN saqlanadi.
 *
 * Guard'lar esa faqat AVTORIZATSIYA qaroriga javob beradi (`@Roles`,
 * `@Permissions`) va shu middleware to'ldirgan `req.user` /
 * `req.permissions` ni O'QIYDI.
 *
 * ⚠⚠ BESH QADAMNING TARTIBI YUK KO'TARADI — O'ZGARTIRMANG ⚠⚠
 * Ko'lam ASOSIY rol ruxsatlari bilan hisoblanadi; filialga xos rol undan
 * KEYIN qo'llanadi. Teskarisi halqa hosil qiladi: ko'lam uchun ruxsat
 * kerak, ruxsat uchun ko'lam kerak.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class AuthMiddleware implements NestMiddleware {
  private readonly jwt: JwtSettings;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly permissions: PermissionService,
    private readonly branchAccess: BranchAccessService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.jwt = {
      accessSecret: config.get('JWT_ACCESS_SECRET', { infer: true }),
      refreshSecret: config.get('JWT_REFRESH_SECRET', { infer: true }),
      accessTtl: config.get('JWT_ACCESS_TTL', { infer: true }),
      refreshTtl: config.get('JWT_REFRESH_TTL', { infer: true }),
    };
  }

  async use(req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> {
    try {
      const header = req.headers.authorization || '';
      const token = header.startsWith('Bearer ') ? header.slice(7) : null;
      if (!token) throw new ApiError(401, "Avtorizatsiyadan o'tilmagan");

      let payload;
      try {
        payload = verifyAccess(token, this.jwt);
      } catch {
        throw new ApiError(401, "Token yaroqsiz yoki muddati o'tgan");
      }

      // ⚠ `branchAssignments` ATAYLAB include qilinadi: ko'lam va
      // filialga xos rol shu ro'yxatni aylanadi. U kelmasa har bir
      // xodim faqat o'z "home" filialini ko'rib qolardi — ya'ni ko'p
      // filialli biriktirish JIMGINA ishlamay qo'yardi.
      const found = await this.prisma.user.findUnique({
        where: { id: String(payload.sub) },
        include: { branchAssignments: { select: { branchId: true, role: true } } },
      });
      if (!found || !found.isActive || found.isDeleted) {
        throw new ApiError(401, 'Foydalanuvchi topilmadi');
      }

      // `_id` taxallusi: ko'chirilgan servislar hali `req.user._id` ishlatadi.
      const user = { ...found, _id: found.id } as unknown as AuthenticatedRequest['user'];

      // 1-BOSQICH: asosiy (global) rol.
      const baseRole = await this.permissions.resolveRole(found.role);

      // MUZLATISH: rol muzlatilgan bo'lsa MAVJUD sessiya ham darhol
      // uziladi. 403 EMAS, 401: client interceptor'i login sahifasiga oladi.
      if (baseRole.isFrozen) {
        throw new ApiError(
          401,
          "Sizning rolingiz muzlatilgan. Administratorga murojaat qiling",
        );
      }

      // 2-BOSQICH: FILIAL KO'LAMI (asosiy rol ruxsatlari bilan).
      const scope = await this.branchAccess.resolveBranchScope({
        user: found as never,
        permissions: baseRole.permissions,
        requestedBranchId: req.headers['x-branch-id']
          ? String(req.headers['x-branch-id']).trim()
          : null,
      });

      // 3-BOSQICH: FILIAL NIYATI — ko'lam hal qilingandan KEYIN, lekin
      // hech narsa yozilishidan OLDIN.
      assertBranchIntent(req, scope);

      // 4-BOSQICH: FILIALGA XOS ROL. Bir odam A filialda "direktor",
      // B filialda "o'qituvchi" bo'lishi mumkin — ruxsatlar ham
      // o'shanikidan olinadi.
      const branchRoleValue = resolveRoleForBranch(found as never, scope.branchId);
      let effectiveRole = baseRole;

      if (branchRoleValue && branchRoleValue !== found.role) {
        const branchRole = await this.permissions.resolveRole(branchRoleValue);
        // Filialga xos rol muzlatilgan bo'lishi mumkin — o'sha filialda
        // ishlay olmaydi (lekin boshqasida ishlashi mumkin) → 403.
        if (branchRole.isFrozen) {
          throw new ApiError(
            403,
            "Bu filialdagi rolingiz muzlatilgan. Administratorga murojaat qiling",
          );
        }
        effectiveRole = branchRole;
      }

      req.user = user;
      req.role = effectiveRole;
      req.permissions = effectiveRole.permissions;
      req.baseRole = baseRole;
      req.branchId = scope.branchId;
      req.allowedBranchIds = scope.allowedBranchIds;
      req.canSeeAllBranches = scope.canSeeAllBranches;
      req.branchRole = branchRoleValue;

      // 5-BOSQICH: ALS konteksti. Shundan keyingi BARCHA async chaqiruvlar
      // `branchFilter()` orqali ko'lamni ko'radi.
      runWithBranchContext(
        {
          branchId: scope.branchId,
          allowedBranchIds: scope.allowedBranchIds,
          canSeeAllBranches: scope.canSeeAllBranches,
          userId: String(found.id),
        },
        () => next(),
      );
    } catch (err) {
      next(err);
    }
  }
}
