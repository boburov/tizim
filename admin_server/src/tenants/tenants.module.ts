import { Module } from '@nestjs/common';
import { TenantsService } from './tenants.service.js';
import {
  TenantDeployController,
  TenantsController,
} from './tenants.controller.js';
import { TenantOwnerController } from './tenant-owner.controller.js';
import { ProvisioningModule } from '../provisioning/provisioning.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { GithubModule } from '../github/github.module.js';

@Module({
  imports: [ProvisioningModule, SettingsModule, GithubModule],
  // ⚠ TenantOwnerController TenantsController'dan OLDIN: `tenants/:id/owner`
  // `tenants/:id` dan uzunroq bo'lsa ham, Nest ro'yxat tartibida moslashtiradi
  // va aniqroq yo'l birinchi turishi kerak.
  controllers: [TenantOwnerController, TenantsController, TenantDeployController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
