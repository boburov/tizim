import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.validation.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { CommonModule } from './common/common.module.js';
import { HealthModule } from './health/health.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { RolesModule } from './modules/roles/roles.module.js';
import { UsersModule } from './modules/users/users.module.js';
import { BranchesModule } from './modules/branches/branches.module.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ILDIZ MODUL — FAZA 1 (poydevor).
 *
 * FAZA 2.1: `CommonModule` qo'shildi — RBAC servislari, qo'riqchilar,
 * auth middleware, xato filtri va zod pipe'i.
 *
 * FAZA 2.2: birinchi marshrutlar ulandi (rollar o'qish, parol o'qish).
 * Trafik hamon Express'da (5000-port) — NestJS faqat tekshiruv uchun
 * 5001-portda turadi.
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
    // ── FAZA 2.3: auth moduli ──
    AuthModule,
    // ── FAZA 2.2: birinchi ko'chirilgan marshrutlar ──
    // Rollar — FAQAT O'QISH (mutatsiyalar Express'da qoladi).
    RolesModule,
    // ── FAZA 2.5a: foydalanuvchilar (14 marshrutdan 10 tasi) ──
    // Qolgan 4 tasi (staff yaratish, arxivlash, tiklash, butunlay
    // o'chirish) moliya/tasdiq modullariga tayanadi — FAZA 7/8 dan keyin.
    UsersModule,
    // ── FAZA 3: tashkiliy tuzilma ──
    BranchesModule,
  ],
})
export class AppModule {}
