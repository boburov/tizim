import { Controller, Get, Patch, Req, UseGuards } from '@nestjs/common';
import { UsersService } from './users.service.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import {
  AllPermissions,
  Permissions,
  Validated,
} from '../../common/decorators/index.js';
import { AllPermissionsGuard } from '../../common/guards/all-permissions.guard.js';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import { credentialScope } from '../../common/rbac/credential-scope.js';
import { parsePagination, buildMeta } from '../../common/utils/pagination.js';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.js';
import {
  idSchema,
  listSchema,
  checkAvailabilitySchema,
  updateSchema,
  setPasswordSchema,
  setRoleSchema,
  setBranchesSchema,
  type IdRequest,
  type ListRequest,
  type CheckAvailabilityRequest,
  type UpdateRequest,
  type SetPasswordRequest,
  type SetRoleRequest,
  type SetBranchesRequest,
} from './users.validators.js';

/**
 * Express `users.routes.js` — FAZA 2.5a da 14 marshrutdan 10 tasi.
 *
 * ⚠ E'LON TARTIBI Express bilan AYNAN bir xil bo'lishi SHART. Aniq
 * yo'llar `/:id` DAN OLDIN turadi, aks holda `/:id` ularni yutib
 * yuborardi va javob "Foydalanuvchi topilmadi" (404) bo'lardi:
 *   PATCH /:id/branches → PATCH /:id dan oldin
 *   GET   /staff-stats, /check-availability → GET /:id dan oldin
 *
 * ⚠ HALI KO'CHIRILMAGAN (moliya/tasdiq modullariga tayanadi — servis
 * izohiga qarang): `POST /staff`, `DELETE /:id`, `POST /:id/restore`,
 * `DELETE /:id/permanent`. Ular Express'da qoladi.
 *
 * ⚠ IKKI RUXSAT BIRDAN: Express `PATCH /:id/branches` ga
 * `requirePermission(USERS_READ)` VA `requirePermission(ROLES_UPDATE)`
 * ni KETMA-KET ulaydi — ya'ni semantika AND. `@Permissions(a, b)` esa OR.
 * Shuning uchun u `@AllPermissions(...)` bilan alohida kontrollerda
 * (fayl oxiriga qarang).
 */
@Controller('users')
@UseGuards(PermissionsGuard)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // ───────────────────────── ANIQ YO'LLAR (`/:id` DAN OLDIN) ────────────

  /**
   * XODIMLAR statistikasi (rol kesimida).
   *
   * Ruxsat `GET /` bilan AYNAN bir xil: kartochkalar va ro'yxat bir
   * vaqtda ko'rinishi kerak, aks holda biri 403 bo'lib sahifa yarim
   * bo'sh chiqardi.
   */
  @Get('staff-stats')
  @Permissions(PERMISSIONS.USERS_READ)
  async staffStats() {
    return { success: true, data: await this.users.staffStats() };
  }

  /**
   * Telefon/login bandligini OLDINDAN tekshirish.
   *
   * Ruxsat: odam yarata oladigan xodim (u allaqachon ro'yxatni ko'radi,
   * ya'ni yangi ma'lumot oshkor bo'lmaydi — javob faqat "band/bo'sh").
   */
  @Get('check-availability')
  @Permissions(PERMISSIONS.USERS_READ)
  async checkAvailability(@Validated(checkAvailabilitySchema) v: CheckAvailabilityRequest) {
    const data = await this.users.checkAvailability({
      username: v.query.username,
      excludeId: v.query.excludeId,
    });
    return { success: true, data };
  }

  @Get()
  @Permissions(PERMISSIONS.USERS_READ)
  async list(@Validated(listSchema) v: ListRequest) {
    const { page, limit } = parsePagination(v.query as Record<string, unknown>);
    // Holat: yangi `status` USTUN; eski `archived` bilan ham mos.
    const status =
      v.query.status ||
      (v.query.archived === '1' || v.query.archived === 'true' ? 'archived' : 'active');
    const { items, total } = await this.users.list({
      role: v.query.role,
      search: v.query.search,
      staff: v.query.staff === '1' || v.query.staff === 'true',
      status,
      sort: v.query.sort,
      order: v.query.order,
      page,
      limit,
    });
    return { success: true, data: items, meta: buildMeta({ page, limit, total }) };
  }

  // ───────────────────────── `/:id` YO'LLARI ────────────────────────────

  @Get(':id')
  @Permissions(PERMISSIONS.USERS_READ)
  async getById(@Validated(idSchema) v: IdRequest) {
    return { success: true, data: await this.users.getProfile(v.params.id) };
  }

  @Get(':id/group-history')
  @Permissions(PERMISSIONS.USERS_READ)
  async groupHistory(@Validated(idSchema) v: IdRequest, @Req() req: AuthenticatedRequest) {
    const { page, limit } = parsePagination(req.query as Record<string, unknown>);
    const { items, total } = await this.users.studentHistory(v.params.id, { page, limit });
    return { success: true, data: items, meta: buildMeta({ page, limit, total }) };
  }

  /**
   * PAROL: ko'rish va almashtirish.
   *
   * FILIAL CHEGARASI eng qattiq shu yerda: servis uzatilgan ko'lamga
   * ISHONMAYDI va aktyorning haqiqiy filiallarini o'zi o'qiydi.
   * `branches.view_all` bu yerda o'tkazgich BO'LMAYDI — parollar ochiq
   * matnda saqlanadi.
   */
  @Get(':id/password')
  @Permissions(PERMISSIONS.USERS_PASSWORD)
  async getPassword(@Validated(idSchema) v: IdRequest, @Req() req: AuthenticatedRequest) {
    const data = await this.users.getPassword(v.params.id, credentialScope(req));
    return { success: true, data };
  }

  @Patch(':id/password')
  @Permissions(PERMISSIONS.USERS_PASSWORD)
  async setPassword(
    @Validated(setPasswordSchema) v: SetPasswordRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.users.setPassword(
      v.params.id,
      v.body.password,
      credentialScope(req),
    );
    return { success: true, data, message: 'Parol yangilandi' };
  }

  /** Foydalanuvchiga rol biriktirish. `PATCH /:id` DAN OLDIN. */
  @Patch(':id/role')
  @Permissions(PERMISSIONS.ROLES_UPDATE)
  async setRole(
    @Validated(setRoleSchema) v: SetRoleRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    // ⚠ `permissions` va filial ko'lami `req` DA (auth middleware
    // o'rnatadi), `req.user` da EMAS — imtiyoz oshirish tekshiruvi uchun
    // ikkalasi ham kerak.
    const data = await this.users.setRole(v.params.id, v.body.role, {
      _id: req.user!._id,
      permissions: req.permissions,
      allowedBranchIds: req.allowedBranchIds,
      canSeeAllBranches: req.canSeeAllBranches,
    });
    return { success: true, data, message: "Foydalanuvchi roli o'zgartirildi" };
  }

  /**
   * TAHRIRLASH: filial direktori O'Z filialidagi odam ustidan bajaradi.
   * Chegara SERVIS qatlamida (`assertTargetInScope`) — marshrut qatlamida
   * ruxsat bor-yo'qligi, servisda esa "kimga" tekshiriladi.
   */
  @Patch(':id')
  @Permissions(PERMISSIONS.USERS_UPDATE)
  async update(
    @Validated(updateSchema) v: UpdateRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const user = await this.users.update(v.params.id, v.body, req.user ?? null, {
      allowedBranchIds: req.allowedBranchIds,
      canSeeAllBranches: req.canSeeAllBranches,
    });
    return { success: true, data: user, message: 'Saqlandi' };
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * `PATCH /users/:id/branches` — ALOHIDA KONTROLLER.
 *
 * NEGA ALOHIDA: Express bu marshrutga IKKITA ruxsatni KETMA-KET ulaydi
 * (`users.read` VA `roles.update`) — semantika AND. Bu `AllPermissions`
 * bilan ifodalanadi.
 *
 * Kontroller alohida, chunki `UsersController` sinf darajasida
 * `PermissionsGuard` (OR) bilan qoplangan va `@Permissions` metadatasi
 * u yerda boshqacha. Ikki qoidani BIR sinfda aralashtirish
 * "qaysi qo'riqchi qaysi metodga tegishli" degan savolni tug'dirardi.
 *
 * ⚠ E'LON TARTIBI: bu kontroller `UsersModule` da `UsersController` DAN
 * OLDIN ro'yxatdan o'tishi SHART, aks holda `PATCH /:id` uni yutardi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Controller('users')
@UseGuards(AllPermissionsGuard)
export class UserBranchesController {
  constructor(private readonly users: UsersService) {}

  @Patch(':id/branches')
  @AllPermissions(PERMISSIONS.USERS_READ, PERMISSIONS.ROLES_UPDATE)
  async setBranches(
    @Validated(setBranchesSchema) v: SetBranchesRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.users.setBranches(v.params.id, v.body, {
      _id: req.user!._id,
      permissions: req.permissions,
      allowedBranchIds: req.allowedBranchIds,
      canSeeAllBranches: req.canSeeAllBranches,
    });
    return { success: true, data, message: 'Filial biriktiruvi yangilandi' };
  }
}
