import {
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { AuthService } from './auth.service.js';
import { Permissions, Validated, CurrentUser } from '../../common/decorators/index.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import {
  setRefreshCookie,
  clearRefreshCookie,
  getRefreshFromCookies,
  type CookieSettings,
} from './cookie.js';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.js';
import type { AppConfig } from '../../config/env.validation.js';
import {
  loginSchema,
  updateProfileSchema,
  changePasswordSchema,
  type LoginRequest,
  type UpdateProfileRequest,
  type ChangePasswordRequest,
  registerUserSchema,
  type RegisterUserRequest,
} from './auth.validators.js';
import { PlanLimitsService } from '../../common/entitlements/plan-limits.service.js';

/**
 * `modules/auth/auth.routes.js` ning ko'chirmasi.
 *
 * ⚠ MARSHRUT SHARTNOMASI O'ZGARMAYDI — javob shakli, status kodlari,
 * cookie sozlamalari va xato matnlari Express bilan AYNAN bir xil.
 *
 * `/login`, `/refresh`, `/logout` — OCHIQ (auth middleware ulanmagan).
 * Qolganlari `AuthModule.configure()` da middleware bilan yopiladi.
 */
@Controller('auth')
export class AuthController {
  private readonly cookie: CookieSettings;

  constructor(
    private readonly auth: AuthService,
    private readonly limits: PlanLimitsService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.cookie = {
      isProd: config.get('isProd', { infer: true }),
      domain: config.get('COOKIE_DOMAIN', { infer: true }),
    };
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Validated(loginSchema) v: LoginRequest,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken, user, roleMeta } = await this.auth.login({
      login: v.body.login,
      password: v.body.password,
      userAgent: req.get('user-agent'),
      ip: req.ip,
    });
    setRefreshCookie(res, refreshToken, this.cookie);
    return {
      success: true,
      data: { accessToken, user, roleMeta },
      message: 'Tizimga xush kelibsiz',
    };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { accessToken, refreshToken, user } = await this.auth.rotateRefresh({
      rawRefresh: getRefreshFromCookies(req),
      userAgent: req.get('user-agent'),
      ip: req.ip,
    });
    setRefreshCookie(res, refreshToken, this.cookie);
    return { success: true, data: { accessToken, user } };
  }

  @Post('logout')
  @HttpCode(200)
  async logout(
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    await this.auth.logout({ rawRefresh: getRefreshFromCookies(req) });
    clearRefreshCookie(res, this.cookie);
    return { success: true, message: 'Tizimdan chiqdingiz' };
  }

  @Get('me')
  async me(@Req() req: AuthenticatedRequest) {
    // Auth middleware filialga xos rolni ALLAQACHON hisoblagan — qayta
    // hisoblamaymiz va klient SERVERDAGI aynan shu ruxsatlarni oladi.
    const data = await this.auth.me(req.user as never, {
      effectiveRole: req.role,
      branchId: req.branchId,
    });
    return { success: true, data };
  }

  @Patch('me')
  async updateProfile(
    @Validated(updateProfileSchema) v: UpdateProfileRequest,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    const data = await this.auth.updateProfile(user as never, v.body as never);
    return { success: true, data, message: 'Profil yangilandi' };
  }

  @Post('change-password')
  @HttpCode(200)
  async changePassword(
    @Validated(changePasswordSchema) v: ChangePasswordRequest,
    @CurrentUser() user: AuthenticatedRequest['user'],
  ) {
    await this.auth.changePassword(user as never, v.body);
    return { success: true, message: "Parol o'zgartirildi" };
  }

  /**
   * O'QUVCHI / O'QITUVCHI yaratish.
   *
   * `users.create` ruxsati bilan ochiq (owner-only EMAS) — filial
   * direktori o'z filialiga odam qo'sha olishi kerak. Xavfsiz, chunki
   * servis qatlamida `assertCanAssignBranch` bor.
   *
   * ── ⚠ ZANJIR TARTIBI EXPRESS BILAN AYNAN BIR XIL ──
   *   requirePermission → validate(registerUserSchema) → enforceUserLimit
   *
   * ⚠ `@Validated` KEYIN QO'SHILDI: ilgari `@Body()` XOM holda servisga
   * uzatilardi va ikki stek BOSHQA joyda rad etardi (Express zod bilan
   * `VALIDATION_ERROR` + maydon yo'li, NestJS esa servis xabari bilan).
   * Klient xato maydonni KO'RSATA olmasdi.
   *
   * ⚠ TARIF CHEGARASI (`enforceUserLimit`) ham shu yerda: usiz NestJS
   * orqali tarifdagi limitdan ORTIQ foydalanuvchi yaratish mumkin edi.
   */
  @Post('register-user')
  @UseGuards(PermissionsGuard)
  @Permissions(PERMISSIONS.USERS_CREATE)
  @HttpCode(201)
  async registerUser(
    @Validated(registerUserSchema) v: RegisterUserRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const body = v.body as unknown as Record<string, unknown>;
    await this.limits.assertUserLimit(String(body.role));
    const data = await this.auth.registerUser(body, {
      allowedBranchIds: req.allowedBranchIds,
      canSeeAllBranches: req.canSeeAllBranches,
      userId: req.user?.id ?? null,
    });
    return { success: true, data, message: "Foydalanuvchi qo'shildi" };
  }
}
