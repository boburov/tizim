import { Module } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service.js';
import { SubscriptionSchedulerService } from './subscription-scheduler.service.js';
import { SubscriptionsController } from './subscriptions.controller.js';
import { ProvisioningModule } from '../provisioning/provisioning.module.js';

@Module({
  imports: [ProvisioningModule],
  controllers: [SubscriptionsController],
  providers: [SubscriptionsService, SubscriptionSchedulerService],
  exports: [SubscriptionsService],
})
export class SubscriptionsModule {}
