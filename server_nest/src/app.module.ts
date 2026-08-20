import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.validation.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { CommonModule } from './common/common.module.js';
import { HealthModule } from './health/health.module.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ILDIZ MODUL — FAZA 1 (poydevor).
 *
 * FAZA 2.1: `CommonModule` qo'shildi — RBAC servislari, qo'riqchilar,
 * auth middleware, xato filtri va zod pipe'i.
 *
 * BIZNES MODULI HALI YO'Q. Auth/users/roles marshrutlari Faza 2.3+ da
 * qo'shiladi; hozircha butun trafik Express'da (5000-port) qoladi.
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
    CommonModule,
    HealthModule,
  ],
})
export class AppModule {}
