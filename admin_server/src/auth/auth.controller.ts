import {
  Body,
  Controller,
  Get,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AuthService } from './auth.service.js';
import { CustomerAuthService } from '../customers/customer-auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator.js';

const isProd = process.env.NODE_ENV === 'production';

const cookieBase = {
  httpOnly: true,
  secure: isProd,
  sameSite: (isProd ? 'none' : 'lax') as 'none' | 'lax',
  path: '/',
};

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly customerAuth: CustomerAuthService,
  ) {}

  /**
   * YAGONA kirish nuqtasi — super admin ham, oddiy mijoz ham shu yerdan kiradi.
   *
   * Tartib: avval admin (statik super admin + AdminUser jadvali), topilmasa
   * mijoz (Customer jadvali). Kim ekaniga qarab TEGISHLI cookie'lar qo'yiladi
   * va javobda `kind` qaytadi — frontend shunga qarab qayerga yo'naltirishni
   * biladi.
   *
   * MUHIM: xato xabari ikkala holatda ham bir xil ("Email yoki parol
   * noto'g'ri") — aks holda bu endpoint orqali qaysi email ro'yxatda borligini
   * aniqlash mumkin bo'lardi.
   */
  @Post('login')
  async login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    // --- 1) Admin sifatida urinamiz ---
    try {
      const user = await this.auth.validateUser(dto.email, dto.password);
      const { accessToken, refreshToken } = await this.auth.issueTokens(user);

      res.cookie('access_token', accessToken, {
        ...cookieBase,
        maxAge: 15 * 60 * 1000,
      });
      res.cookie('refresh_token', refreshToken, {
        ...cookieBase,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });

      return { kind: 'admin' as const, user, accessToken };
    } catch (err) {
      // Sozlama xatosi (masalan .env to'liq emas) mijoz oqimiga tushib
      // ketmasin — uni o'zgartirmasdan yuqoriga qaytaramiz.
      if (!(err instanceof UnauthorizedException)) throw err;
    }

    // --- 2) Mijoz sifatida urinamiz ---
    const customer = await this.customerAuth.validate(dto.email, dto.password);
    const { accessToken, refreshToken } =
      await this.customerAuth.issueTokens(customer);

    res.cookie('customer_access_token', accessToken, {
      ...cookieBase,
      maxAge: 15 * 60 * 1000,
    });
    res.cookie('customer_refresh_token', refreshToken, {
      ...cookieBase,
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return {
      kind: 'customer' as const,
      customer: {
        id: customer.id,
        email: customer.email,
        fullName: customer.fullName,
      },
      accessToken,
    };
  }

  /**
   * Refresh — qaysi cookie borligiga qarab admin yoki mijoz sessiyasini
   * yangilaydi. Login yagona bo'lgani uchun refresh ham yagona bo'lishi kerak.
   */
  @Post('refresh')
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const adminToken = req.cookies?.refresh_token;
    const customerToken = req.cookies?.customer_refresh_token;

    if (adminToken) {
      const { accessToken, refreshToken } = await this.auth.refresh(adminToken);
      res.cookie('access_token', accessToken, {
        ...cookieBase,
        maxAge: 15 * 60 * 1000,
      });
      res.cookie('refresh_token', refreshToken, {
        ...cookieBase,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      return { kind: 'admin' as const, accessToken };
    }

    if (customerToken) {
      const { accessToken, refreshToken } =
        await this.customerAuth.refresh(customerToken);
      res.cookie('customer_access_token', accessToken, {
        ...cookieBase,
        maxAge: 15 * 60 * 1000,
      });
      res.cookie('customer_refresh_token', refreshToken, {
        ...cookieBase,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      return { kind: 'customer' as const, accessToken };
    }

    throw new UnauthorizedException("Refresh token yo'q");
  }

  /** Ikkala sessiyani ham tozalaymiz — kim chiqayotganini bilish shart emas. */
  @Post('logout')
  async logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie('access_token', cookieBase);
    res.clearCookie('refresh_token', cookieBase);
    res.clearCookie('customer_access_token', cookieBase);
    res.clearCookie('customer_refresh_token', cookieBase);
    return { ok: true };
  }

  /**
   * Joriy sessiya — admin yoki mijoz.
   *
   * Guard ishlatilmaydi: guard faqat bitta turdagi tokenni biladi, bu yerda
   * esa ikkalasini ham tekshirish kerak. Token yo'q bo'lsa 401.
   */
  @Get('me')
  async me(@Req() req: Request) {
    const session = await this.auth.resolveSession({
      adminToken: req.cookies?.access_token,
      customerToken: req.cookies?.customer_access_token,
    });
    if (!session) throw new UnauthorizedException('Sessiya topilmadi');
    return session;
  }
}
