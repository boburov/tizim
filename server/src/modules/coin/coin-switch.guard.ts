import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ApiError } from '../../common/errors/api-error.js';
import { CoinSettingsService } from './coin-settings.service.js';

export const COIN_SWITCH_BYPASS = 'coin_switch_bypass';
export const MARKET_SWITCH_KEY = 'coin_switch_market';

/**
 * SOZLAMA MARSHRUTLARI O'CHIRGICHDAN OZOD.
 *
 * ⚠ BUSIZ TIZIM O'ZINI QULFLAB QO'YARDI: owner bo'limni o'chirgach
 * `PATCH /coins/settings` ning o'zi ham 404 bera boshlardi va uni
 * QAYTA YOQISHNING YO'LI QOLMASDI (bazaga qo'lda kirishdan boshqa).
 */
export const BypassCoinSwitch = () => SetMetadata(COIN_SWITCH_BYPASS, true);

/** Marshrut MARKET ham ochiq bo'lishini talab qiladi. */
export const RequiresMarket = () => SetMetadata(MARKET_SWITCH_KEY, true);

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ASOSIY O'CHIRGICH.
 *
 * ── NEGA 404, 403 EMAS ──
 * Talab: o'chirilganda bo'lim "hech kimga ko'rinmasin va ishlamasin".
 * 403 "bu yerda nimadir bor, lekin sizga ruxsat yo'q" degani — ya'ni
 * bo'lim MAVJUDLIGI baribir bilinadi va foydalanuvchi ruxsat so'rab
 * adminni bezovta qiladi. 404 esa "bunday bo'lim yo'q" deydi va bu
 * o'chirilgan holat uchun to'g'ri javob.
 *
 * ── QO'RIQCHI YAGONA HIMOYA EMAS ──
 * Tanga hisoblash ilgaklari (`awardForAttendance`) sozlamani O'ZI ham
 * tekshiradi. Sabab: ular HTTP marshruti orqali emas, davomat
 * servisidan chaqiriladi — qo'riqchi u yerga umuman yetib bormaydi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class CoinSwitchGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly settings: CoinSettingsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const bypass = this.reflector.getAllAndOverride<boolean>(COIN_SWITCH_BYPASS, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (bypass) return true;

    const config = await this.settings.get();
    if (!config.isEnabled) {
      throw new ApiError(404, "Bu bo'lim o'chirilgan");
    }

    const needsMarket = this.reflector.getAllAndOverride<boolean>(MARKET_SWITCH_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (needsMarket && !config.marketEnabled) {
      throw new ApiError(404, "Market o'chirilgan");
    }

    return true;
  }
}
