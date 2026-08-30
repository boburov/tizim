import { Injectable, type NestMiddleware, type Type } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../errors/api-error.js';
import { FEATURE_BY_KEY } from './feature-registry.js';
import { ModuleFeaturesService } from './module-features.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MODUL DARVOZASI — MIDDLEWARE FABRIKASI.
 *
 * ── ⚠ NEGA GUARD EMAS, MIDDLEWARE ──
 *
 * Aynan `ai-feature.middleware.ts` dagi sabab. NestJS'da guard'lar
 * middleware'dan KEYIN ishlaydi, ya'ni `AuthMiddleware` dan ham keyin.
 * Guard qilib yozilsa tarifda bo'lmagan bo'limga autentifikatsiyasiz
 * so'rov 402 emas, 401 olardi — mijoz "tizimga kiring" degan xabar
 * ko'rib, aslida tarifi yetmasligini bilmasdi.
 *
 * ── ⚠ MODUL DARAJASIDA, MARSHRUT DARAJASIDA EMAS ──
 *
 * `forRoutes(Controller)` bilan ulanadi, ya'ni shu kontrollerga KEYIN
 * qo'shiladigan har qanday endpoint AVTOMATIK yopiq bo'ladi. Har
 * marshrutga dekorator qo'yish shakli — paywall'ni jimgina teshib
 * qo'yishning eng oson yo'li: bitta yangi endpoint'da unutish yetarli.
 *
 * ── ⚠ O'ZINI QULFLAB QO'YMASLIK ──
 *
 * Bo'limni QAYTA YOQADIGAN marshrut darvoza ORTIDA QOLMASIN. Middleware
 * bo'lgani uchun bu `@Bypass...` dekoratori bilan emas,
 * `consumer.apply(...).exclude(...)` bilan qilinadi. `coin-switch.guard.ts`
 * dagi `@BypassCoinSwitch()` xuddi shu muammoni hal qiladi — usiz owner
 * bo'limni o'chirgach uni ochadigan sozlama marshruti ham yopilib,
 * bazaga qo'lda kirishdan boshqa yo'l qolmasdi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export function FeatureGate(featureKey: string): Type<NestMiddleware> {
  const label = FEATURE_BY_KEY.get(featureKey)?.label ?? featureKey;

  @Injectable()
  class FeatureGateMiddleware implements NestMiddleware {
    constructor(private readonly features: ModuleFeaturesService) {}

    use(_req: Request, _res: Response, next: NextFunction): void {
      if (this.features.isModuleEnabled(featureKey)) return next();
      next(
        new ApiError(402, `${label} tarifingizda mavjud emas`, {
          code: 'FEATURE_NOT_AVAILABLE',
          details: { featureKey },
        }),
      );
    }
  }

  return FeatureGateMiddleware;
}
