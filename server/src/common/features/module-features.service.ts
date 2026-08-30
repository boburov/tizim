import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { EntitlementsService } from '../entitlements/entitlements.service.js';
import type { AppConfig } from '../../config/env.validation.js';
import { ALL_FEATURE_KEYS, featureChain } from './feature-registry.js';

/**
 * Aloqasiz qolish MUHLATI — 72 soat.
 *
 * Shu muddat ichida oxirgi ma'lum holat ishlatiladi, keyin darvozalar
 * YOPILADI. Ikki xatoning oralig'i: juda qisqa bo'lsa bizning tarmoq
 * nosozligimiz mijozni bloklaydi, juda uzun bo'lsa to'lamagan loyiha
 * haftalab bepul ishlaydi.
 */
export const MODULE_GRACE_MS = 72 * 60 * 60 * 1000;

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MODUL DARVOZASI — "bu bo'lim shu loyihada BORMI".
 *
 * ── ⚠ NEGA `EntitlementsService.isFeatureEnabled` ISHLATILMAYDI ──
 *
 * U ATAYLAB OCHIQ YIQILADI: kalit kelmasa "ha" deydi. Bu LIMITLAR uchun
 * to'g'ri (`max_users` — bizning tarmoq muammomiz mijozni bloklamasin) va
 * `ai` moduli aynan shunga tayanadi — uning tannarxi BYUDJET qatlamida,
 * yopiq holda ushlanadi.
 *
 * MODUL darvozasi uchun esa ochiq yiqilish PUL TESHIGI: admin server
 * o'chib qolsa HAR BIR loyiha HAR BIR pullik bo'limni bepul olardi.
 * Shuning uchun bu yerda ALOHIDA metod bor va u YOPIQ yiqiladi —
 * `isFeatureEnabled` ning ma'nosi O'ZGARTIRILMAYDI.
 *
 * ── ⚠ PROVISION QILINMAGAN O'RNATMADA DARVOZA UMUMAN YO'Q ──
 *
 * `ADMIN_API_URL` + `TENANT_ID` + `HEARTBEAT_SECRET` bo'lmasa loyiha
 * boshqaruv paneliga UMUMAN ulanmagan (lokal ishlab chiqish, standalone
 * o'rnatma). Bunda heartbeat ham o'chiq, ya'ni kesh HECH QACHON
 * to'lmaydi va yopiq yiqilish butun ilovani qorong'i qilardi. Shuning
 * uchun bu holatda darvoza INERT — hamma bo'lim ochiq.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class ModuleFeaturesService {
  private readonly logger = new Logger('ModuleFeatures');

  constructor(
    private readonly entitlements: EntitlementsService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /**
   * Loyiha boshqaruv paneliga ulanganmi. Heartbeat job'dagi
   * `isConfigured()` bilan AYNAN bir xil shart — ikkisi bir-biridan
   * ajralib qolsa darvoza kesh to'lmaydigan joyda yopilib qolardi.
   */
  private isGated(): boolean {
    return Boolean(
      this.config.get('ADMIN_API_URL', { infer: true }) &&
        this.config.get('TENANT_ID', { infer: true }) &&
        this.config.get('HEARTBEAT_SECRET', { infer: true }),
    );
  }

  /** Kesh muhlati o'tganmi (yoki umuman to'lmaganmi). */
  private isStale(): boolean {
    const { updatedAt } = this.entitlements.get();
    if (!updatedAt) return true;
    return Date.now() - updatedAt.getTime() > MODULE_GRACE_MS;
  }

  /**
   * Bo'lim shu loyihada ochiqmi.
   *
   * OTA ZANJIRI to'liq tekshiriladi: `imports.finance` ochiq bo'lishi
   * uchun `imports` ham ochiq bo'lishi SHART. Bu qoida shu yerda
   * majburlanadi — reyestrda "otasi o'chiq, bolasi ochiq" holatini
   * yozib qo'yish MUMKIN EMAS.
   */
  isModuleEnabled(key: string): boolean {
    if (!this.isGated()) return true;
    if (this.isStale()) return false;

    const { limits } = this.entitlements.get();
    for (const link of featureChain(key)) {
      const value = limits[link];
      // ⚠ Kalit YO'Q bo'lsa — O'CHIQ. Yangi kalit hech qachon tasodifan
      // bepul tarqalmasligi uchun standart holat shu.
      if (typeof value !== 'number' || value <= 0) return false;
    }
    return true;
  }

  /**
   * Reyestrdagi hamma kalitning yechilgan holati — `GET /features` va
   * mijoz UI'si uchun.
   */
  enabledMap(): Record<string, boolean> {
    const out: Record<string, boolean> = {};
    for (const key of ALL_FEATURE_KEYS) out[key] = this.isModuleEnabled(key);
    return out;
  }

  /** Diagnostika: darvoza nima uchun yopiq. Dev panel va log uchun. */
  diagnostics(): {
    gated: boolean;
    stale: boolean;
    updatedAt: Date | null;
    planKey: string | null;
  } {
    const { updatedAt, planKey } = this.entitlements.get();
    return { gated: this.isGated(), stale: this.isStale(), updatedAt, planKey };
  }
}
