import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { DeploymentsService } from './deployments.service.js';

/** Deploy jurnali — o'qish. Panel RUNNING yozuvni 2 soniyada bir so'raydi. */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class DeploymentsController {
  constructor(private readonly deployments: DeploymentsService) {}

  @Get('tenants/:id/deployments')
  list(@Param('id') tenantId: string, @Query('limit') limit?: string) {
    const n = Math.min(Math.max(Number(limit) || 30, 1), 100);
    return this.deployments.listForTenant(tenantId, n);
  }

  @Get('deployments/:id')
  get(@Param('id') id: string) {
    return this.deployments.get(id);
  }
}
