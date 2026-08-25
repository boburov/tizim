import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { MarketController } from './market.controller.js';
import { MarketService } from './market.service.js';
import { CoinModule } from '../coin/coin.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';

/**
 * MARKET moduli — tanga sarflanadigan do'kon.
 *
 * `CoinModule`         — tanga yechish/qaytarish va o'chirgich.
 * `NotificationsModule`— xarid holati o'zgarganda o'quvchiga xabar
 *                        ("qanday olaman, qachon yetadi" — talab).
 *
 * ⚠ HALQA YO'Q: `CoinModule` marketni BILMAYDI. Tanga yadro, market
 * esa uning ustidagi qatlam. Teskari bog'lanish qo'shilsa (masalan
 * tanga servisidan buyurtma o'qish) NestJS DI grafi ishga tushishda
 * yiqilardi.
 */
@Module({
  imports: [CoinModule, NotificationsModule],
  controllers: [MarketController],
  providers: [MarketService],
  exports: [MarketService],
})
export class MarketModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(MarketController);
  }
}
