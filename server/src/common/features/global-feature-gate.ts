import type { INestApplication } from '@nestjs/common';
import { Logger } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { FEATURE_BY_KEY, featureForPath } from './feature-registry.js';
import { ModuleFeaturesService } from './module-features.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GLOBAL TARIF DARVOZASI — BITTA JOYDA, HAMMA MARSHRUT UCHUN.
 *
 * ── ⚠ NEGA HAR MODULGA ALOHIDA EMAS ──
 *
 * 47 ta modulning har biriga `consumer.apply(FeatureGate(...))` yozish
 * mumkin edi. Lekin bittasini unutish — paywall'ni JIMGINA teshib
 * qo'yishning eng oson yo'li: yangi modul qo'shgan odam bu qadamni
 * bilmasligi mumkin va hech narsa buni ko'rsatmasdi. Markazlashgan
 * xarita esa unutilishi MUMKIN EMAS, va `feature-graph` testi har bir
 * prefiks haqiqiy kontrollerga tegishli ekanini tekshirib turadi.
 *
 * ── ⚠ NEGA `app.use`, Nest middleware EMAS ──
 *
 * Darvoza AUTENTIFIKATSIYADAN OLDIN ishlashi SHART. Aks holda tarifda
 * bo'lmagan bo'limga so'rov 402 emas, 401 olardi va mijoz "tizimga
 * kiring" degan noto'g'ri xabar ko'rardi (`ai-feature.middleware.ts`
 * dagi bilan bir xil sabab).
 *
 * Nest'da modullararo middleware tartibi modul ro'yxatdan o'tish
 * tartibiga bog'liq va uni ko'z bilan tekshirib bo'lmaydi. `app.use`
 * esa Express zanjirining ENG BOSHIGA qo'yiladi — kafolatlangan.
 *
 * ── ⚠ O'ZINI QULFLAB QO'YMASLIK ──
 *
 * `features` va `internal/entitlements` marshrutlari reyestrda `core`
 * deb belgilangan, ya'ni xaritaga UMUMAN tushmaydi. Usiz bo'lim
 * o'chirilgach mijoz nima o'chganini bilolmasdi va admin server
 * yangilash turtkisini yubora olmasdi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const mountGlobalFeatureGate = (app: INestApplication): void => {
  const features = app.get(ModuleFeaturesService);
  const logger = new Logger('FeatureGate');

  app.use((req: Request, res: Response, next: NextFunction) => {
    // ⚠ Global prefiks olib tashlanadi: bu middleware Nest
    // yo'naltirishidan OLDIN turadi, ya'ni yo'l hali `/api/...` holida.
    const path = req.path.replace(/^\/api(?=\/|$)/, '');
    const key = featureForPath(path);
    if (!key) return next();
    if (features.isModuleEnabled(key)) return next();

    const label = FEATURE_BY_KEY.get(key)?.label ?? key;
    logger.debug(`402 ${req.method} ${req.path} — "${key}" tarifda yo'q`);
    res.status(402).json({
      success: false,
      message: `${label} tarifingizda mavjud emas`,
      code: 'FEATURE_NOT_AVAILABLE',
      details: { featureKey: key },
    });
  });
};
