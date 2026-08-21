import { Controller, Get, UseGuards } from '@nestjs/common';
import { ActivityLogsService } from './activity-logs.service.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { Permissions, Validated } from '../../common/decorators/index.js';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import { parsePagination, buildMeta } from '../../common/utils/pagination.js';
import {
  listSchema, idSchema, rangeSchema,
  type ListRequest, type IdRequest, type RangeRequest,
} from './activity-logs.validators.js';

/**
 * FAOLIYAT LOGLARI — Express `activityLogs.routes.js` EKVIVALENTI (3/3).
 *
 * ⚠ MARSHRUT TARTIBI O'ZGARTIRILMASIN: `stats` `:id` DAN OLDIN turishi
 * shart, aks holda `/activity-logs/stats` `:id` ga tushib "Log topilmadi"
 * (404) qaytarardi. Express'da ham tartib aynan shunday.
 *
 * ⚠ SAHIFALASH `parsePagination` orqali: standart `limit` **20**
 * (servisdagi `limit = 30` standarti Express'da ham O'LIK — handler
 * har doim qiymat uzatadi). `meta` da `pages` bor.
 */
@Controller('activity-logs')
@UseGuards(PermissionsGuard)
export class ActivityLogsController {
  constructor(private readonly logs: ActivityLogsService) {}

  @Get('stats')
  @Permissions(PERMISSIONS.ACTIVITY_LOGS_READ)
  async stats(@Validated(rangeSchema) v: RangeRequest) {
    const data = await this.logs.getStats(v.query);
    return { success: true, data };
  }

  @Get()
  @Permissions(PERMISSIONS.ACTIVITY_LOGS_READ)
  async list(@Validated(listSchema) v: ListRequest) {
    const { page, limit } = parsePagination(v.query as Record<string, unknown>);
    const { items, total } = await this.logs.list({
      userId: v.query.userId,
      method: v.query.method,
      action: v.query.action,
      resourceType: v.query.resourceType,
      fromDate: v.query.fromDate,
      toDate: v.query.toDate,
      page,
      limit,
    });
    return { success: true, data: items, meta: buildMeta({ page, limit, total }) };
  }

  @Get(':id')
  @Permissions(PERMISSIONS.ACTIVITY_LOGS_READ)
  async getById(@Validated(idSchema) v: IdRequest) {
    const data = await this.logs.getById(v.params.id);
    return { success: true, data };
  }
}
