import { Module } from '@nestjs/common';
import { ProvisioningService } from './provisioning.service.js';
import { SettingsModule } from '../settings/settings.module.js';
import { GithubModule } from '../github/github.module.js';

@Module({
  imports: [SettingsModule, GithubModule],
  providers: [ProvisioningService],
  exports: [ProvisioningService],
})
export class ProvisioningModule {}
