import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { FinanceOpsController } from './finance-ops.controller.js';
import { FinanceOpsService } from './finance-ops.service.js';
import { BudgetService } from './budget.service.js';
import { FinanceModule } from '../finance/finance.module.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';

/** MOLIYAVIY AMALLAR (FAZA 7.5) — qaytarim / o'tkazma / egasi puli / byudjet. */
@Module({
  imports: [FinanceModule],
  controllers: [FinanceOpsController],
  providers: [FinanceOpsService, BudgetService],
  exports: [BudgetService],
})
export class FinanceOpsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(FinanceOpsController);
  }
}
