import { Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { AttendanceSettingsService } from './attendance-settings.service.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Permissions, Validated } from '../../common/decorators/index.js';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import { updateSchema, type UpdateRequest } from './attendance-settings.validators.js';

/**
 * DAVOMAT SOZLAMALARI — Express `attendanceSettings.routes.js`
 * EKVIVALENTI (2/2).
 *
 * ⚠ O'QISH `attendance.read`, YOZISH esa OWNER roli **VA**
 * `attendance.manage` — ya'ni o'qish va yozish CHEGARALARI TURLICHA.
 * O'qishni yozish ruxsatiga bog'lash davomat sahifasini o'qituvchi
 * uchun buzardi.
 */
@Controller('attendance-settings')
@UseGuards(PermissionsGuard, RolesGuard)
export class AttendanceSettingsController {
  constructor(private readonly settings: AttendanceSettingsService) {}

  @Get()
  @Permissions(PERMISSIONS.ATTENDANCE_READ)
  async get() {
    return { success: true, data: await this.settings.get() };
  }

  @Patch()
  @Permissions(PERMISSIONS.ATTENDANCE_MANAGE)
  async update(@Validated(updateSchema) v: UpdateRequest) {
    const data = await this.settings.update(v.body);
    return { success: true, data, message: 'Sozlamalar saqlandi' };
  }
}
