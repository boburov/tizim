import { Module } from '@nestjs/common';
import { TenantLogoController } from './tenant-logo.controller.js';
import { TenantLogoService } from './tenant-logo.service.js';
import { SettingsModule } from '../settings/settings.module.js';
import { TenantsModule } from '../tenants/tenants.module.js';

/**
 * Fayl yuklash.
 *
 * `TenantsModule` — `applyPending()` uchun (logo o'zgarishi client'ni
 * qayta qurishni talab qiladi), `SettingsModule` — `markPending()` uchun.
 */
@Module({
  imports: [SettingsModule, TenantsModule],
  controllers: [TenantLogoController],
  providers: [TenantLogoService],
})
export class UploadsModule {}
