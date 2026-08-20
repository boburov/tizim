import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { BotAuthController } from './bot-auth.controller.js';
import { BotAuthService } from './bot-auth.service.js';
import { AuthModule } from '../auth/auth.module.js';
import { authLimiter, botVerifyLimiter } from '../../common/middleware/rate-limit.js';

/**
 * Telegram mini-ilova autentifikatsiyasi.
 *
 * `AuthModule` — `AuthService.issueTokens` / `sanitizeUser` uchun.
 * Token berish mantig'i BITTA joyda qolishi shart: ikkinchi nusxa
 * bo'lsa, refresh token TTL yoki `sub` shakli jimgina uzoqlashardi va
 * bot orqali kirgan sessiya oddiy sessiyadan boshqacha yashardi.
 */
@Module({
  imports: [AuthModule],
  controllers: [BotAuthController],
  providers: [BotAuthService],
  // Testlar servisga DI konteyneridan murojaat qiladi (marshrutsiz).
  exports: [BotAuthService],
})
export class BotAuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // ⚠ TEZLIK CHEGARALARI — Express bilan AYNAN bir xil.
    consumer
      .apply(botVerifyLimiter)
      .forRoutes({ path: 'bot-auth/verify', method: RequestMethod.POST });
    consumer
      .apply(authLimiter)
      .forRoutes({ path: 'bot-auth/login', method: RequestMethod.POST });
  }
}
