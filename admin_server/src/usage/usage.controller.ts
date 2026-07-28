import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UsageService } from './usage.service.js';
import { HeartbeatDto } from './dto/heartbeat.dto.js';
import { EntitlementsService } from '../entitlements/entitlements.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';

/**
 * Tenant serverlar chaqiradigan ochiq endpoint (JWT emas — heartbeat kaliti).
 * Alohida controller, chunki bu marshrutda JwtAuthGuard BO'LMASLIGI kerak.
 */
@Controller('tenant-api')
export class TenantApiController {
  constructor(private readonly usage: UsageService) {}

  @Post(':tenantId/heartbeat')
  @HttpCode(200)
  heartbeat(
    @Param('tenantId') tenantId: string,
    @Headers('x-heartbeat-secret') secret: string | undefined,
    @Body() dto: HeartbeatDto,
  ) {
    return this.usage.heartbeat(tenantId, secret, dto.metrics);
  }
}

/** Admin panel uchun usage ko'rish (JWT bilan himoyalangan). */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('usage')
export class UsageController {
  constructor(
    private readonly usage: UsageService,
    private readonly entitlements: EntitlementsService,
  ) {}

  /** Barcha tenantlar bo'yicha umumiy holat. */
  @Get()
  overview() {
    return this.usage.overview();
  }

  /** Bitta tenantning limitlari + hozirgi foydalanishi. */
  @Get('tenant/:tenantId')
  forTenant(@Param('tenantId') tenantId: string) {
    return this.entitlements.forTenant(tenantId);
  }

  /** Grafik uchun tarix. */
  @Get('tenant/:tenantId/history')
  history(
    @Param('tenantId') tenantId: string,
    @Query('metric') metric?: string,
    @Query('days') days?: string,
  ) {
    const d = Number(days);
    return this.usage.history(
      tenantId,
      metric,
      Number.isFinite(d) && d > 0 && d <= 365 ? d : 30,
    );
  }
}
