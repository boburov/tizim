import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { TenantAnalyticsService } from './tenant-analytics.service.js';

/**
 * `GET /tenants/:id/analytics` — loyihaning biznes va moliya ko'rsatkichlari.
 *
 * ⚠ SUPER_ADMIN / ADMIN. VIEWER'ga BERILMAYDI: bu mijozning tijorat
 * ma'lumoti (daromad, qarzdorlik), platformaning texnik holati emas.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN')
@Controller('tenants/:id/analytics')
export class TenantAnalyticsController {
  constructor(private readonly analytics: TenantAnalyticsService) {}

  @Get()
  get(
    @Param('id') id: string,
    @Query('months') months?: string,
    @Query('force') force?: string,
  ) {
    const n = Math.min(Math.max(Number(months) || 6, 1), 24);
    return this.analytics.fetch(id, n, force === 'true');
  }
}
