import { Module } from '@nestjs/common';
import { PlatformAnalyticsController } from './platform-analytics.controller.js';
import { PlatformAnalyticsService } from './platform-analytics.service.js';

/**
 * Dev panel uchun o'qish proyeksiyasi. Foydalanuvchiga ko'rinadigan
 * marshrut YO'Q — faqat `internal/analytics`, heartbeat siri bilan.
 */
@Module({
  controllers: [PlatformAnalyticsController],
  providers: [PlatformAnalyticsService],
})
export class PlatformAnalyticsModule {}
