import { Module } from '@nestjs/common';
import { PlansService } from './plans.service.js';
import {
  PlansController,
  TenantSubscriptionController,
} from './plans.controller.js';

@Module({
  controllers: [PlansController, TenantSubscriptionController],
  providers: [PlansService],
  exports: [PlansService],
})
export class PlansModule {}
