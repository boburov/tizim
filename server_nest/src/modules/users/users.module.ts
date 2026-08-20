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
import { ExpenseApprovalsModule } from '../expense-approvals/expense-approvals.module.js';
import { ArchiveReasonsModule } from '../archive-reasons/archive-reasons.module.js';
import { SystemNotificationsModule } from '../system-notifications/system-notifications.module.js';

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
  // `ExpenseApprovalsModule` — `POST /staff` ishga olish tasdig'i uchun
  // (`checkConfigApproval` + `createRequest`).
  imports: [
    AuthModule,
    StudentFreezeModule,
    StaffPayrollModule,
    ExpenseApprovalsModule,
    // Hayot sikli yon ta'sirlari: arxiv jurnali (o'quvchi qaytarilishi)
    // va owner bildirishnomasi (ishga qaytarish / butunlay o'chirish).
    ArchiveReasonsModule,
    SystemNotificationsModule,
  ],
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
