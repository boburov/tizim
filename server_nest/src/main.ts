import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import type { AppConfig } from './config/env.validation.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NestJS POYDEVORI — ISHGA TUSHIRISH.
 *
 * FAZA 1: bu ilova TRAFIKNI OLMAYDI. Express (`server/`, 5000-port)
 * avvalgidek ishlayveradi; bu jarayon FAQAT poydevorni tekshirish uchun
 * alohida portda ko'tariladi.
 *
 * SHU SABABLI BU YERDA GLOBAL PIPE/FILTER/INTERCEPTOR YO'Q. Ular Faza 3
 * ning ishi va ular hozir qo'shilsa — hech qanday biznes marshruti
 * yo'q holatda — faqat tekshirilmagan xatti-harakat bo'lardi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
async function bootstrap(): Promise<void> {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule, { bufferLogs: false });

  // `<AppConfig, true>`: ikkinchi generik "WasValidated" — `validate()`
  // hamma kalitni to'ldirib qaytargani uchun `get()` `undefined` bermaydi.
  const config = app.get<ConfigService<AppConfig, true>>(ConfigService);
  const get = <K extends keyof AppConfig>(key: K): AppConfig[K] =>
    config.get(key, { infer: true });

  const isProd = get('isProd');

  // ── Marshrut prefiksi: Express bilan bir xil (`/api/...`) ──
  app.setGlobalPrefix('api');

  // ── Tana hajmi: Express `app.js` dagi bilan bir xil chegara ──
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: true }));

  // ── CORS: Express `app.js` mantig'ining aynan ko'chirmasi ──
  const clientUrls = get('CLIENT_URLS');
  const allowAll = get('ALLOW_ALL_ORIGINS');
  app.enableCors({
    origin: (
      origin: string | undefined,
      cb: (err: Error | null, allow?: boolean) => void,
    ) => {
      // Dev rejimida har qanday localhost porti (Vite 5173/5174/...) o'tadi.
      const isLocalhost =
        !isProd &&
        /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin || '');
      if (!origin || allowAll || clientUrls.includes(origin) || isLocalhost) {
        return cb(null, true);
      }
      // Xato TASHLANMAYDI — origin shunchaki rad etiladi, shunda
      // preflight 500 emas, toza javob qaytaradi (Express bilan bir xil).
      cb(null, false);
    },
    credentials: true,
  });

  // ── XATO FORMATI: Express `errorHandler` bilan AYNAN bir xil ──
  //
  // `{ success:false, message, code?, details? }`. Global filtr bu yerda
  // XAVFSIZ: NestJS alohida jarayon, ya'ni Express'ga ta'sir qilmaydi.
  // Global PIPE esa hamon YO'Q — validatsiya zod sxemalari bilan,
  // marshrut darajasida bo'ladi (Faza 2.3+).
  app.useGlobalFilters(new AllExceptionsFilter(isProd));

  // ── Tartibli to'xtatish ──
  // Buni yoqmasak `PrismaModule.onApplicationShutdown` HECH QACHON
  // chaqirilmaydi va ulanish hovuzi ochiq qolib ketardi.
  app.enableShutdownHooks();

  const port = get('NEST_PORT');
  await app.listen(port);
  logger.log(
    `NestJS poydevori ${port}-portda ishga tushdi ` +
      `(Express ${get('PORT')}-portda tegilmagan holda ishlayapti)`,
  );
}

bootstrap().catch((err) => {
  // Ishga tushmasa sabab KO'RINISHI shart — jimgina chiqib ketish
  // "port band" va "ENV yo'q" ni farqlab bo'lmaydigan holatga solardi.
  new Logger('Bootstrap').error('NestJS ishga tushmadi', err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
