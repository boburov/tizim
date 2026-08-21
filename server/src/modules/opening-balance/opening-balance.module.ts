import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import {
  OpeningBalanceController,
  OpeningBalanceRepairController,
} from './opening-balance.controller.js';
import { OpeningBalanceService } from './opening-balance.service.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';
import { DepositsModule } from '../deposits/deposits.module.js';

/**
 * BOSHLANG'ICH QOLDIQ (FAZA 7.8) — 3/3 marshrut.
 *
 * `DepositsModule` — o'quvchi AVANSI depozitga tushadi (`topup`) va yangi
 * qarz darhol qoplanadi (`autoApply`). Depozit yozish mantig'i BU YERDA
 * QAYTA YOZILMAYDI.
 *
 * ⚠ KONTROLLER TARTIBI: `OpeningBalanceRepairController` (`POST /repair`)
 * OLDINDA. To'qnashuv aslida yo'q (`POST /` bo'sh yo'l, `/repair` esa
 * segmentli), lekin qoida bir xil qolsin: aniqroq yo'l oldinda.
 *
 * ⚠ `OpeningBalanceService` EKSPORT QILINADI: `ledger` (`partyAmount`),
 * `groups` (guruhga qo'shilganda `materializePendingForStudent`) va
 * `imports` unga tayanadi.
 */
@Module({
  imports: [DepositsModule],
  controllers: [OpeningBalanceRepairController, OpeningBalanceController],
  providers: [OpeningBalanceService],
  exports: [OpeningBalanceService],
})
export class OpeningBalanceModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(AuthMiddleware)
      .forRoutes(OpeningBalanceRepairController, OpeningBalanceController);
  }
}
