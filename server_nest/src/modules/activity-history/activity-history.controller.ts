import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ActivityHistoryService } from './activity-history.service.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { Permissions, Validated } from '../../common/decorators/index.js';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.js';
import {
  studentTimelineSchema, groupTimelineSchema,
  type StudentTimelineRequest, type GroupTimelineRequest,
} from './activity-history.validators.js';

/**
 * FAOLIYAT TARIXI — Express `activityHistory.routes.js` EKVIVALENTI (2/2).
 *
 * ⚠ SAHIFALASH STANDARTI BU YERDA BOSHQACHA: `limit` standarti **30**
 * (umumiy `parsePagination` dagi 20 EMAS) va `meta` da `pages` maydoni
 * YO'Q. Express handler'i aynan shunday yozilgan.
 *
 * ⚠ FILIAL KO'LAMI SO'ROVDAN UZATILADI: servis boshqa filial
 * obyektini RAD ETADI. Timeline o'quvchining butun moliyaviy tarixini
 * ochadi, shuning uchun ruxsatning o'zi yetarli emas.
 */
@Controller('activity-history')
@UseGuards(PermissionsGuard)
export class ActivityHistoryController {
  constructor(private readonly history: ActivityHistoryService) {}

  @Get('students/:studentId')
  @Permissions(PERMISSIONS.ACTIVITY_LOGS_READ)
  async studentTimeline(
    @Validated(studentTimelineSchema) v: StudentTimelineRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const { items, total, page, limit } = await this.history.getStudentTimeline(
      v.params.studentId,
      {
        page: Number(v.query.page) || 1,
        limit: Number(v.query.limit) || 30,
        scope: {
          allowedBranchIds: req.allowedBranchIds,
          canSeeAllBranches: req.canSeeAllBranches,
        },
      },
    );
    return { success: true, data: items, meta: { page, limit, total } };
  }

  @Get('groups/:groupId')
  @Permissions(PERMISSIONS.ACTIVITY_LOGS_READ)
  async groupTimeline(
    @Validated(groupTimelineSchema) v: GroupTimelineRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const { items, total, page, limit } = await this.history.getGroupTimeline(
      v.params.groupId,
      {
        page: Number(v.query.page) || 1,
        limit: Number(v.query.limit) || 30,
        scope: {
          allowedBranchIds: req.allowedBranchIds,
          canSeeAllBranches: req.canSeeAllBranches,
        },
      },
    );
    return { success: true, data: items, meta: { page, limit, total } };
  }
}
