import { Module } from '@nestjs/common';
import {
  TenantFeaturesController,
  FeatureSummaryController,
} from './tenant-features.controller.js';
import { TenantFeaturesService } from './tenant-features.service.js';
import { TenantRefreshService } from './tenant-refresh.service.js';
import { EntitlementsModule } from '../entitlements/entitlements.module.js';

/**
 * Loyiha modullarini yoqish/o'chirish.
 *
 * ⚠ `EntitlementsModule` import qilinadi, yechish mantig'i KO'CHIRILMAYDI:
 * panel ko'rsatadigan holat va tenantga ketadigan javob BITTA
 * hisoblovchidan chiqishi shart. Ikkinchi nusxa yozilsa panel bir narsani,
 * mijoz boshqasini ko'rgan bo'lardi va bu farqni hech narsa ushlamasdi.
 */
@Module({
  imports: [EntitlementsModule],
  controllers: [TenantFeaturesController, FeatureSummaryController],
  providers: [TenantFeaturesService, TenantRefreshService],
  exports: [TenantFeaturesService],
})
export class TenantFeaturesModule {}
