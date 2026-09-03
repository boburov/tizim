import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import passport from 'passport';
import { AppModule } from './app.module.js';
import { uploadsDir } from './uploads/tenant-logo.service.js';

async function bootstrap() {
  // ⚠ Tip parametri `useStaticAssets` uchun kerak — yuklangan logolar
  // shu orqali beriladi (pastda). Nest'ning O'Z express nusxasi
  // ishlatiladi, ya'ni ikkinchi `express` bog'lamasi kerak emas.
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  app.use(helmet());

  // ═══════════════════════════════════════════════════════════════════════
  // YUKLANGAN FAYLLAR — OCHIQ, GLOBAL PREFIKSDAN TASHQARIDA
  // ═══════════════════════════════════════════════════════════════════════
  //
  // Tenant logosi TENANT BRAUZERIDAN yuklanadi (`VITE_APP_LOGO`), ya'ni
  // URL ochiq va absolyut bo'lishi shart. `/api` prefiksi qo'yilmaydi:
  // bu API emas, statik resurs.
  //
  // ── ⚠ `Cross-Origin-Resource-Policy` MAJBURIY ──
  //
  // Yuqoridagi `helmet()` standart holda `same-origin` qo'yadi. Tenant
  // sayti (`markaz.example.uz`) admin domenidagi rasmni so'raganda
  // BRAUZER UNI BLOKLAYDI: rasm o'rnida bo'shliq qoladi, server esa 200
  // qaytargan bo'ladi. Konsoldagi xabar ham unchalik ko'zga tashlanmaydi
  // — bu ish oqimidagi eng ehtimoliy JIM nosozlik.
  //
  // `immutable` xavfsiz: fayl nomi MAZMUN hash'idan yasaladi, ya'ni
  // boshqa rasm — boshqa URL.
  app.useStaticAssets(uploadsDir(), {
    prefix: '/uploads',
    immutable: true,
    maxAge: '1y',
    index: false,
    dotfiles: 'deny',
    setHeaders: (res: { setHeader: (k: string, v: string) => void }) => {
      res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    },
  });
  app.use(cookieParser(process.env.COOKIE_SECRET));
  // Google OAuth marshrutlari passport.authenticate() ni to'g'ridan-to'g'ri
  // chaqiradi - shuning uchun initialize() shart (sessiyasiz).
  app.use(passport.initialize());
  app.setGlobalPrefix('api');

  // Vergul bilan ajratilgan admin panel domenlari
  const origins = (process.env.ADMIN_CLIENT_URL || 'http://localhost:5174')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  app.enableCors({
    origin: origins,
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  const port = Number(process.env.PORT || 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`🛡️  Admin server ${port}-portda ishga tushdi`);
}

bootstrap();
