import { Controller, Get, Headers, Query } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { ApiError } from '../../common/errors/api-error.js';
import { PlatformAnalyticsService } from './platform-analytics.service.js';
import type { AppConfig } from '../../config/env.validation.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * `GET /internal/analytics` — DEV PANEL O'QIYDIGAN YAGONA ANALITIKA YO'LI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── AUTENTIFIKATSIYA ──
 * `x-heartbeat-secret` — AYNAN heartbeat va entitlement bilan bir xil
 * mexanizm (`internal-entitlements.controller.ts`). Yangi sir turi
 * kiritilmadi: har qo'shimcha sir yana bitta aylanma (rotation) va
 * yana bitta yo'qolish nuqtasi demak.
 *
 * ⚠ SIR SOZLANMAGAN BO'LSA — 404, 401 EMAS. 401 endpoint MAVJUDLIGINI
 * tasdiqlaydi va uni qidirishga arziydi degan signal beradi; 404 esa
 * hech narsa aytmaydi.
 *
 * ⚠ DOIMIY VAQTLI SOLISHTIRISH — sirni belgima-belgi taxmin qilishga
 * yo'l qo'ymaslik uchun.
 *
 * ── TENANT IZOLYATSIYASI ──
 * Bu server BITTA tenantniki: har tenantning o'z jarayoni, o'z bazasi va
 * o'z `HEARTBEAT_SECRET` i bor. Ya'ni "boshqa tenant ma'lumotini so'rash"
 * degan holat KODDA MAVJUD EMAS — `tenantId` parametri umuman qabul
 * qilinmaydi va javob doim shu jarayonning o'z bazasidan yig'iladi.
 * Bir tenant ikkinchisining sirini bilsa ham, u faqat O'SHA tenantning
 * o'z manzili orqali javob ola oladi.
 */
@Controller('internal/analytics')
export class PlatformAnalyticsController {
  constructor(
    private readonly analytics: PlatformAnalyticsService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  private assertSecret(provided: string | undefined): void {
    const expected = String(this.config.get('HEARTBEAT_SECRET', { infer: true }) ?? '');
    if (!expected) throw new ApiError(404, 'Topilmadi');

    const a = Buffer.from(String(provided ?? ''));
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new ApiError(401, "Ruxsat yo'q");
    }
  }

  @Get()
  async snapshot(
    @Headers('x-heartbeat-secret') secret?: string,
    @Query('months') months?: string,
  ) {
    this.assertSecret(secret);
    // 1–24 oy. Chegara ataylab: 24 oydan uzun oyna `groupBy` ni
    // sekinlashtiradi va panelda baribir ko'rinmaydi.
    const n = Math.min(Math.max(Number(months) || 6, 1), 24);
    return this.analytics.snapshot(n);
  }
}
