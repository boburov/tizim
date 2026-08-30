import { Injectable, Logger } from '@nestjs/common';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TARIF LIMITLARI KESHI — `server/src/config/entitlements.js` KO'CHIRMASI.
 *
 * Limitlar admin serverdan heartbeat JAVOBI orqali keladi va shu yerda
 * xotirada turadi. Tekshiruv MAHALLIY bo'ladi — admin server o'chib qolsa
 * ham tenant oxirgi ma'lum limitlar bilan ishlashda davom etadi.
 *
 * ⚠ STANDART QIYMAT — "CHEKSIZ"/"YOQILGAN", ya'ni OCHIQ YIQILISH.
 * Aloqa yo'qolganda tenantni bloklab qo'yish qabul qilib bo'lmaydigan
 * holat: to'lagan mijozning sahifasi bizning tarmoq nosozligimiz tufayli
 * o'chib qolardi.
 *
 * ── ⚠ IKKI JARAYON, IKKI KESH ──
 *
 * Express va NestJS alohida jarayonlar, ya'ni bu kesh ULARDA ALOHIDA.
 * Hozir bu zararsiz: heartbeat'ni FAQAT bittasi yuboradi
 * (`NEST_WORKERS_ENABLED`), demak faqat o'sha jarayonning keshi
 * to'ldiriladi va limit tekshiruvi ham o'sha jarayonda bo'ladi.
 * Cutover'dan keyin yagona jarayon qoladi va savol umuman yo'qoladi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export const UNLIMITED = -1;

export interface EntitlementsPayload {
  planKey?: string | null;
  subscriptionActive?: boolean;
  limits?: Record<string, number>;
  exceeded?: string[];
}

export interface EntitlementsState {
  planKey: string | null;
  subscriptionActive: boolean;
  limits: Record<string, number>;
  exceeded: string[];
  updatedAt: Date | null;
}

@Injectable()
export class EntitlementsService {
  private readonly logger = new Logger('Entitlements');

  private state: EntitlementsState = {
    planKey: null,
    subscriptionActive: true,
    limits: {},
    exceeded: [],
    updatedAt: null,
  };

  /**
   * @param receivedAt Javob ASLIDA qachon kelgani. Standart — hozir.
   *
   * ⚠ Bu parametr FAQAT bazadan tiklashda beriladi
   * (`EntitlementCacheStore`). Usiz qayta ishga tushish har safar
   * "yangi" holat yasab, modul darvozalarining 72 soatlik muhlatini
   * cheksiz uzaytirardi.
   */
  set(
    payload: EntitlementsPayload | null | undefined,
    receivedAt: Date = new Date(),
  ): void {
    if (!payload || typeof payload !== 'object') return;
    this.state = {
      planKey: payload.planKey ?? null,
      // ⚠ `!== false` — kelmagan bo'lsa FAOL deb hisoblanadi (ochiq yiqilish).
      subscriptionActive: payload.subscriptionActive !== false,
      limits:
        payload.limits && typeof payload.limits === 'object' ? payload.limits : {},
      exceeded: Array.isArray(payload.exceeded) ? payload.exceeded : [],
      updatedAt: receivedAt,
    };
    this.logger.debug(`Entitlements yangilandi (plan: ${this.state.planKey})`);
  }

  get(): EntitlementsState {
    return this.state;
  }

  /** Raqamli limit. Kelmagan bo'lsa cheksiz. */
  getLimit(key: string): number {
    const v = this.state.limits[key];
    return typeof v === 'number' ? v : UNLIMITED;
  }

  /** BOOLEAN imkoniyat yoqilganmi (masalan `telegram_bot`, `ai_advisor`). */
  isFeatureEnabled(key: string): boolean {
    const v = this.state.limits[key];
    // Kelmagan bo'lsa — yoqilgan (aloqa yo'qolganda bloklamaymiz).
    if (typeof v !== 'number') return true;
    return v > 0;
  }

  /**
   * Limit oshganmi. Yangi yozuv qo'shishdan OLDIN chaqiriladi, shuning
   * uchun `>=` (Express bilan aynan bir xil).
   */
  isLimitExceeded(key: string, current: number): boolean {
    const limit = this.getLimit(key);
    if (limit === UNLIMITED) return false;
    return Number(current) >= limit;
  }
}
