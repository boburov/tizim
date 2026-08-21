import { MiddlewareConsumer, Module, NestModule, RequestMethod } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { UserProfileService } from './user-profile.service.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';
import { authLimiter } from '../../common/middleware/rate-limit.js';
import { GroupsModule } from '../groups/groups.module.js';
import { AttendanceModule } from '../attendance/attendance.module.js';
import { StudentFreezeModule } from '../student-freeze/student-freeze.module.js';
import { TeacherSalaryModule } from '../teacher-salary/teacher-salary.module.js';
import { OpeningBalanceModule } from '../opening-balance/opening-balance.module.js';

/**
 * ⚠ MIDDLEWARE FAQAT HIMOYALANGAN MARSHRUTLARGA ULANADI.
 *
 * `/login`, `/refresh`, `/logout` — OCHIQ (Express'da ham `requireAuth`
 * YO'Q). `/refresh` va `/logout` cookie bilan ishlaydi, access token
 * bilan emas: muddati o'tgan access token bilan ham sessiyani yangilash
 * mumkin bo'lishi SHART — aks holda token eskirgan zahoti foydalanuvchi
 * chiqib ketardi.
 */
@Module({
  // `GroupsModule` — O'QITUVCHI profili uchun (`buildUserProfile`).
  // ⚠ AYLANMA BOG'LIQLIK YO'Q: `GroupsModule` `AuthModule` ni import
  // QILMAYDI (u faqat `AuthMiddleware` ni ishlatadi, u esa global
  // `CommonModule` dan keladi). Guruhlar moduli o'z izohida aynan shu
  // iste'molchini oldindan e'lon qilgan.
  imports: [
    GroupsModule,
    // ⚠ O'QUVCHI PROFILI uchun: joriy oy davomat xulosasi va muzlatish
    // holati. AYLANA YO'Q — `AttendanceModule` ham,
    // `StudentFreezeModule` ham `AuthModule` ni import QILMAYDI
    // (Express bu joyda dinamik `import()` ishlatadi).
    AttendanceModule,
    StudentFreezeModule,
    // ⚠ `registerUser` ning IXTIYORIY yon ta'sirlari: maosh stavkasi
    // (`setCompensation`) va boshlang'ich qoldiq (`create`). AYLANA
    // YO'Q — ularning birortasi `AuthModule` ni import qilmaydi.
    TeacherSalaryModule,
    OpeningBalanceModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, UserProfileService],
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
