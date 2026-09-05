import {
  Body,
  Controller,
  HttpCode,
  NotFoundException,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Response } from 'express';
import { BotAuthService } from './bot-auth.service.js';
import { TelegramBotService } from '../../bot/telegram-bot.service.js';
import { Validated } from '../../common/decorators/index.js';
// ⚠ `../auth/index.js` — modulning OMMAVIY API'si. Ichki faylga
// to'g'ridan-to'g'ri murojaat chegara buzilishi bo'lardi
// (`scripts/arch-scan.mjs` R1).
import { setRefreshCookie, type CookieSettings } from '../auth/index.js';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.js';
import type { AppConfig } from '../../config/env.validation.js';
import {
  verifySchema,
  loginSchema,
  type VerifyRequest,
  type LoginRequest,
} from './bot-auth.validators.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * `modules/botAuth/botAuth.routes.js` NING KO'CHIRMASI.
 *
 * ── ⚠ IKKALA MARSHRUT HAM OCHIQ (auth middleware YO'Q) — VA BU TO'G'RI ──
 *
 * `/verify` da autentifikatsiya `initData` HMAC IMZOSINING O'ZI: odam
 * hali tokenga ega emas, aynan shu marshrut orqali oladi. Bu yerga
 * `AuthMiddleware` qo'yish "kirish uchun avval kirgan bo'l" degan
 * yopiq halqa yasardi.
 *
 * Express'da ham ular ochiq. Himoya — TEZLIK CHEGARASI:
 *   `/verify` → `botVerifyLimiter` (40 / 1 daqiqa)
 *   `/login`  → `authLimiter`      (20 / 5 daqiqa)
 * Ikkalasi `BotAuthModule.configure()` da ulanadi. Chegara pasaytirilsa
 * imzo/parol ko'r-ko'rona tanlash oynasi kengayadi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Controller('bot-auth')
export class BotAuthController {
  private readonly cookie: CookieSettings;

  constructor(
    private readonly botAuth: BotAuthService,
    private readonly bots: TelegramBotService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.cookie = {
      isProd: config.get('isProd', { infer: true }),
      domain: config.get('COOKIE_DOMAIN', { infer: true }),
    };
  }

  /**
   * ⚠ BOT O'CHIQ BO'LSA — 404, 403 EMAS.
   *
   * Sozlanmagan imkoniyat "mavjud, lekin sizga ruxsat yo'q" emas,
   * "umuman yo'q" degani. `internal-entitlements.controller.ts` ham
   * `HEARTBEAT_SECRET` qo'yilmaganda aynan shu qarorni qabul qiladi.
   *
   * Bu sahifa LOGIN'DAN OLDIN turadi, ya'ni `GET /features` (sessiya
   * talab qiladi) undan o'qib bo'lmaydi — mijoz botning o'chiqligini
   * FAQAT shu 404 javobidan biladi.
   */
  private assertBotEnabled(): void {
    if (!this.bots.isConfigured()) {
      throw new NotFoundException("Telegram orqali kirish bu tizimda yoqilmagan");
    }
  }

  @Post('verify')
  @HttpCode(200)
  async verify(
    @Validated(verifySchema) v: VerifyRequest,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.assertBotEnabled();

    const result = await this.botAuth.verifyAndIssue({
      initData: v.body.initData,
      userAgent: req.get('user-agent'),
      ip: req.ip,
    });

    // BOG'LANMAGAN: xato EMAS — mini-ilova login formasini ko'rsatadi.
    // ⚠ Cookie QO'YILMAYDI: sessiya yo'q.
    if (!result.linked) {
      return {
        success: true,
        data: { linked: false },
        message: "Bu Telegram hisobi hali bog'lanmagan",
      };
    }

    setRefreshCookie(res, result.refreshToken, this.cookie);
    return {
      success: true,
      data: {
        linked: true,
        accessToken: result.accessToken,
        user: result.user,
        roleMeta: result.roleMeta,
      },
      message: 'Telegram orqali muvaffaqiyatli kirildi',
    };
  }

  @Post('login')
  @HttpCode(200)
  async login(
    @Validated(loginSchema) v: LoginRequest,
    @Req() req: AuthenticatedRequest,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.assertBotEnabled();

    const { accessToken, refreshToken, user, roleMeta } = await this.botAuth.loginAndLink({
      login: v.body.login,
      password: v.body.password,
      initData: v.body.initData,
      userAgent: req.get('user-agent'),
      ip: req.ip,
    });

    setRefreshCookie(res, refreshToken, this.cookie);
    // ⚠ Javob shakli `/api/auth/login` bilan AYNAN bir xil — klient
    // (`useBotAuthLoginMutation`) ikkalasini bir xil o'qiydi.
    return {
      success: true,
      data: { accessToken, user, roleMeta },
      message: "Tizimga kirildi va Telegram bog'landi",
    };
  }
}
