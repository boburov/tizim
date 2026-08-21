import {
  Controller,
  Delete,
  Get,
  HttpCode,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { UsersService } from './users.service.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import {
  AllPermissions,
  Permissions,
  Roles,
  Validated,
} from '../../common/decorators/index.js';
import { AllPermissionsGuard } from '../../common/guards/all-permissions.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { PERMISSIONS, ROLES } from '../../common/constants/permissions.js';
import { APPROVAL_KINDS } from '../../common/constants/approvals.js';
import { ExpenseApprovalsService } from '../expense-approvals/expense-approvals.service.js';
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
  archiveActionSchema,
  permanentDeleteSchema,
  createStaffSchema,
  type IdRequest,
  type ListRequest,
  type CheckAvailabilityRequest,
  type UpdateRequest,
  type SetPasswordRequest,
  type SetRoleRequest,
  type SetBranchesRequest,
  type ArchiveActionRequest,
  type PermanentDeleteRequest,
  type CreateStaffRequest,
} from './users.validators.js';

/**
 * Express `users.routes.js` — 14 marshrutdan 14 tasi.
 *
 * ⚠ E'LON TARTIBI Express bilan AYNAN bir xil bo'lishi SHART. Aniq
 * yo'llar `/:id` DAN OLDIN turadi, aks holda `/:id` ularni yutib
 * yuborardi va javob "Foydalanuvchi topilmadi" (404) bo'lardi:
 *   PATCH /:id/branches → PATCH /:id dan oldin
 *   GET   /staff-stats, /check-availability → GET /:id dan oldin
 *
 * ⚠ `DELETE /:id/permanent` OWNER-ONLY — u ALOHIDA kontrollerda
 * (`RolesGuard`), fayl oxiriga qarang. `POST /staff` va
 * `PATCH /:id/branches` esa IKKI ruxsat birdan talab qiladi (AND) —
 * ular `UserBranchesController` da (`AllPermissionsGuard`).
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

  // ───────────────────────── HAYOT SIKLI ────────────────────────────────

  /**
   * ARXIVLASH (soft delete).
   *
   * Chegara SERVIS qatlamida (`assertTargetInScope`) — marshrut qatlamida
   * ruxsat bor-yo'qligi, servisda esa "kimga" tekshiriladi.
   *
   * ⚠ JAVOBDA `data` YO'Q: Express handler servis natijasini ATAYLAB
   * tashlab yuboradi va faqat `{ success, message }` qaytaradi.
   */
  @Delete(':id')
  @Permissions(PERMISSIONS.USERS_ARCHIVE)
  async remove(
    @Validated(archiveActionSchema) v: ArchiveActionRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.users.softRemove(v.params.id, {
      reasonId: v.body?.reasonId,
      archiveDate: v.body?.archiveDate,
      by: req.user as never,
      scope: {
        allowedBranchIds: req.allowedBranchIds,
        canSeeAllBranches: req.canSeeAllBranches,
      },
    });
    return { success: true, message: "O'chirildi" };
  }

  /**
   * ARXIVDAN QAYTARISH.
   *
   * ⚠ `POST` — `PATCH` emas. Amal idempotent ko'rinsa ham, Express
   * shartnomasi shunday va klient shunga bog'langan.
   *
   * ⚠⚠ `@HttpCode(200)` SHART. NestJS `POST` uchun STANDART 201 qaytaradi,
   * Express `res.json()` esa 200 beradi. Buni yozmaslik JIMGINA
   * shartnoma buzilishi bo'lardi: tana bir xil, status boshqacha —
   * `status === 200` ni tekshiradigan klient "tiklanmadi" deb o'ylardi.
   * (Aynan shu farqni `users-lifecycle-parity` testi ushladi.)
   */
  @Post(':id/restore')
  @HttpCode(200)
  @Permissions(PERMISSIONS.USERS_ARCHIVE)
  async restore(
    @Validated(archiveActionSchema) v: ArchiveActionRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.users.restore(v.params.id, {
      reasonId: v.body?.reasonId,
      by: req.user as never,
      scope: {
        allowedBranchIds: req.allowedBranchIds,
        canSeeAllBranches: req.canSeeAllBranches,
      },
    });
    return { success: true, data, message: 'Tiklandi' };
  }
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * `DELETE /users/:id/permanent` — ALOHIDA KONTROLLER (OWNER-ONLY).
 *
 * NEGA ALOHIDA: bu YAGONA foydalanuvchi marshruti bo'lib, u ruxsatga
 * emas, ROLGA bog'langan (`requireRole(ROLES.OWNER)`). `UsersController`
 * sinf darajasida `PermissionsGuard` bilan qoplangan; ikki xil
 * avtorizatsiya qoidasini bir sinfda aralashtirish "qaysi qo'riqchi qaysi
 * metodga tegishli" degan savolni tug'dirardi.
 *
 * NEGA OWNER-ONLY BO'LIB QOLADI (ataylab ochilmadi): sabab globallik
 * emas, QAYTARIB BO'LMASLIK. `permanentRemove` o'quvchining to'lov
 * tarixini, o'qituvchining maosh yozuvlarini va bog'liq hujjatlarni
 * butunlay o'chiradi. Arxivlash (`DELETE /:id`) kundalik ehtiyojni to'liq
 * qoplaydi va u QAYTARILADI.
 *
 * ⚠ `RolesGuard` `@Roles(OWNER)` ni `system.admin_access` ruxsati bilan
 * ham o'tkazadi — bu Express `requireRole` bilan AYNAN bir xil va
 * ataylab shunday (qarang: `roles.guard.ts`).
 *
 * ⚠ MARSHRUT TO'QNASHUVI YO'Q: `/:id` bitta segmentga mos keladi, ya'ni
 * `/:id/permanent` ni yutmaydi. Shunga qaramay kontroller `UsersModule`
 * da `UsersController` DAN OLDIN ro'yxatdan o'tkaziladi — bu faylning
 * qolgan qismidagi "aniqroq yo'l oldinda" qoidasi bilan bir xil bo'lsin.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Controller('users')
@UseGuards(RolesGuard)
export class UserPermanentDeleteController {
  constructor(private readonly users: UsersService) {}

  @Delete(':id/permanent')
  @Roles(ROLES.OWNER)
  async permanentRemove(
    @Validated(permanentDeleteSchema) v: PermanentDeleteRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.users.permanentRemove(v.params.id, req.user, {
      confirmName: v.body?.confirmName,
    });
    return { success: true, message: "Butunlay o'chirildi" };
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
  constructor(
    private readonly users: UsersService,
    private readonly approvals: ExpenseApprovalsService,
  ) {}

  /**
   * XODIM (direktor/administrator/o'qituvchi) yaratish.
   *
   * IKKI RUXSAT BIRDAN: odam yaratish VA rol biriktirish — chunki bu
   * amal ikkalasini birdan bajaradi.
   *
   * ── ISHGA OLISH TASDIG'I ──
   *
   * Filialning delegatsiya matritsasi hal qiladi
   * (`Branch.delegation.staff_hire`). `auto` bo'lsa direktor xodimni
   * o'zi qo'shadi; `approval` bo'lsa `User` DARHOL YARATILMAYDI —
   * owner tasdig'iga yuboriladi. `forbidden` bo'lsa 403.
   *
   * ⚠ 202 = "qabul qilindi, lekin hali bajarilmadi". 201 EMAS: 201
   * "yaratildi" degani bo'lardi va klient yangi xodim ID'sini kutardi.
   *
   * Ishga olishda o'lchanadigan summa yo'q, shuning uchun `metrics` ham
   * yo'q — bu tur uchun `threshold` rejimi mavjud emas.
   */
  @Post('staff')
  @HttpCode(201)
  @AllPermissions(PERMISSIONS.TEACHERS_CREATE, PERMISSIONS.ROLES_UPDATE)
  async createStaff(
    @Validated(createStaffSchema) v: CreateStaffRequest,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { needsApproval } = await this.approvals.checkConfigApproval({
      permissions: req.permissions,
      kind: APPROVAL_KINDS.STAFF_HIRE,
    });

    if (needsApproval) {
      const approval = await this.users.requestHire(v.body, { _id: req.user!._id });
      // ⚠ `@HttpCode(201)` metod darajasida turibdi, bu shox esa 202
      // qaytarishi kerak — shuning uchun statusni SHU YERDA yozamiz.
      // Ikki xil muvaffaqiyat statusini bitta dekorator bilan ifodalab
      // bo'lmaydi.
      res.status(202);
      return {
        success: true,
        data: approval,
        message: "Tasdiqlash uchun yuborildi. Owner tasdiqlagach xodim yaratiladi.",
      };
    }

    // ⚠ `permissions` va filial ko'lami `req` DA (auth middleware
    // o'rnatadi), `req.user` da EMAS.
    const data = await this.users.createStaff(v.body, {
      _id: req.user!._id,
      permissions: req.permissions,
      allowedBranchIds: req.allowedBranchIds,
      canSeeAllBranches: req.canSeeAllBranches,
    });
    return { success: true, data, message: "Xodim qo'shildi" };
  }

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
