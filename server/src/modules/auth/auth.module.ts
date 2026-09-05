import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { UserProfileService } from './user-profile.service.js';
import { OptionalWiringCheck } from './optional-wiring.check.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';
import { authLimiter } from '../../common/middleware/rate-limit.js';

/**
 * ⚠ MIDDLEWARE FAQAT HIMOYALANGAN MARSHRUTLARGA ULANADI.
 *
 * `/login`, `/refresh`, `/logout` — OCHIQ (Express'da ham `requireAuth`
 * YO'Q). `/refresh` va `/logout` cookie bilan ishlaydi, access token
 * bilan emas: muddati o'tgan access token bilan ham sessiyani yangilash
 * mumkin bo'lishi SHART — aks holda token eskirgan zahoti foydalanuvchi
 * chiqib ketardi.
 */
/**
 * ═══════════════════════════════════════════════════════════════════════════
 * ⚠ BU MODULDA `imports` YO'Q — VA BU ATAYLAB.
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * Ilgari bu yerda beshta biznes moduli turardi:
 *
 *   GroupsModule         → o'quvchi va o'qituvchi profili
 *   AttendanceModule     → o'quvchi profilidagi oylik davomat xulosasi
 *   StudentFreezeModule  → o'quvchi muzlatilganmi
 *   TeacherSalaryModule  → `registerUser` da maosh stavkasi (ixtiyoriy)
 *   OpeningBalanceModule → `registerUser` da boshlang'ich qarz (ixtiyoriy)
 *
 * Ularning HECH BIRI autentifikatsiya uchun zarur emas — hammasi
 * boyitish yoki ixtiyoriy yon ta'sir. Lekin `feature-registry`
 * generatori import grafigini o'qiydi va buni "auth ularga TAYANADI"
 * deb yozardi. `auth` esa qulflangan (hech qachon o'chmaydi), ya'ni
 * to'siq mantig'i o'sha beshtasini ham abadiy o'chirilmaydigan qilib
 * qo'ygan edi:
 *
 *   attendance · finance · groups · opening-balance · student-freeze
 *
 * Beshtasi ham SOTILADIGAN modul — ya'ni "har bir feature sotiladi va
 * o'chiriladi" talabi jimgina buzilgan edi.
 *
 * ── HOZIR QANDAY ISHLAYDI ──
 *
 * `OptionalModuleService` (global, `CommonModule`) servisni ISH VAQTIDA
 * so'raydi va OLDIN tarifni tekshiradi. Modul o'chiq bo'lsa `null`
 * qaytadi, profildagi mos maydon bo'sh qoladi, `registerUser` esa yon
 * ta'sir so'ralgan bo'lsa 402 bilan OLDINDAN to'xtaydi (pul jimgina
 * yo'qolmasin).
 *
 * ⚠ IMPORTNI SHUNCHAKI OLIB TASHLASH YETARLI EMAS EDI. Tarif tekshiruvi
 * bo'lmasa grafik yolg'on gapirardi: `attendance` o'chirilgan tenantda
 * `/auth/me` javobida davomat xulosasi BARIBIR chiqardi. Batafsil izoh
 * `common/features/optional-module.service.ts` da.
 */
@Module({
  controllers: [AuthController],
  // ⚠ `OptionalWiringCheck` — ish vaqtidagi bog'liqliklar ulanganini
  // ishga tushishda tekshiradi. `imports` olib tashlangani uchun
  // kompilyator ularni endi qo'riqlamaydi (izohi shu faylda yuqorida).
  providers: [AuthService, UserProfileService, OptionalWiringCheck],
  // `UserProfileService` — `users` moduliga ham kerak (`GET /:id`,
  // `PATCH /:id/role`, `PATCH /:id/branches` profil qaytaradi). Profil
  // qurish mantig'i BITTA joyda qolishi shart: ikkinchi nusxa bo'lsa,
  // biri to'ldirilib, ikkinchisi eski shaklda qolib ketardi.
  // `AuthService` — `bot-auth` moduliga kerak (`issueTokens` /
  // `sanitizeUser`). Token berish mantig'i BITTA joyda qolishi shart:
  // ikkinchi nusxa bo'lsa refresh TTL yoki `sub` shakli jimgina
  // uzoqlashardi va bot orqali kirgan sessiya oddiysidan boshqacha
  // yashardi.
  exports: [UserProfileService, AuthService],
})
export class AuthModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    // ⚠ TEZLIK CHEGARASI — Express bilan bir xil (20 / 5 daqiqa).
    // `/login` va `/refresh` da; `/logout` da Express'da ham YO'Q.
    consumer.apply(authLimiter).forRoutes(
      { path: 'auth/login', method: RequestMethod.POST },
      { path: 'auth/refresh', method: RequestMethod.POST },
    );

    consumer.apply(AuthMiddleware).forRoutes(
      { path: 'auth/me', method: RequestMethod.GET },
      { path: 'auth/me', method: RequestMethod.PATCH },
      { path: 'auth/change-password', method: RequestMethod.POST },
      { path: 'auth/register-user', method: RequestMethod.POST },
    );
  }
}
