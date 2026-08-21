import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AttendanceController } from './attendance.controller.js';
import { AttendanceService } from './attendance.service.js';
import { TeacherAbsenceService } from './teacher-absence.service.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';
import { HolidaysModule } from '../holidays/holidays.module.js';
import { StudentFreezeModule } from '../student-freeze/student-freeze.module.js';
import { AttendanceSettingsModule } from '../attendance-settings/attendance-settings.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { GroupsModule } from '../groups/groups.module.js';

/**
 * DAVOMAT moduli.
 *
 * ⚠ BOG'LIQLIKLAR OCHIQ IMPORT QILINADI — ularning HECH BIRI
 * TAKRORLANMAGAN:
 *   • `HolidaysModule`          → `holidayKeySetForRange`
 *   • `StudentFreezeModule`     → `loadExemptionsWithFreezes`
 *   • `AttendanceSettingsModule`→ chegaralar (past davomat, ketma-ket)
 *   • `NotificationsModule`     → ogohlantirish yuborish
 *   • `GroupsModule`            → `listForTeacher`
 *
 * `AttendanceService` EKSPORT qilinadi: `grades` moduli unga tayanadi.
 */
@Module({
  imports: [
    HolidaysModule,
    StudentFreezeModule,
    AttendanceSettingsModule,
    NotificationsModule,
    GroupsModule,
  ],
  controllers: [AttendanceController],
  providers: [AttendanceService, TeacherAbsenceService],
  exports: [AttendanceService, TeacherAbsenceService],
})
export class AttendanceModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(AttendanceController);
  }
}
