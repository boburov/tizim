import { Controller, Delete, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { LessonCancellationsService } from './lesson-cancellations.service.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { Permissions, Validated } from '../../common/decorators/index.js';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import { actorOf } from '../../common/helpers/actor.js';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.js';
import {
  createSchema, listSchema, idParamSchema,
  type CreateRequest, type ListRequest, type IdParamRequest,
} from './lesson-cancellations.validators.js';

/**
 * BEKOR QILINGAN DARSLAR — `lessonCancellations.routes.js` (3/3).
 *
 * ── ⚠ RUXSAT: `attendance.manage`, `attendance.record` EMAS ──
 * "Dars o'tdi/o'tmadi" qarori davomat bilan bir toifadagi ish, LEKIN
 * moliyaviy ta'siri bor: o'qituvchi o'zi kelmagan darsni bekor qilib,
 * O'Z MAOSHIGA ta'sir qila olmasligi kerak.
 */
@Controller('lesson-cancellations')
@UseGuards(PermissionsGuard)
export class LessonCancellationsController {
  constructor(private readonly cancellations: LessonCancellationsService) {}

  @Get()
  @Permissions(PERMISSIONS.ATTENDANCE_READ)
  async list(@Validated(listSchema) v: ListRequest) {
    const data = await this.cancellations.list(v.query);
    return { success: true, data };
  }

  /** ⚠ 201 — Express `res.status(201)` yozadi. */
  @Post()
  @HttpCode(201)
  @Permissions(PERMISSIONS.ATTENDANCE_MANAGE)
  async create(
    @Validated(createSchema) v: CreateRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data: any = await this.cancellations.create(v.body, actorOf(req));
    return {
      success: true,
      data,
      message: data.billable
        ? "Dars ko'chirildi (to'lov o'zgarmaydi)"
        : "Dars bekor qilindi - o'quvchilar bu dars uchun to'lamaydi",
    };
  }

  /** ⚠ Javobda `data` YO'Q — Express faqat `{ success, message }` yozadi. */
  @Delete(':id')
  @Permissions(PERMISSIONS.ATTENDANCE_MANAGE)
  async remove(
    @Validated(idParamSchema) v: IdParamRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.cancellations.remove(v.params.id, actorOf(req));
    return { success: true, message: 'Bekor qilish olib tashlandi' };
  }
}
