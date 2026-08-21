import { Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { TeacherAttendanceService } from './teacher-attendance.service.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { Permissions, Validated } from '../../common/decorators/index.js';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.js';
import {
  listForDateSchema, bulkRecordSchema,
  type ListForDateRequest, type BulkRecordRequest,
} from './teacher-attendance.validators.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O'QITUVCHI DAVOMATI — Express `teacherAttendance.routes.js` EKVIVALENTI (2/2).
 *
 * ⚠ FAQAT `attendance.manage` (owner/direktor). O'qituvchining kelgan-
 * kelmagani MAOSHGA ta'sir qiladi, shuning uchun oddiy o'qituvchi
 * BOSHQA o'qituvchini belgilay olmaydi — `attendance.record` bu yerda
 * YETARLI EMAS (teacher'da u bor).
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Controller('teacher-attendance')
@UseGuards(PermissionsGuard)
export class TeacherAttendanceController {
  constructor(private readonly teacherAttendance: TeacherAttendanceService) {}

  @Get()
  @Permissions(PERMISSIONS.ATTENDANCE_MANAGE)
  async listForDate(@Validated(listForDateSchema) v: ListForDateRequest) {
    const data = await this.teacherAttendance.listForDate(v.query.date);
    return { success: true, data };
  }

  @Post('bulk')
  @HttpCode(201)
  @Permissions(PERMISSIONS.ATTENDANCE_MANAGE)
  async bulkRecord(
    @Validated(bulkRecordSchema) v: BulkRecordRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.teacherAttendance.bulkRecord(
      v.body.date, v.body.items as never, req.user as never);
    return { success: true, data, message: 'Davomat saqlandi' };
  }
}
