import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { UsersController, UserBranchesController } from './users.controller.js';
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
 * `AuthModule` — `UserProfileService` uchun (profil qurish).
 */
@Module({
  imports: [AuthModule, StudentFreezeModule, StaffPayrollModule],
  controllers: [UserBranchesController, UsersController],
  providers: [UsersService],
})
export class UsersModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(UserBranchesController, UsersController);
  }
}
