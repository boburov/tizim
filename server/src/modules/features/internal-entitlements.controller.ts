import { Controller, Headers, HttpCode, Post } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { ApiError } from '../../common/errors/api-error.js';
import { UsageHeartbeatJob } from '../../jobs/system/usage-heartbeat.job.js';
import type { AppConfig } from '../../config/env.validation.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DARHOL YANGILASH — dev panelda tugma bosilganda 15 daqiqa kutilmasin.
 *
 * ── ⚠ NEGA PAYLOAD QABUL QILINMAYDI ──
 *
 * Admin server bu yerga LIMITLARNI YUBORMAYDI, faqat "borib o'zing ol"
 * deydi. Sabab: yuborilgan payload'ga ishonish yangi ishonch chegarasi
 * ochardi — sirni bilgan har kim o'ziga xohlagan tarifni yozib
 * qo'yolardi. Bu yerda esa eng yomon holat "keraksiz heartbeat".
 *
 * Natijada YO'NALISH O'ZGARMAYDI: limitlarni doim tenant TORTIB OLADI,
 * sim ustidagi shakl va autentifikatsiya ham o'sha-o'sha
 * (`x-heartbeat-secret`). Yangi kod — faqat turtki.
 *
 * ⚠ `send()` HECH QACHON XATO TASHLAMAYDI, shuning uchun bu endpoint
 * admin panel o'chib qolgan holatda ham 200 qaytaradi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Controller('internal/entitlements')
export class InternalEntitlementsController {
  constructor(
    private readonly heartbeat: UsageHeartbeatJob,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /**
   * ⚠ DOIMIY VAQTLI SOLISHTIRISH. Oddiy `!==` sirni belgima-belgi
   * taxmin qilishga yo'l ochadi; uzunliklar farq qilsa `timingSafeEqual`
   * o'zi xato tashlaydi, shuning uchun avval uzunlik tekshiriladi.
   */
  private assertSecret(provided: string | undefined): void {
    const expected = String(
      this.config.get('HEARTBEAT_SECRET', { infer: true }) ?? '',
    );
    // Sir sozlanmagan bo'lsa endpoint UMUMAN yopiq — "bo'sh sir" bilan
    // kirishga yo'l qo'yilmaydi.
    if (!expected) throw new ApiError(404, 'Topilmadi');

    const a = Buffer.from(String(provided ?? ''));
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new ApiError(401, 'Ruxsat yo\'q');
    }
  }

  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Headers('x-heartbeat-secret') secret?: string,
  ): Promise<{ refreshed: boolean }> {
    this.assertSecret(secret);
    const data = await this.heartbeat.send();
    return { refreshed: data !== null };
  }
}
