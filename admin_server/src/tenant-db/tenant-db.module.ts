import { Global, Module } from '@nestjs/common';
import { TenantDbService } from './tenant-db.service.js';
import { VpsModule } from '../vps/vps.module.js';

/**
 * Global: tenant bazasiga ulanish ham provisioning oqimida (ega yaratish),
 * ham panel so'rovlarida (egani o'qish) kerak bo'ladi.
 */
@Global()
@Module({
  imports: [VpsModule],
  providers: [TenantDbService],
  exports: [TenantDbService],
})
export class TenantDbModule {}
