import {
  Body,
  Controller,
  Delete,
  Get,
  GoneException,
  HttpCode,
  Logger,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean } from 'class-validator';
import type { Request, Response } from 'express';
import passport from 'passport';
import { CustomerAuthService } from './customer-auth.service.js';
import {
  GOOGLE_STRATEGY,
  googleEnabled,
  type GoogleProfile,
} from './google.strategy.js';
import { CustomersService } from './customers.service.js';
import {
  CustomerLoginDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  SignupDto,
  UpdateProfileDto,
  VerifyEmailDto,
} from './dto/customer-auth.dto.js';
import { CreateTenantDto } from '../tenants/dto/create-tenant.dto.js';
import { DeleteTenantDto } from '../tenants/dto/delete-tenant.dto.js';
import {
  CustomerJwtGuard,
  CustomerRequest,
  currentCustomer,
} from '../common/guards/customer-jwt.guard.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';

class SetActiveDto {
  @IsBoolean() isActive!: boolean;
}

const isProd = process.env.NODE_ENV === 'production';

const cookieBase = {
  httpOnly: true,
  secure: isProd,
  sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
  path: '/',
};

/**
 * Google callback'dan keyin qaytariladigan frontend manzili.
 * ADMIN_CLIENT_URL vergul bilan bir nechta domen bo'lishi mumkin (CORS uchun) -
 * redirect uchun BIRINCHISINI olamiz.
 */
const clientUrl = () =>
  (process.env.ADMIN_CLIENT_URL || 'http://localhost:5174')
    .split(',')[0]
    .trim()
    .replace(/\/$/, '');

/** Ochiq marshrutlar — ro'yxatdan o'tish va kirish. */
@Controller('customer/auth')
export class CustomerAuthController {
  private readonly logger = new Logger(CustomerAuthController.name);

  constructor(private readonly auth: CustomerAuthService) {}

  /**
   * ⚠ YOPILGAN — mijoz o'zi ro'yxatdan o'ta olmaydi.
   *
   * Loyiha endi FAQAT developer paneldan yaratiladi, chunki har bir yangi
   * loyiha uchun ega login/paroli majburiy va uni admin belgilaydi.
   * Self-service oqimida bunday maydon yo'q edi — mijoz ishlaydigan domen
   * olardi-yu, unga kira olmasdi.
   *
   * Marshrutning o'zi SAQLANADI: 404 qaytarish eski frontend nusxalarini
   * "server ishlamayapti" holatiga tushirardi, 410 esa aniq javob beradi.
   * Mavjud mijoz yozuvlari va ularning kirishi TEGILMAGAN.
   */
  @Post('signup')
  @HttpCode(410)
  signup(@Body() _dto: SignupDto) {
    throw new GoneException(
      "Ro'yxatdan o'tish yopilgan — loyiha ochish uchun biz bilan bog'laning",
    );
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Body() dto: CustomerLoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const customer = await this.auth.validate(dto.email, dto.password);
    const { accessToken, refreshToken } = await this.auth.issueTokens(customer);

    // Admin cookie'laridan alohida nom — bir brauzerda ikkalasi ham ishlaydi
    res.cookie('customer_access_token', accessToken, {
      ...cookieBase,
      maxAge: 15 * 60 * 1000,
    });
    res.cookie('customer_refresh_token', refreshToken, {
      ...cookieBase,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return {
      customer: {
        id: customer.id,
        email: customer.email,
        fullName: customer.fullName,
      },
      accessToken,
    };
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const token = req.cookies?.customer_refresh_token;
    if (!token) throw new UnauthorizedException("Refresh token yo'q");
    const { accessToken, refreshToken } = await this.auth.refresh(token);

    res.cookie('customer_access_token', accessToken, {
      ...cookieBase,
      maxAge: 15 * 60 * 1000,
    });
    res.cookie('customer_refresh_token', refreshToken, {
      ...cookieBase,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });
    return { accessToken };
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('customer_access_token', cookieBase);
    res.clearCookie('customer_refresh_token', cookieBase);
    return { ok: true };
  }

  // --- Google OAuth ---
  // Oqim: /google -> Google roziligi -> /google/callback -> cookie -> frontend.
  // Token URL'da YUBORILMAYDI (u brauzer tarixida va Referer'da qolib ketardi),
  // faqat httpOnly cookie o'rnatiladi.

  @Get('google')
  google(@Res() res: Response) {
    if (!googleEnabled()) {
      throw new ServiceUnavailableException('Google orqali kirish sozlanmagan');
    }
    // Guard'ni shu yerda qo'llaymiz - sozlanmagan bo'lsa yuqorida to'xtatamiz.
    return passport.authenticate(GOOGLE_STRATEGY, {
      session: false,
      scope: ['email', 'profile'],
    })(res.req, res, () => undefined);
  }

  @Get('google/callback')
  googleCallback(@Req() req: Request, @Res() res: Response) {
    if (!googleEnabled()) {
      throw new ServiceUnavailableException('Google orqali kirish sozlanmagan');
    }

    // Javob FAQAT bir marta yuborilishi kerak. Passport oqimida callback
    // ba'zan qayta ishga tushadi (yoki xato bilan success ketma-ket keladi) -
    // himoyasiz res.redirect ikkinchi marta chaqirilsa ERR_HTTP_HEADERS_SENT
    // bo'lib butun oqim yiqilardi. Shuning uchun headersSent bo'lsa jim chiqamiz.
    const redirect = (path: string) => {
      if (res.headersSent) return;
      res.redirect(`${clientUrl()}${path}`);
    };

    return passport.authenticate(
      GOOGLE_STRATEGY,
      { session: false },
      async (err: unknown, profile: GoogleProfile | false) => {
        if (err || !profile) {
          this.logger.warn(
            { err: err instanceof Error ? err.message : err },
            'Google auth: profil olinmadi',
          );
          return redirect('/login?error=google');
        }

        try {
          const customer = await this.auth.loginWithGoogle(profile);
          const { accessToken, refreshToken } =
            await this.auth.issueTokens(customer);

          res.cookie('customer_access_token', accessToken, {
            ...cookieBase,
            maxAge: 15 * 60 * 1000,
          });
          res.cookie('customer_refresh_token', refreshToken, {
            ...cookieBase,
            maxAge: 7 * 24 * 60 * 60 * 1000,
          });
          // To'g'ridan-to'g'ri mijoz kabinetiga - '/' admin ildizi bo'lib,
          // u yerdan yana /portal ga sakrash sessiya hali o'qilmasdan turib
          // login sahifasini ko'rsatib yuborishi mumkin edi.
          return redirect('/portal');
        } catch (e) {
          // Hisob bloklangan yoki email tasdiqlanmagan - sababni ko'rsatamiz.
          const message =
            e instanceof UnauthorizedException ? e.message : 'google';
          this.logger.error(
            { err: e instanceof Error ? e.message : e },
            'Google auth: login yakunlanmadi',
          );
          return redirect(`/login?error=${encodeURIComponent(message)}`);
        }
      },
    )(req, res, () => undefined);
  }

  @Post('verify-email')
  @HttpCode(200)
  verifyEmail(@Body() dto: VerifyEmailDto) {
    return this.auth.verifyEmail(dto.token);
  }

  @Post('forgot-password')
  @HttpCode(200)
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.auth.forgotPassword(dto);
  }

  @Post('reset-password')
  @HttpCode(200)
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto);
  }
}

/**
 * Admin paneli — barcha mijozlar (foydalanuvchilar) ro'yxati.
 *
 * `customer/*` marshrutlaridan ATAYLAB alohida: u yerda guard mijozning
 * o'z tokeni, bu yerda esa admin JWT. Bitta controller ichida ikki xil
 * guard turishi kelajakda oson xatoga olib kelardi.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin/customers')
export class AdminCustomersController {
  constructor(private readonly customers: CustomersService) {}

  @Get()
  list(@Query('q') q?: string) {
    return this.customers.adminList(q);
  }

  /** Super admin o'zi yaratgan, mijozga biriktirilmagan loyihalar. */
  @Get('unassigned-tenants')
  unassigned() {
    return this.customers.adminUnassignedTenants();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.customers.adminFindOne(id);
  }

  /** Kabinetga kirishni bloklash / ochish. */
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Patch(':id/active')
  setActive(@Param('id') id: string, @Body() dto: SetActiveDto) {
    return this.customers.adminSetActive(id, dto.isActive);
  }
}

/** Client panel — mijozning o'z ma'lumotlari (token bilan). */
@UseGuards(CustomerJwtGuard)
@Controller('customer')
export class CustomerPortalController {
  constructor(private readonly customers: CustomersService) {}

  @Get('me')
  me(@Req() req: CustomerRequest) {
    return this.customers.profile(currentCustomer(req).sub);
  }

  @Patch('me')
  updateMe(@Req() req: CustomerRequest, @Body() dto: UpdateProfileDto) {
    return this.customers.updateProfile(currentCustomer(req).sub, dto);
  }

  @Get('plans')
  plans() {
    return this.customers.publicPlans();
  }

  @Get('tenants')
  myTenants(@Req() req: CustomerRequest) {
    return this.customers.myTenants(currentCustomer(req).sub);
  }

  @Get('tenants/:id')
  myTenant(@Req() req: CustomerRequest, @Param('id') id: string) {
    return this.customers.myTenant(currentCustomer(req).sub, id);
  }

  @Get('tenants/:id/usage')
  myTenantUsage(@Req() req: CustomerRequest, @Param('id') id: string) {
    return this.customers.myTenantUsage(currentCustomer(req).sub, id);
  }

  /**
   * ⚠ YOPILGAN — yuqoridagi `signup` bilan bir sabab: loyiha yaratish endi
   * ega login/parolini talab qiladi va u faqat developer panelda beriladi.
   */
  @Post('tenants')
  @HttpCode(410)
  createTenant(
    @Req() _req: CustomerRequest,
    @Body() _dto: CreateTenantDto & { planKey?: string },
  ) {
    throw new GoneException(
      "Loyihani o'zingiz yarata olmaysiz — yangi loyiha uchun biz bilan bog'laning",
    );
  }

  @Delete('tenants/:id')
  @HttpCode(200)
  removeTenant(
    @Req() req: CustomerRequest,
    @Param('id') id: string,
    @Body() dto: DeleteTenantDto,
  ) {
    return this.customers.removeTenant(
      currentCustomer(req).sub,
      id,
      dto.confirmDomain,
    );
  }
}
