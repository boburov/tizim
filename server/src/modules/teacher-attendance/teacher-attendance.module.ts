import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { TeacherAttendanceController } from './teacher-attendance.controller.js';
import { TeacherAttendanceService } from './teacher-attendance.service.js';
import { AttendanceModule } from '../attendance/attendance.module.js';
import { AuthMiddleware } from '../../middleware/auth.middleware.js';

/**
 * O'QITUVCHI DAVOMATI (FAZA 6).
 *
 * ⚠ `AttendanceModule` IMPORT QILINADI — `TeacherAbsenceService` o'sha
 * yerda. Uni QAYTA YOZISH proyeksiyani ikkinchi manbaga aylantirardi:
 * guruh darajasidagi "o'qituvchi kelmadi" belgisi FAQAT shu servisdan
 * hosil bo'lishi kerak.
 */
@Module({
  imports: [AttendanceModule],
  controllers: [TeacherAttendanceController],
  providers: [TeacherAttendanceService],
})
export class TeacherAttendanceModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(AuthMiddleware).forRoutes(TeacherAttendanceController);
  }
}
