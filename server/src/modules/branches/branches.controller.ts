import { Controller, Delete, Get, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { BranchesService } from './branches.service.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { AllPermissionsGuard } from '../../common/guards/all-permissions.guard.js';
import {
  AllPermissions,
  Permissions,
  Validated,
} from '../../common/decorators/index.js';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import { hasPermission } from '../../common/rbac/permission.service.js';
import { credentialScope } from '../../common/rbac/credential-scope.js';
import { parsePagination, buildMeta } from '../../common/utils/pagination.js';
import {
  DELEGATABLE_KINDS,
  ALL_DELEGATION_MODES,
  DEFAULT_DELEGATION_MODE,
} from '../../common/constants/delegation.js';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.js';
import {
  idSchema,
  listSchema,
  createSchema,
  updateSchema,
  type IdRequest,
  type ListRequest,
  type CreateRequest,
  type UpdateRequest,
} from './branches.validators.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FILIALLAR — Express `branches.routes.js` NING TO'LIQ EKVIVALENTI (8/8).
 *
 * ⚠ E'LON TARTIBI Express bilan AYNAN bir xil: `GET /compare` va
 * `GET /delegation-options` `GET /:id` DAN OLDIN turadi — aks holda ular
 * filial ID sifatida o'qilardi va 404 berardi.
 *
 * ⚠ O'QISH RUXSATSIZ — FAQAT `GET /`: filial tanlagichi uchun HAR QANDAY
 * auth'langan foydalanuvchi o'z filiallarini ko'radi va ro'yxat
 * `allowedBranchIds` bo'yicha KESILADI. Express'da ham shunday. Shu
 * sababli xodim LOGINI standart javobda BO'LMAYDI (pastga qarang).
 *
 * ⚠ `GET /:id` bunga KIRMAYDI: u to'liq yozuvni (`delegation`,
 * `expenseApprovalThreshold`) beradi va kesilmagan edi — ruxsat va
 * ko'lam tekshiruvi `GET /:id/stats` dagidek qo'shildi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Controller('branches')
@UseGuards(PermissionsGuard)
export class BranchesController {
  constructor(private readonly branches: BranchesService) {}

  @Get()
  async list(@Validated(listSchema) v: ListRequest, @Req() req: AuthenticatedRequest) {
    const { page, limit } = parsePagination(req.query as Record<string, unknown>);

    // ── BOSHQARUVCHI LOGINI — SO'RALSA VA RUXSAT BO'LSA ──
    //
    // Ruxsat SHU YERDA tekshiriladi, servisda emas: servis "nima
    // so'ralgan" ni bajaradi, "kimga ruxsat" — HTTP qatlamining ishi.
    //
    // ⚠ `hasPermission` — xom `.includes()` EMAS: u ruxsat
    // iyerarxiyasini (`PERMISSION_IMPLIES`) hisobga oladi.
    const withManagers =
      String(req.query.withManagers) === 'true' &&
      hasPermission(req.permissions, PERMISSIONS.USERS_READ);

    // ── PAROL — QO'SHIMCHA RUXSAT VA QO'SHIMCHA KO'LAM ──
    //
    // `users.password` bo'lsa ham, servis parolni FAQAT aktyorning
    // HAQIQIY filiallari uchun qo'yadi (`credentialScope`). Ya'ni
    // `branches.view_all` bilan butun tarmoq parolini yig'ib bo'lmaydi.
    const credentials =
      withManagers && hasPermission(req.permissions, PERMISSIONS.USERS_PASSWORD)
        ? credentialScope(req)
        : null;

    const { items, total } = await this.branches.list({
      search: v.query.search,
      includeInactive: v.query.includeInactive,
      allowedBranchIds: req.allowedBranchIds,
      canSeeAllBranches: req.canSeeAllBranches,
      withManagers,
      credentials,
      page,
      limit,
    });
    return { success: true, data: items, meta: buildMeta({ page, limit, total }) };
  }

  /** `GET /:id` DAN OLDIN — aks holda "compare" filial ID deb o'qilardi. */
  @Get('compare')
  @Permissions(PERMISSIONS.BRANCHES_READ)
  async compare(@Req() req: AuthenticatedRequest) {
    const data = await this.branches.compare({
      allowedBranchIds: req.allowedBranchIds,
      canSeeAllBranches: req.canSeeAllBranches,
    });
    return { success: true, data };
  }

  /**
   * DELEGATSIYA KATALOGI — statik metama'lumot, filial ma'lumoti YO'Q.
   *
   * NEGA SERVERDAN: qaysi turga qaysi rejim mumkinligi XAVFSIZLIK
   * qoidasi (maosh turlarida `auto` yo'q). Klient o'z ro'yxatini tutsa,
   * ikkalasi vaqt o'tib ajralib ketardi va forma taqiqlangan variantni
   * ko'rsatib, server esa uni 400 bilan rad etardi.
   */
  @Get('delegation-options')
  @Permissions(PERMISSIONS.BRANCHES_READ)
  async delegationOptions() {
    const kinds = Object.entries(DELEGATABLE_KINDS).map(([kind, spec]) => ({
      kind,
      label: spec.label,
      modes: spec.modes,
      limits: spec.limits,
      direction: spec.direction,
    }));
    return {
      success: true,
      data: { kinds, allModes: ALL_DELEGATION_MODES, defaultMode: DEFAULT_DELEGATION_MODE },
    };
  }

  /**
   * ⚠ BITTA FILIAL — RO'YXATDAN FARQLI, RUXSAT VA KO'LAM BILAN.
   *
   * Ro'yxat (`GET /`) filial TANLAGICHI uchun ochiq va u faqat nom/kod
   * beradi. Bu yerda esa TO'LIQ yozuv qaytadi: `delegation` JSON va
   * `expenseApprovalThreshold` — ya'ni filialning ichki boshqaruv
   * qoidalari. Ilgari na ruxsat, na `allowedBranchIds` kesishmasi bor
   * edi: HAR QANDAY auth'langan foydalanuvchi (hatto o'quvchi) BOSHQA
   * filialning shu ma'lumotini o'qiy olardi. Endi `stats()` bilan bir
   * xil qoida.
   */
  @Get(':id')
  @Permissions(PERMISSIONS.BRANCHES_READ)
  async getById(@Validated(idSchema) v: IdRequest, @Req() req: AuthenticatedRequest) {
    const data = await this.branches.getById(v.params.id, {
      allowedBranchIds: req.allowedBranchIds,
      canSeeAllBranches: req.canSeeAllBranches,
    });
    return { success: true, data };
  }

  /**
   * Statistika filial rahbariyatining ism/loginini ham qaytaradi, shuning
   * uchun ruxsat SHART — ilgari har qanday auth'langan foydalanuvchi
   * (hatto o'quvchi) istalgan filial ko'rsatkichini o'qiy olardi.
   */
  @Get(':id/stats')
  @Permissions(PERMISSIONS.BRANCHES_READ)
  async stats(@Validated(idSchema) v: IdRequest, @Req() req: AuthenticatedRequest) {
    // KO'LAM so'rovdan uzatiladi: filial direktori BOSHQA filialning
    // ko'rsatkichlarini va rahbariyatini o'qiy olmasligi kerak.
    const data = await this.branches.stats(v.params.id, {
      allowedBranchIds: req.allowedBranchIds,
      canSeeAllBranches: req.canSeeAllBranches,
    });
    return { success: true, data };
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * YOZISH — ALOHIDA KONTROLLER, `AllPermissionsGuard` bilan.
 *
 * ⚠ IMTIYOZ OSHIRISHDAN HIMOYA. Express filial yaratish/tahrirlash/
 * o'chirishga IKKITA ruxsatni KETMA-KET talab qiladi:
 *
 *     requirePermission(SYSTEM_ADMIN_ACCESS)
 *     requirePermission(BRANCHES_CREATE)
 *
 * — ya'ni AND. Bu ATAYLAB `branches.*` ga EMAS, `system.admin_access` ga
 * ham bog'langan: aks holda filial direktori o'ziga yangi filial ochib,
 * keyin o'zini unga biriktirib, ko'lamini kengaytira olardi.
 *
 * `@Permissions(a, b)` (OR) buni ifodalay OLMAYDI — u aynan shu teshikni
 * ochib qo'yardi.
 *
 * ⚠ ESKI `requireMultiBranch` TO'SIG'I YO'Q — Express'da ham olib
 * tashlangan. Rejim BAZADAN aniqlanadi (`isMultiBranch`), ya'ni ikkinchi
 * filial ochilgan zahoti markaz o'zi ko'p filialli bo'ladi. Himoya
 * yo'qolmadi: yozish baribir `system.admin_access` talab qiladi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Controller('branches')
@UseGuards(AllPermissionsGuard)
export class BranchesWriteController {
  constructor(private readonly branches: BranchesService) {}

  @Post()
  @AllPermissions(PERMISSIONS.SYSTEM_ADMIN_ACCESS, PERMISSIONS.BRANCHES_CREATE)
  async create(
    @Validated(createSchema) v: CreateRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    // Direktor IXTIYORIY: berilsa filial bilan birga yaratiladi.
    const withDirector = Boolean(v.body?.director);

    const data = await this.branches.createWithDirector(v.body, {
      _id: req.user!._id,
      permissions: req.permissions,
    });

    return {
      success: true,
      data,
      // Xabar amalga MOS bo'lishi kerak: direktorsiz yaratilganda ham
      // "direktor yaratildi" deyilsa, ega uni qidirib yurardi.
      message: withDirector ? 'Filial va direktor yaratildi' : 'Filial yaratildi',
    };
  }

  @Patch(':id')
  @AllPermissions(PERMISSIONS.SYSTEM_ADMIN_ACCESS, PERMISSIONS.BRANCHES_UPDATE)
  async update(@Validated(updateSchema) v: UpdateRequest) {
    const data = await this.branches.update(v.params.id, v.body);
    return { success: true, data, message: 'Filial yangilandi' };
  }

  @Delete(':id')
  @AllPermissions(PERMISSIONS.SYSTEM_ADMIN_ACCESS, PERMISSIONS.BRANCHES_DELETE)
  async remove(@Validated(idSchema) v: IdRequest, @Req() req: AuthenticatedRequest) {
    await this.branches.softRemove(v.params.id, req.user);
    return { success: true, message: "Filial o'chirildi" };
  }
}
