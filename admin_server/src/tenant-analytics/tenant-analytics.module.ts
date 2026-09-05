import { Module } from '@nestjs/common';
import { TenantAnalyticsController } from './tenant-analytics.controller.js';
import { TenantAnalyticsService } from './tenant-analytics.service.js';

@Module({
  controllers: [TenantAnalyticsController],
  providers: [TenantAnalyticsService],
  exports: [TenantAnalyticsService],
})
export class TenantAnalyticsModule {}
