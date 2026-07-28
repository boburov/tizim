import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Req,
  Res,
  ServiceUnavailableException,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
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
  constructor(private readonly auth: CustomerAuthService) {}

  @Post('signup')
  signup(@Body() dto: SignupDto) {
    return this.auth.signup(dto);
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

    return passport.authenticate(
      GOOGLE_STRATEGY,
      { session: false },
      async (err: unknown, profile: GoogleProfile | false) => {
        const redirect = (path: string) =>
          res.redirect(`${clientUrl()}${path}`);

        if (err || !profile) return redirect('/login?error=google');

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
          return redirect('/');
        } catch (e) {
          // Hisob bloklangan yoki email tasdiqlanmagan - sababni ko'rsatamiz.
          const message =
            e instanceof UnauthorizedException ? e.message : 'google';
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

  @Post('tenants')
  createTenant(
    @Req() req: CustomerRequest,
    @Body() dto: CreateTenantDto & { planKey?: string },
  ) {
    return this.customers.createTenant(currentCustomer(req).sub, dto);
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
