import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  UseGuards,
} from '@nestjs/common';
import { TenantFeaturesService } from './tenant-features.service.js';
import { SetFeatureOverrideDto } from './dto/tenant-features.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { DeveloperAdminGuard } from '../common/guards/developer-admin.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LOYIHA MODULLARI — DEVELOPER ADMIN MARSHRUTLARI.
 *
 * ── ⚠ NEGA YOZISH FAQAT SUPER_ADMIN DA ──
 *
 * Modulni yoqish — TIJORAT qarori: mijoz pul to'lamagan bo'limga kirish
 * huquqini beradi. Qo'llab-quvvatlash paytida "mijoz jahli chiqdi,
 * shunchaki yoqib qo'yaqol" bosimi doim bo'ladi va ADMIN roliga ochilsa
 * o'sha bosim jimgina narx qaroriga aylanardi. O'qish esa hammaga ochiq
 * — VIEWER holatni ko'rishi kerak.
 *
 * ⚠ SABAB MAJBURIY (`reason`). Olti oydan keyin "nega bu loyihada
 * davomat bepul?" degan savolga javob beradigan yagona narsa — o'sha
 * matn. `TenantCommercialChange` ga yoziladi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@UseGuards(JwtAuthGuard, DeveloperAdminGuard, RolesGuard)
@Controller('tenants/:id/features')
export class TenantFeaturesController {
  constructor(private readonly features: TenantFeaturesService) {}

  /** Loyihaning modul holati — panel jadvali. */
  @Get()
  @Roles('SUPER_ADMIN', 'ADMIN', 'VIEWER')
  list(@Param('id') tenantId: string) {
    return this.features.stateFor(tenantId);
  }

  /**
   * Bo'limni majburan yoqish/o'chirish.
   *
   * ⚠ O'chirish BOG'LIQLIK bilan to'siladi: tayanadigan bo'lim ochiq
   * bo'lsa 409 qaytadi va to'sqinlik qilayotgan kalitlar nomi aytiladi.
   */
  @Put(':key')
  @Roles('SUPER_ADMIN')
  set(
    @Param('id') tenantId: string,
    @Param('key') key: string,
    @Body() dto: SetFeatureOverrideDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.features.setOverride(
      tenantId,
      key,
      dto.enabled,
      dto.reason,
      user.email,
    );
  }

  /** Ustun qarorni olib tashlash — kalit yana TARIFGA bo'ysunadi. */
  @Delete(':key')
  @Roles('SUPER_ADMIN')
  clear(
    @Param('id') tenantId: string,
    @Param('key') key: string,
    @CurrentUser() user: AuthUser,
  ) {
    return this.features.clearOverride(tenantId, key, user.email);
  }
}
