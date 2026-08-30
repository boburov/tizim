import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { json, urlencoded } from 'express';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { generalLimiter } from './common/middleware/rate-limit.js';
import type { AppConfig } from './config/env.validation.js';
import { mountGlobalFeatureGate } from './common/features/global-feature-gate.js';

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

  // ═══════════════════════════════════════════════════════════════════
  // ⚠ `trust proxy` — EXPRESS `app.js` DAN KO'CHIB QOLGAN EDI.
  //
  // Express: `app.set("trust proxy", 1)`. Bu `req.ip` ni SOKET manzili
  // emas, `X-Forwarded-For` ning OXIRGI yozuvidan oladi — ya'ni nginx
  // qo'shgan HAQIQIY mijoz IP'si.
  //
  // ── BU NEGA XAVFSIZLIK MASALASI, "sozlama" EMAS ──
  //
  // `req.ip` UCHTA joyda ishlaydi:
  //   1. `authLimiter` kaliti (login brute-force himoyasi);
  //   2. `refresh_tokens.ip` (sessiya kimdan ochilgani);
  //   3. audit jurnali.
  //
  // Uni ko'chirmaslik JIMGINA, lekin OG'IR oqibat berardi: nginx ortida
  // BARCHA foydalanuvchi bitta IP (proksi manzili) ko'rinardi, ya'ni
  // `authLimiter` ning 20/5daq byudjeti UMUMIY bo'lardi. Bitta odam
  // 20 marta noto'g'ri parol kiritsa — BUTUN MARKAZ 5 daqiqaga login
  // qila olmasdi. Bu himoya emas, XIZMATNI RAD ETISH.
  //
  // Sessiya va audit yozuvlari ham har doim proksi IP'sini ko'rsatib,
  // "kim qayerdan kirdi" degan savolga javob bera olmasdi.
  //
  // ⚠ QIYMAT EXPRESS BILAN AYNAN BIR XIL (`1`) BO'LISHI SHART. Uni
  // "qattiqlashtirish" (`false`) yuqoridagi umumiy-byudjet muammosini
  // qaytaradi; oshirish esa mijoz uzatgan yozuvlarga ishonishni
  // boshlaydi. Bu — MAHSULOT qarori, ko'chirish qarori emas.
  //
  // ⚠ `app.set()` `INestApplication` da YO'Q — u Express'ga xos. Shuning
  // uchun ostidagi haqiqiy Express nusxasi olinadi.
  (app.getHttpAdapter().getInstance() as { set: (k: string, v: unknown) => void })
    .set('trust proxy', 1);

  // ── Marshrut prefiksi: Express bilan bir xil (`/api/...`) ──
  app.setGlobalPrefix('api');

  // ── TARIF DARVOZASI — HAMMA MARSHRUTDAN OLDIN ──
  //
  // ⚠ AUTENTIFIKATSIYADAN OLDIN turishi SHART: aks holda tarifda
  // bo'lmagan bo'lim 402 emas, 401 qaytarardi va mijoz "tizimga kiring"
  // degan noto'g'ri xabar ko'rardi.
  mountGlobalFeatureGate(app);

  // ── Tana hajmi: Express `app.js` dagi bilan bir xil chegara ──
  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: true }));

  // ── COOKIE: refresh token IMZOLANGAN cookie'da yuboriladi ──
  //
  // Sir Express bilan BIR XIL bo'lishi SHART (`COOKIE_SECRET`): aks
  // holda bir stek qo'ygan cookie ikkinchisida imzo tekshiruvidan
  // o'tmasdi va `/auth/refresh` "Sessiya topilmadi" berardi. Ikkala
  // stek ham bitta `.env` ni o'qigani uchun sir tabiiy ravishda bir xil.
  app.use(cookieParser(get('COOKIE_SECRET')));

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

  // ═══════════════════════════════════════════════════════════════════
  // B25 — UMUMIY TEZLIK CHEGARASI (`generalLimiter`).
  //
  // Express `app.js:50`: `app.use(generalLimiter)` — 200 so'rov / 60s,
  // BUTUN ilovaga (`/api` prefiksidan ham tashqarida). NestJS'da
  // `common/middleware/rate-limit.ts` da E'LON QILINGAN edi, lekin
  // HECH QAYERGA ULANMAGAN — ya'ni NestJS'da umumiy chegara YO'Q edi.
  //
  // O'LCHANDI (taxmin emas): bitta IP'dan 230 so'rov —
  //   express: 201-so'rovda 429 (`ratelimit-limit: 200, remaining: 0`)
  //   nest   : 230/230 ta 200 — chegara umuman ishlamadi.
  //
  // ── JOYLASHUV NEGA AYNAN SHU YERDA ──
  //
  // Express tartibi: cors → compression → json → urlencoded →
  // cookieParser → generalLimiter → `/api` router. Ya'ni CORS
  // `generalLimiter` DAN OLDIN turadi va preflight (`OPTIONS`)
  // so'rovi `cors` da 204 bilan TUGAYDI — `next()` chaqirilmaydi,
  // demak preflight chegara byudjetini YEMAYDI.
  //
  // `app.enableCors()` (yuqorida) cors middleware'ini O'SHA ZAHOTI
  // ostidagi Express nusxasiga qo'yadi. Shuning uchun bu satr undan
  // KEYIN turishi SHART: aks holda NestJS'da preflight byudjetni
  // yeb, Express'da esa yemasdi — jimgina chegara farqi.
  //
  // ⚠ Kalit `req.ip` — ya'ni yuqoridagi `trust proxy: 1` ga TAYANADI.
  // U olib tashlansa chegara nginx ortida UMUMIY bo'lib qolardi
  // (bitta mijoz butun markazni bloklardi). `test/rate-limit-parity`
  // ikkalasini ham (chegara ISHLAYDI + BOSHQA IP ta'sirlanmaydI)
  // o'lchaydi.
  //
  // ⚠ HISOBLAGICH JARAYONGA XOS: ikki stek birga ishlaganda umumiy
  // byudjet ikki barobar ko'rinadi. Cutover'dan keyin yagona jarayon
  // qoladi va chegara yana aniq bo'ladi.
  // ═══════════════════════════════════════════════════════════════════
  app.use(generalLimiter);

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

  // ⚠ XABAR HOLATNI ROSTGO'YLIK BILAN AYTADI. Ilgari u shartsiz
  // "Express tegilmagan holda ishlayapti" derdi — cutover'dan keyin bu
  // YOLG'ON bo'lib qoldi. Yolg'on jurnal xabari eng yomon turdagi
  // hujjat: uni o'qigan odam noto'g'ri xulosa chiqaradi.
  const expressPort = get('PORT');
  logger.log(
    port === expressPort
      ? `NestJS ${port}-portda ASOSIY server sifatida ishga tushdi ` +
          '(Express bu portni BO\'SHATGAN bo\'lishi SHART)'
      : `NestJS ${port}-portda ishga tushdi ` +
          `(Express ${expressPort}-portda alohida ishlayapti)`,
  );
}

bootstrap().catch((err) => {
  // Ishga tushmasa sabab KO'RINISHI shart — jimgina chiqib ketish
  // "port band" va "ENV yo'q" ni farqlab bo'lmaydigan holatga solardi.
  new Logger('Bootstrap').error('NestJS ishga tushmadi', err instanceof Error ? err.stack : String(err));
  process.exit(1);
});
