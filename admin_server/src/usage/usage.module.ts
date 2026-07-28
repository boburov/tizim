import { Module } from '@nestjs/common';
import { UsageService } from './usage.service.js';
import { UsageController, TenantApiController } from './usage.controller.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';

@Module({
  imports: [EntitlementsModule],
  controllers: [TenantApiController, UsageController],
  providers: [UsageService],
  exports: [UsageService],
})
export class UsageModule {}
