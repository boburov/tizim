import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { LedgerController, LedgerMeController } from './ledger.controller.js';
import { LedgerService } from './ledger.service.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';
import { OpeningBalanceModule } from '../opening-balance/opening-balance.module.js';

/**
 * LEDGER (FAZA 7.9) — 2/2 marshrut. SOF O'QISH MODELI, hech narsa YOZMAYDI.
 *
 * `OpeningBalanceModule` — `partyAmount()` uchun. U SAQLANGAN summani
 * "party" konvensiyasiga (+ = markaz qarzdor) keltiradi va uni QAYTA
 * YOZISH eski (`flow`) yozuvlarda o'qituvchi/xodim ISHORASINI TESKARI
 * ko'rsatardi.
 *
 * ⚠ KONTROLLER TARTIBI: `LedgerMeController` (`/me`) OLDINDA — aks holda
 * `/:userId` uni yutib, "me" ID validatsiyasida yiqilardi.
 */
@Module({
  imports: [OpeningBalanceModule],
  controllers: [LedgerMeController, LedgerController],
  providers: [LedgerService],
  exports: [LedgerService],
})
export class LedgerModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(LedgerMeController, LedgerController);
  }
}
