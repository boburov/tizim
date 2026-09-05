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
 * Pastdagi `NEVER_GATED` — bu faylning eng muhim qatori. Izohi o'sha
 * yerda.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * HECH QACHON TO'SILMAYDIGAN PREFIKSLAR
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ⚠ BU RO'YXAT QO'LDA YOZILGAN VA SHUNDAY QOLISHI KERAK.
 *
 * `feature-registry.ts` GENERATSIYA qilinadi va uning `locked` bayrog'i
 * ham xuddi shu himoyani beradi. Ikkinchi qatlam ataylab: generatorda
 * yoki META jadvalida bitta xato — va tenant TIKLANMAS holatga tushadi.
 *
 * Har bir prefiks nega shu yerda:
 *
 *   `features`               — bu endpoint o'chsa mijoz NIMA o'chganini
 *                              bilolmaydi: bo'lim ham yo'q, sababi ham
 *                              yo'q. Ekran shunchaki bo'sh.
 *   `internal/entitlements`  — admin serverning turtkisi. O'chsa
 *                              yangilanish faqat 15 daqiqalik heartbeat
 *                              bilan keladi; heartbeat ham yiqilsa
 *                              tenantni tashqaridan TUZATIB BO'LMAYDI.
 *   `auth`                   — o'chsa tenantga hech kim, hatto ega ham
 *                              kira olmaydi.
 *   `health`                 — monitoring. Reyestrda umuman yo'q
 *                              (`src/health` `src/modules` ichida emas),
 *                              ya'ni bu qator hozir ortiqcha — lekin
 *                              modul ko'chirilsa kerak bo'ladi.
 *
 * ⚠ BU RO'YXATGA "shunchaki muhim" bo'lim QO'SHMANG. Mezon bitta:
 * o'chirilsa TIKLASH YO'LI YO'QOLADIMI. Yo'qolmasa — bu oddiy modul.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const NEVER_GATED: readonly string[] = Object.freeze([
  'features',
  'internal/entitlements',
  // Dev panel tenantning holatini SHU kanal orqali ko'radi. O'chsa,
  // platforma egasi markazning tirikligini ham, o'lchovlarini ham
  // yo'qotadi — ya'ni nosozlikni aynan eng kerak paytda ko'rmaydi.
  // `internal/entitlements` bilan bir toifada: infratuzilma kanali,
  // mijozga sotiladigan bo'lim emas.
  'internal/analytics',
  'auth',
  'health',
]);

/** Yo'l `NEVER_GATED` prefikslaridan biriga tushadimi. */
const isNeverGated = (path: string): boolean => {
  const clean = path.replace(/^\/+/, '');
  return NEVER_GATED.some(
    (prefix) => clean === prefix || clean.startsWith(`${prefix}/`),
  );
};
export const mountGlobalFeatureGate = (app: INestApplication): void => {
  const features = app.get(ModuleFeaturesService);
  const logger = new Logger('FeatureGate');

  app.use((req: Request, res: Response, next: NextFunction) => {
    // ⚠ Global prefiks olib tashlanadi: bu middleware Nest
    // yo'naltirishidan OLDIN turadi, ya'ni yo'l hali `/api/...` holida.
    const path = req.path.replace(/^\/api(?=\/|$)/, '');

    // ⚠ Reyestrdan OLDIN: bu tekshiruv generator xatosidan ham himoya
    // qiladi (izohi `NEVER_GATED` ustida).
    if (isNeverGated(path)) return next();

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
