import { Global, Module } from '@nestjs/common';
import { BranchConfigController } from './branch-config.controller.js';
import { BranchConfigService } from './branch-config.service.js';

/**
 * ⚠ `@Global()`: filial chegarasini `EntitlementsService` (heartbeat
 * javobi) va `SettingsService` (tenant `.env`) ham o'qiydi. Global
 * bo'lmasa ular yo o'z nusxasini yasashi, yo modul importlari halqa
 * hosil qilishi kerak edi — ikkalasi ham hisoblashni IKKILANTIRARDI.
 */
@Global()
@Module({
  controllers: [BranchConfigController],
  providers: [BranchConfigService],
  exports: [BranchConfigService],
})
export class BranchConfigModule {}
