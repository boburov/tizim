import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import {
  UsersController,
  UserBranchesController,
  UserPermanentDeleteController,
} from './users.controller.js';
import { UsersService } from './users.service.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';
import { AuthModule } from '../auth/auth.module.js';
import { StudentFreezeModule } from '../student-freeze/student-freeze.module.js';
import { StaffPayrollModule } from '../staff-payroll/staff-payroll.module.js';

/**
 * ⚠ KONTROLLER TARTIBI MUHIM: `UserBranchesController` (`PATCH
 * /:id/branches`) `UsersController` (`PATCH /:id`) DAN OLDIN turadi.
 * Aks holda `/:id` aniqroq yo'lni yutib yuborardi.
 *
 * `UserPermanentDeleteController` (`DELETE /:id/permanent`) ham OLDINDA —
 * to'qnashuv aslida yo'q (`/:id` bitta segmentga mos), lekin qoida bir xil
 * qolsin: aniqroq yo'l oldinda.
 *
 * ⚠ AUTH MIDDLEWARE UCHALASIGA HAM ULANADI. Uni bittasiga qo'shishni
 * unutish o'sha marshrutni AUTENTIFIKATSIYASIZ qoldirardi — va aynan
 * `DELETE /:id/permanent` da bu qaytarib bo'lmaydigan yo'qotish bo'lardi.
 *
 * `AuthModule` — `UserProfileService` uchun (profil qurish).
 */
@Module({
  imports: [AuthModule, StudentFreezeModule, StaffPayrollModule],
  controllers: [
    UserBranchesController,
    UserPermanentDeleteController,
    UsersController,
  ],
  providers: [UsersService],
})
export class UsersModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(AuthMiddleware)
      .forRoutes(
        UserBranchesController,
        UserPermanentDeleteController,
        UsersController,
      );
  }
}
