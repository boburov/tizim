import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { FeaturesController } from './features.controller.js';
import { InternalEntitlementsController } from './internal-entitlements.controller.js';
import { JobsModule } from '../../jobs/jobs.module.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';
import { BotModule } from '../../bot/bot.module.js';

/**
 * TARIF IMKONIYATLARI — mijoz uchun o'qish, admin server uchun turtki.
 *
 * ⚠ IKKI KONTROLLER, IKKI XIL HIMOYA:
 *   • `/features` — foydalanuvchi sessiyasi (`AuthMiddleware`);
 *   • `/internal/entitlements/refresh` — mashina-mashina, `x-heartbeat-secret`.
 *
 * Shuning uchun `AuthMiddleware` FAQAT birinchisiga ulanadi: admin server
 * tenant ilovasida foydalanuvchi emas, uning sessiyasi ham yo'q.
 */
@Module({
  // `BotModule` hech narsa import qilmaydi, ya'ni aylana bog'liqlik xavfi
  // yo'q (`notifications` va `assignments` ham xuddi shunday import qiladi).
  imports: [JobsModule, BotModule],
  controllers: [FeaturesController, InternalEntitlementsController],
})
export class FeaturesModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(FeaturesController);
  }
}
