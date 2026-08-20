import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { GroupsController } from './groups.controller.js';
import { GroupsService } from './groups.service.js';
import { TeacherGroupPeriodService } from './teacher-group-period.service.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';

/**
 * GURUHLAR moduli — FAZA 5a (o'qish yo'llari).
 *
 * Ikkala servis ham EKSPORT qilinadi: `attendance`, `grades`,
 * `student-freeze` va `buildUserProfile` ularga tayanadi.
 */
@Module({
  controllers: [GroupsController],
  providers: [GroupsService, TeacherGroupPeriodService],
  exports: [GroupsService, TeacherGroupPeriodService],
})
export class GroupsModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(GroupsController);
  }
}
