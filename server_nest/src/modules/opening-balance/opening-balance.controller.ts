import { Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { Inject } from '@nestjs/common';
import { OpeningBalanceService } from './opening-balance.service.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Permissions, Roles, Validated } from '../../common/decorators/index.js';
import { PERMISSIONS, ROLES } from '../../common/constants/permissions.js';
import { ApiError } from '../../common/errors/api-error.js';
import { assertTargetInScope } from '../../common/rbac/branch-access.service.js';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.js';
import {
  createOpeningSchema,
  listOpeningSchema,
  type CreateOpeningRequest,
  type ListOpeningRequest,
} from './opening-balance.validators.js';

/**
 * Express `openingBalance.routes.js` — 3/3 marshrut.
 *
 * ── NEGA ALOHIDA RUXSAT (`finance.opening_balance`) ──
 *
 * Yozuv O'ZGARMAS: bir marta kiritilgach uni tahrirlash ham, o'chirish
 * ham mumkin emas (unique + immutable). Xato kiritilgan summani faqat
 * korreksiya tranzaksiyasi bilan tuzatib bo'ladi. Shuning uchun u umumiy
 * `finance.manage` ga EMAS, alohida kalitga bog'langan — owner uni
 * istagan roldan alohida olib qo'ya oladi.
 */
@Controller('opening-balance')
@UseGuards(PermissionsGuard)
export class OpeningBalanceController {
  constructor(
    private readonly opening: OpeningBalanceService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  /**
   * Boshlang'ich qoldiqni QO'LDA kiritish.
   *
   * Ikkinchi marta yuborilsa `duplicate` qaytadi va PUL IKKI MARTA
   * YOZILMAYDI (`userId` bo'yicha unique indeks).
   */
  @Post()
  @HttpCode(201)
  @Permissions(PERMISSIONS.FINANCE_OPENING_BALANCE)
  async create(
    @Validated(createOpeningSchema) v: CreateOpeningRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    /**
     * ⚠ `branchAssignments` ATAYLAB yuklanadi: `assertTargetInScope`
     * odamning filiallarini `homeBranchId` VA `branchAssignments[]` dan
     * yig'adi. Prisma relation'ni so'ralmasa bermaydi — unutilsa
     * qo'shimcha filialga biriktirilgan odam "begona" bo'lib ko'rinardi
     * (fail-closed regressiya).
     */
    const user = await this.prisma.user.findUnique({
      where: { id: String(v.body.user) },
      select: {
        id: true,
        role: true,
        homeBranchId: true,
        enrolledAt: true,
        branchAssignments: { select: { branchId: true } },
      },
    });
    if (!user) throw new ApiError(404, 'Foydalanuvchi topilmadi');

    /**
     * ⚠ FILIAL CHEGARASI: bu marshrut owner-only EMAS, shuning uchun
     * boshqa filial odamiga qarz/avans yozib qo'yish TO'SILADI. Yozuv
     * O'ZGARMAS — noto'g'ri filialga tushsa uni faqat korreksiya bilan
     * tuzatib bo'lardi.
     */
    assertTargetInScope(req.allowedBranchIds, req.canSeeAllBranches, user as never);

    // Rol UCHTA guruhga keltiriladi: o'quvchi / o'qituvchi / qolgan
    // hammasi (direktor, administrator, buxgalter... — "staff" hisobida).
    const role =
      user.role === ROLES.STUDENT || user.role === ROLES.TEACHER
        ? user.role
        : 'staff';

    const result = await this.opening.create(
      {
        user: user.id,
        role,
        amount: v.body.amount as number,
        group: v.body.group || null,
        branchId: user.homeBranchId || null,
        joinedAt: (user as any).enrolledAt || null,
        note: v.body.note || '',
      },
      { currentUser: req.user },
    );

    if (result.status === 'duplicate') {
      throw new ApiError(409, "Bu odamga boshlang'ich qoldiq allaqachon kiritilgan");
    }

    return {
      success: true,
      data: result.opening,
      message: "Boshlang'ich qoldiq kiritildi",
    };
  }

  @Get()
  @Permissions(PERMISSIONS.FINANCE_OPENING_BALANCE)
  async list(@Validated(listOpeningSchema) v: ListOpeningRequest) {
    const { rows, total, page, limit } = await this.opening.list({
      page: v.query.page || 1,
      limit: v.query.limit || 50,
      pendingOnly: Boolean(v.query.pendingOnly),
    });
    // ⚠ `meta` OCHIQ quriladi (`buildMeta` EMAS) — Express aynan shu uch
    // maydonni yuboradi, `pages` YO'Q.
    return { success: true, data: rows, meta: { page, limit, total } };
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * `POST /opening-balance/repair` — ALOHIDA KONTROLLER (OWNER-ONLY).
 *
 * ⚠ BU AMAL PUL YOZADI. Materializatsiyasi yiqilganlarni qayta urinadi va
 * BUTUN MARKAZ bo'yicha ishlaydi — noto'g'ri paytda bosilsa qayta
 * hisoblab yuboradi. Shuning uchun u kundalik `finance.opening_balance`
 * ruxsatiga EMAS, ROLGA (owner) bog'langan.
 *
 * Alohida kontroller: `OpeningBalanceController` sinf darajasida
 * `PermissionsGuard` bilan qoplangan; ikki xil avtorizatsiya qoidasini
 * bir sinfda aralashtirish "qaysi qo'riqchi qaysi metodga" degan savolni
 * tug'dirardi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Controller('opening-balance')
@UseGuards(RolesGuard)
export class OpeningBalanceRepairController {
  constructor(private readonly opening: OpeningBalanceService) {}

  @Post('repair')
  @HttpCode(200)
  @Roles(ROLES.OWNER)
  async repair(@Req() req: AuthenticatedRequest) {
    const result = await this.opening.repairPending({ currentUser: req.user });
    return {
      success: true,
      data: result,
      message: `${result.repaired} ta yozuv tuzatildi`,
    };
  }
}
