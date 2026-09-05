import { Global, Module } from '@nestjs/common';
import { BranchConfigController } from './branch-config.controller.js';
import { BranchConfigService } from './branch-config.service.js';
import { SettingsModule } from '../settings/settings.module.js';

/**
 * ⚠ `@Global()`: filial chegarasini `EntitlementsService` (heartbeat
 * javobi) va `SettingsService` (tenant `.env`) ham o'qiydi. Global
 * bo'lmasa ular yo o'z nusxasini yasashi, yo modul importlari halqa
 * hosil qilishi kerak edi — ikkalasi ham hisoblashni IKKILANTIRARDI.
 */
@Global()
@Module({
  // ⚠ HALQA YO'Q: `SettingsModule` hech narsa import qilmaydi va
  // `BranchConfigService` ni GLOBAL sifatida oladi.
  imports: [SettingsModule],
  controllers: [BranchConfigController],
  providers: [BranchConfigService],
  exports: [BranchConfigService],
})
export class BranchConfigModule {}
