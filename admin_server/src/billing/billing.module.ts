import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { BillingService } from './billing.service.js';
import {
  BillingController,
  BillingWebhookController,
  CustomerBillingController,
} from './billing.controller.js';
import { CustomerJwtGuard } from '../common/guards/customer-jwt.guard.js';
import { PlansModule } from '../plans/plans.module.js';
import { SubscriptionsModule } from '../subscriptions/subscriptions.module.js';

@Module({
  imports: [JwtModule.register({}), PlansModule, SubscriptionsModule],
  controllers: [
    BillingWebhookController,
    CustomerBillingController,
    BillingController,
  ],
  providers: [BillingService, CustomerJwtGuard],
})
export class BillingModule {}
