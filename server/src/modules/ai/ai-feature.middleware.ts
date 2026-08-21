import { Injectable, NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { ApiError } from '../../common/errors/api-error.js';
import { EntitlementsService } from '../../common/entitlements/entitlements.service.js';
import { AI_FEATURE_KEY } from './ai-budget.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TARIF DARVOZASI — `ai.routes.js` dagi
 * `router.use(requireFeature(AI_FEATURE_KEY, "AI maslahatchi"))` ning
 * KO'CHIRMASI.
 *
 * ── ⚠ NEGA GUARD EMAS, MIDDLEWARE ──
 * Express'da bu tekshiruv `requireAuth` DAN OLDIN turadi (router
 * darajasida), ya'ni tarifda AI bo'lmasa autentifikatsiyasiz so'rov ham
 * 402 oladi, 401 emas. NestJS'da guard'lar middleware'dan KEYIN
 * ishlaydi — guard qilib yozilsa kod 402 o'rniga 401 bo'lib qolardi.
 * Shuning uchun u middleware va `AuthMiddleware` DAN OLDIN ulanadi.
 *
 * ── ⚠ MODUL DARAJASIDA, MARSHRUT DARAJASIDA EMAS ──
 * Shu modulga keyin qo'shiladigan har qanday endpoint AVTOMATIK yopiq
 * bo'ladi. Bitta marshrutda yozishni unutish — paywall'ni jimgina
 * teshib qo'yishning eng oson yo'li.
 *
 * ── ⚠ OCHIQ YIQILADI (ATAYLAB) ──
 * Admin server bilan aloqa uzilsa entitlements keshida kalit bo'lmaydi
 * va `isFeatureEnabled` "ha" deydi. To'lagan mijozning sahifasini
 * BIZNING tarmoq muammomiz uchun o'chirib qo'yish mumkin emas. Xarajat
 * esa bu yerda emas, BYUDJET qatlamida ushlanadi — u YOPIQ yiqiladi
 * (`ai-budget.service.ts`).
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class AiFeatureMiddleware implements NestMiddleware {
  constructor(private readonly entitlements: EntitlementsService) {}

  use(_req: Request, _res: Response, next: NextFunction): void {
    if (this.entitlements.isFeatureEnabled(AI_FEATURE_KEY)) return next();
    next(
      new ApiError(402, "AI maslahatchi tarifingizda mavjud emas", {
        code: 'FEATURE_NOT_AVAILABLE',
        details: { featureKey: AI_FEATURE_KEY },
      }),
    );
  }
}
