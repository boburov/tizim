import { Module } from '@nestjs/common';
import { TenantsService } from './tenants.service.js';
import { TenantsController } from './tenants.controller.js';
import { ProvisioningModule } from '../provisioning/provisioning.module.js';

@Module({
  imports: [ProvisioningModule],
  controllers: [TenantsController],
  providers: [TenantsService],
})
export class TenantsModule {}
