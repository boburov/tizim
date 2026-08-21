import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { ExpenseApprovalsController } from './expense-approvals.controller.js';
import { ExpenseApprovalsService } from './expense-approvals.service.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';

/**
 * TASDIQLAR (FAZA 7.3).
 *
 * ⚠ SERVIS EKSPORT QILINADI. `checkExpenseLimit`, `checkConfigApproval`
 * va `createRequest` ni chiqim, maosh, chegirma, guruh narxi va depozit
 * modullari CHAQIRADI — ular ko'chganda shu servisga ulanadi. Ikkinchi
 * limit-tekshiruvi implementatsiyasi paydo bo'lmasligi SHART: chegara
 * ikki joyda ikki xil bo'lib qolsa tasdiq oqimini aylanib o'tish yo'li
 * ochilardi.
 */
@Module({
  controllers: [ExpenseApprovalsController],
  providers: [ExpenseApprovalsService],
  exports: [ExpenseApprovalsService],
})
export class ExpenseApprovalsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(ExpenseApprovalsController);
  }
}
