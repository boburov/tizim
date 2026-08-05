import { Module } from '@nestjs/common';
import { TenantsService } from './tenants.service.js';
import {
  TenantDeployController,
  TenantsController,
} from './tenants.controller.js';
import { ProvisioningModule } from '../provisioning/provisioning.module.js';
import { SettingsModule } from '../settings/settings.module.js';
import { GithubModule } from '../github/github.module.js';

@Module({
  imports: [ProvisioningModule, SettingsModule, GithubModule],
  controllers: [TenantsController, TenantDeployController],
  providers: [TenantsService],
  exports: [TenantsService],
})
export class TenantsModule {}
