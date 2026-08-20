import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.validation.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { HealthModule } from './health/health.module.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ILDIZ MODUL — FAZA 1 (poydevor).
 *
 * BU YERDA BIZNES MODULI YO'Q — va bo'sh modul ham yaratilmadi.
 * `common/` ning bo'sh pastki papkalari ham yaratilmadi: ular Faza 3 da,
 * ichiga qo'yiladigan narsa paydo bo'lganda tug'iladi (qo'riqchilar,
 * filtrlar, `ZodValidationPipe`). Bo'sh papka arxitekturani "tayyor"
 * ko'rsatadi-yu, hech narsa qilmaydi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      // `.env` BITTA joyda — `server/.env`. Nusxa OLINMADI: ikki fayl
      // muqarrar ravishda bir-biridan uzoqlashadi va ikki ilova bir xil
      // sozlama bilan boshqacha ishlay boshlaydi.
      // `server_nest/.env` bo'lsa u USTUN turadi (lokal override uchun).
      envFilePath: ['.env', '../server/.env'],
      validate: validateEnv,
      // Tekshirilgan va hosila qiymatlar keshlanadi.
      cache: true,
    }),
    PrismaModule,
    HealthModule,
  ],
})
export class AppModule {}
