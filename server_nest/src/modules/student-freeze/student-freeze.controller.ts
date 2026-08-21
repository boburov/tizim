import { Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { StudentFreezeService } from './student-freeze.service.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { Permissions, Validated } from '../../common/decorators/index.js';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import { actorOf } from '../../common/helpers/actor.js';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.js';
import {
  studentIdSchema, freezeSchema, unfreezeSchema,
  type StudentIdRequest, type FreezeRequest, type UnfreezeRequest,
} from './student-freeze.validators.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O'QUVCHINI MUZLATISH — `studentFreeze.routes.js` (3/3).
 *
 * ── RUXSAT: `students.freeze` ──
 * Ilgari butunlay owner-only edi va bu AMALDA ISHLAMASDI: o'quvchi
 * ARXIVLANMAYDI (`users.softRemove` buni ochiq rad etadi), ya'ni
 * muzlatish — o'quvchini vaqtincha to'xtatishning YAGONA yo'li. Uni
 * owner'ga qulflash filialni har safar owner'ni kutishga majburlardi.
 *
 * ── ⚠ FILIAL CHEGARASI SERVIS QATLAMIDA ──
 * `ensureStudent()` o'quvchi chaqiruvchining KO'LAMIDA ekanini
 * tekshiradi (`assertTargetInScope`). Kontroller `req.allowedBranchIds`
 * va `req.canSeeAllBranches` ni UZATADI — Express handler'lari ham
 * aynan shunday qiladi. Uzatilmasa tekshiruv JIMGINA o'tkazib
 * yuborilardi (`scope = null` → tekshirilmaydi).
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Controller('student-freezes')
@UseGuards(PermissionsGuard)
export class StudentFreezeController {
  constructor(private readonly freezes: StudentFreezeService) {}

  private scopeOf(req: AuthenticatedRequest) {
    return {
      allowedBranchIds: req.allowedBranchIds,
      canSeeAllBranches: req.canSeeAllBranches,
    };
  }

  @Get(':studentId')
  @Permissions(PERMISSIONS.STUDENTS_FREEZE)
  async list(
    @Validated(studentIdSchema) v: StudentIdRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.freezes.listForStudent(
      v.params.studentId, this.scopeOf(req),
    );
    return { success: true, data };
  }

  /** ⚠ 201 — Express `res.status(201)` yozadi. */
  @Post(':studentId/freeze')
  @HttpCode(201)
  @Permissions(PERMISSIONS.STUDENTS_FREEZE)
  async freeze(
    @Validated(freezeSchema) v: FreezeRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.freezes.freeze(v.params.studentId, {
      startDate: v.body.startDate,
      reason: v.body.reason,
      by: actorOf(req),
      scope: this.scopeOf(req),
    });
    return { success: true, data, message: "O'quvchi muzlatildi" };
  }

  /** ⚠ 200 — Express `res.json()` yozadi, NestJS POST standarti 201. */
  @Post(':studentId/unfreeze')
  @HttpCode(200)
  @Permissions(PERMISSIONS.STUDENTS_FREEZE)
  async unfreeze(
    @Validated(unfreezeSchema) v: UnfreezeRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.freezes.unfreeze(v.params.studentId, {
      endDate: v.body.endDate,
      by: actorOf(req),
      scope: this.scopeOf(req),
    });
    return { success: true, data, message: "O'quvchi muzlatishdan chiqarildi" };
  }
}
