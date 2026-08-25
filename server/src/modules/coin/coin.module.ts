import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { CoinController } from './coin.controller.js';
import { CoinService } from './coin.service.js';
import { CoinSettingsService } from './coin-settings.service.js';
import { CoinSwitchGuard } from './coin-switch.guard.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';

/**
 * TANGA moduli — rag'batlantirish tizimining YADROSI.
 *
 * ── NIMA EKSPORT QILINADI VA NEGA ──
 *  • `CoinService`         — davomat va baho modullari tanga yozadi;
 *                            market esa tanga yechadi va qaytaradi.
 *  • `CoinSettingsService` — market moduli o'chirgichni o'qiydi.
 *  • `CoinSwitchGuard`     — market kontrolleri AYNI qo'riqchini
 *                            ishlatadi, ikkinchi nusxa YARATILMAYDI:
 *                            ikki nusxa muqarrar ravishda ajralib
 *                            ketardi va bo'lim yarim o'chgan holatda
 *                            qolardi.
 *
 * ⚠ `NotificationsModule` BU YERDA YO'Q. Tanga berish JIM: har dars
 * uchun push yuborilsa o'quvchi bir haftada bildirishnomalarni
 * umuman o'qimay qo'yardi. Xabar faqat MARKETda (xarid holati
 * o'zgarganda) yuboriladi.
 */
@Module({
  controllers: [CoinController],
  providers: [CoinService, CoinSettingsService, CoinSwitchGuard],
  exports: [CoinService, CoinSettingsService, CoinSwitchGuard],
})
export class CoinModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(CoinController);
  }
}
