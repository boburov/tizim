import { Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { AttendanceService } from './attendance.service.js';
import { TeacherAbsenceService } from './teacher-absence.service.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { PermissionOrSelfGuard } from '../../common/guards/permission-or-self.guard.js';
import {
  GroupAccessGuard,
  StudentAccessGuard,
  GroupAccess,
  StudentAccess,
} from '../../common/guards/attendance-scope.guard.js';
import {
  Permissions,
  PermissionOrSelf,
  Validated,
} from '../../common/decorators/index.js';
import { PERMISSIONS, ROLES } from '../../common/constants/permissions.js';
import { ApiError } from '../../common/errors/api-error.js';
import { parsePagination } from '../../common/utils/pagination.js';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.js';
import {
  bulkRecordSchema, listForDateSchema, studentMonthlySchema, studentYearSchema,
  groupMonthlySchema, rangeQuerySchema, studentRangeSchema, groupRangeSchema,
  teacherStatusSchema, teacherSetSchema,
  type BulkRecordRequest, type ListForDateRequest, type StudentMonthlyRequest,
  type StudentYearRequest, type GroupMonthlyRequest, type RangeQueryRequest,
  type StudentRangeRequest, type GroupRangeRequest, type TeacherStatusRequest,
  type TeacherSetRequest,
} from './attendance.validators.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * DAVOMAT — Express `attendance.routes.js` NING TO'LIQ EKVIVALENTI (11/11).
 *
 * ⚠⚠ E'LON TARTIBI O'ZGARTIRILMASIN ⚠⚠
 * `/teacher/me/summary` va `/dashboard` `/groups/:groupId` DAN OLDIN
 * turishi shart emas (yo'llar boshqacha), lekin `/students/:id/...`
 * va `/groups/:groupId/...` bir-biriga to'sqinlik qilmasligi uchun
 * Express tartibi AYNAN saqlangan.
 *
 * ── QO'RIQCHILAR ZANJIRI (tartib MUHIM) ──
 *   1. `PermissionsGuard`      — "bu bo'limga umuman kira oladimi?"
 *   2. `PermissionOrSelfGuard` — o'quvchi O'ZINI so'rasa ruxsat
 *   3. `GroupAccessGuard` / `StudentAccessGuard`
 *                              — "AYNAN SHU guruh/o'quvchi uningmi?"
 *
 * Express'da ham aynan shu tartib (`requirePermission` → `require*Access`).
 * Teskari tartibda ruxsatsiz foydalanuvchi avval ko'lam xatosini
 * olardi va bu qaysi guruh MAVJUD ekanini oshkor qilardi.
 *
 * ⚠ `StudentAccessGuard` `req.scopeGroupIds` NI TO'LDIRADI va
 * kontroller uni servisga UZATADI. Uzatishni unutish A-1
 * "cross-group disclosure" xatosini qaytaradi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Controller('attendance')
@UseGuards(PermissionsGuard, PermissionOrSelfGuard, GroupAccessGuard, StudentAccessGuard)
export class AttendanceController {
  constructor(
    private readonly attendance: AttendanceService,
    private readonly teacherAbsence: TeacherAbsenceService,
  ) {}

  /**
   * O'qituvchining O'Z guruhlari hisoboti.
   *
   * ⚠ RUXSAT TEKSHIRUVI YO'Q — ko'lam handler ICHIDA (Express'da ham).
   * O'qituvchida `attendance.manage` bo'lmaydi, lekin u o'z
   * guruhlarining hisobotini ko'rishi SHART.
   */
  @Get('teacher/me/summary')
  async teacherSummary(
    @Validated(rangeQuerySchema) v: RangeQueryRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    if (req.user!.role !== ROLES.TEACHER) {
      throw new ApiError(403, "Faqat o'qituvchilar uchun");
    }
    const data = await this.attendance.getTeacherGroupsSummary(req.user!._id, {
      fromDate: v.query.fromDate,
      toDate: v.query.toDate,
    });
    return { success: true, data };
  }

  /**
   * MARKAZ MIQYOSIDAGI hisobot.
   *
   * ⚠ `ATTENDANCE_MANAGE`, `ATTENDANCE_READ` EMAS. O'qituvchilarda
   * `attendance.read` BOR — u markaz-bo'ylab ma'lumotga yo'l
   * OCHMASLIGI kerak.
   */
  @Get('dashboard')
  @Permissions(PERMISSIONS.ATTENDANCE_MANAGE)
  async dashboard(
    @Validated(rangeQuerySchema) v: RangeQueryRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const { page, limit } = parsePagination(req.query as Record<string, unknown>);
    const data = await this.attendance.getDashboardStats({
      fromDate: v.query.fromDate,
      toDate: v.query.toDate,
      page,
      limit,
    });
    return { success: true, data };
  }

  // ═══════════════════════ O'QUVCHI BO'YICHA ═══════════════════════

  @Get('students/:id/monthly')
  @PermissionOrSelf(PERMISSIONS.ATTENDANCE_READ, 'id')
  @StudentAccess('id')
  async studentMonthly(
    @Validated(studentMonthlySchema) v: StudentMonthlyRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.attendance.getStudentMonthly(v.params.id, {
      year: Number(v.query.year),
      month: Number(v.query.month),
      scopeGroupIds: req.scopeGroupIds ?? null,
    });
    return { success: true, data };
  }

  @Get('students/:id/yearly')
  @PermissionOrSelf(PERMISSIONS.ATTENDANCE_READ, 'id')
  @StudentAccess('id')
  async studentYear(
    @Validated(studentYearSchema) v: StudentYearRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.attendance.getStudentYear(v.params.id, {
      year: Number(v.query.year),
      scopeGroupIds: req.scopeGroupIds ?? null,
    });
    return { success: true, data };
  }

  @Get('students/:id/summary')
  @PermissionOrSelf(PERMISSIONS.ATTENDANCE_READ, 'id')
  @StudentAccess('id')
  async studentSummary(
    @Validated(studentRangeSchema) v: StudentRangeRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.attendance.getStudentSummary(v.params.id, {
      fromDate: v.query.fromDate,
      toDate: v.query.toDate,
      scopeGroupIds: req.scopeGroupIds ?? null,
    });
    return { success: true, data };
  }

  // ═══════════════════════ GURUH BO'YICHA ═══════════════════════

  @Get('groups/:groupId/summary')
  @Permissions(PERMISSIONS.ATTENDANCE_READ)
  @GroupAccess('groupId')
  async groupSummary(@Validated(groupRangeSchema) v: GroupRangeRequest) {
    const data = await this.attendance.getGroupSummary(v.params.groupId, {
      fromDate: v.query.fromDate,
      toDate: v.query.toDate,
    });
    return { success: true, data };
  }

  @Get('groups/:groupId/monthly')
  @Permissions(PERMISSIONS.ATTENDANCE_READ)
  @GroupAccess('groupId')
  async groupMonthly(@Validated(groupMonthlySchema) v: GroupMonthlyRequest) {
    const data = await this.attendance.getGroupMonthly(v.params.groupId, {
      year: Number(v.query.year),
      month: Number(v.query.month),
    });
    return { success: true, data };
  }

  /**
   * ⚠ `/groups/:groupId/summary` VA `/monthly` DAN KEYIN e'lon
   * qilinadi. NestJS aniq segmentni parametrdan ustun ko'radi, lekin
   * Express tartibi ATAYLAB takrorlangan — ikkala stekni yonma-yon
   * o'qiganda farq ko'rinmasin.
   */
  @Get('groups/:groupId')
  @Permissions(PERMISSIONS.ATTENDANCE_READ)
  @GroupAccess('groupId')
  async listForGroupOnDate(@Validated(listForDateSchema) v: ListForDateRequest) {
    const data = await this.attendance.listForGroupOnDate(
      v.params.groupId,
      v.query.date,
      v.query.slot as string | undefined,
    );
    return { success: true, data };
  }

  /**
   * ⚠ 201 — Express `res.status(201)` yozadi. NestJS `POST` uchun
   * standart holda ham 201 beradi, lekin OCHIQ belgilanadi: qo'shni
   * `POST /groups/:groupId/teacher` esa 200 qaytaradi va ikkalasi
   * yonma-yon turgani uchun farq ko'rinib tursin.
   */
  @Post('groups/:groupId/bulk')
  @HttpCode(201)
  @Permissions(PERMISSIONS.ATTENDANCE_RECORD)
  @GroupAccess('groupId')
  async bulkRecord(
    @Validated(bulkRecordSchema) v: BulkRecordRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    // `source` AUDIT tarixiga yoziladi — kim belgilaganini ajratish uchun.
    const source = req.user!.role === ROLES.OWNER ? 'admin' : 'teacher';
    const data = await this.attendance.bulkRecord(
      v.params.groupId,
      v.body.date,
      v.body.items,
      req.user!,
      source,
      v.body.slot || '',
    );
    return { success: true, data, message: 'Davomat saqlandi' };
  }

  // ═══════════════════════ O'QITUVCHI DAVOMATI ═══════════════════════

  @Get('groups/:groupId/teacher')
  @Permissions(PERMISSIONS.ATTENDANCE_READ)
  @GroupAccess('groupId')
  async teacherAttendanceStatus(
    @Validated(teacherStatusSchema) v: TeacherStatusRequest,
  ) {
    const data = await this.teacherAbsence.getStatus(v.params.groupId, v.query.date);
    return { success: true, data };
  }

  /**
   * ⚠⚠ `ATTENDANCE_MANAGE` (owner-darajali), `ATTENDANCE_RECORD` EMAS.
   *
   * Oddiy o'qituvchi O'ZINING "kelmadi" belgisini o'chira olmasligi
   * kerak — aks holda hisobot dalili yo'qolardi. `teacherAttendance`
   * moduli (manba-haqiqat) bilan BIR XIL darajada qo'riqlanadi.
   *
   * ⚠ 200 — Express `res.json(...)` yozadi (201 EMAS).
   */
  @Post('groups/:groupId/teacher')
  @HttpCode(200)
  @Permissions(PERMISSIONS.ATTENDANCE_MANAGE)
  @GroupAccess('groupId')
  async teacherAttendanceSet(
    @Validated(teacherSetSchema) v: TeacherSetRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const present = !!v.body.present;
    const data = await this.teacherAbsence.toggle(
      v.params.groupId,
      v.body.date,
      present,
      req.user!,
    );
    return {
      success: true,
      data,
      message: present
        ? "O'qituvchi keldi deb belgilandi"
        : "O'qituvchi kelmadi deb belgilandi",
    };
  }
}
