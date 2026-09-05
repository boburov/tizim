import { Module } from '@nestjs/common';
import { VpsController } from './vps.controller.js';
import { VpsService } from './vps.service.js';
import { SshService } from './ssh.service.js';

/**
 * `SshService` ham eksport qilinadi — 3-fazada `provisioning/script-runner`
 * skriptlarni tanlangan VPS'da shu servis orqali bajaradi.
 */
@Module({
  controllers: [VpsController],
  providers: [VpsService, SshService],
  exports: [VpsService, SshService],
})
export class VpsModule {}
