import { Module } from '@nestjs/common';
import { ProvisioningService } from './provisioning.service.js';
import { ScriptRunnerService } from './script-runner.service.js';
import { DeploymentsService } from './deployments.service.js';
import { DeploymentsController } from './deployments.controller.js';
import { MigrationService } from './migration.service.js';
import { SettingsModule } from '../settings/settings.module.js';
import { GithubModule } from '../github/github.module.js';
import { VpsModule } from '../vps/vps.module.js';

/**
 * Provisioning — skriptlarni TANLANGAN VPS'da bajarish (lokal yoki SSH),
 * har amalni `Deployment` jurnaliga yozish, VPS'lar orasida ko'chirish.
 */
@Module({
  imports: [SettingsModule, GithubModule, VpsModule],
  controllers: [DeploymentsController],
  providers: [ProvisioningService, ScriptRunnerService, DeploymentsService, MigrationService],
  exports: [ProvisioningService, ScriptRunnerService, DeploymentsService, MigrationService],
})
export class ProvisioningModule {}
