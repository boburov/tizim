import { Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { SystemNotificationsService } from './system-notifications.service.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Roles, Validated } from '../../common/decorators/index.js';
import { ROLES } from '../../common/constants/permissions.js';
import { parsePagination, buildMeta } from '../../common/utils/pagination.js';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.js';
import {
  idSchema,
  listSchema,
  createSchema,
  type IdRequest,
  type ListRequest,
  type CreateRequest,
} from './system-notifications.validators.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TIZIM BILDIRISHNOMALARI — Express `systemNotifications.routes.js` NING
 * TO'LIQ EKVIVALENTI (5/5).
 *
 * ⚠ BUTUN MODUL FAQAT OWNER UCHUN. Express buni bitta qatorda beradi:
 *
 *     router.use(requireAuth, requireRole(ROLES.OWNER));
 *
 * NestJS'da `router.use` ekvivalenti YO'Q, shuning uchun `@Roles(OWNER)`
 * KONTROLLER darajasida turadi va HAR BIR metodga tarqaladi.
 *
 * ⚠ METOD DARAJASIDA `@Roles` QO'YMANG: `getAllAndOverride` metod
 * metama'lumotini KONTROLLER metama'lumotidan USTUN qo'yadi, ya'ni
 * bittasida kengroq rol yozilsa u butun modul qoidasini JIMGINA bosib
 * ketardi.
 *
 * ⚠ E'LON TARTIBI: `GET /unread-count` va `POST /read-all` parametrli
 * yo'llardan OLDIN. Hozir to'qnashuv yo'q (`GET /:id` umuman yo'q),
 * lekin `POST /:id/read` qo'shilgani uchun tartib Express bilan bir xil
 * saqlanadi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Controller('system-notifications')
@UseGuards(RolesGuard)
@Roles(ROLES.OWNER)
export class SystemNotificationsController {
  constructor(private readonly systemNotifications: SystemNotificationsService) {}

  @Get()
  async list(@Validated(listSchema) v: ListRequest, @Req() req: AuthenticatedRequest) {
    const { page, limit } = parsePagination(req.query as Record<string, unknown>);
    const { items, total } = await this.systemNotifications.list({
      status: v.query.status,
      page,
      limit,
    });
    return { success: true, data: items, meta: buildMeta({ page, limit, total }) };
  }

  @Get('unread-count')
  async unreadCount() {
    const count = await this.systemNotifications.getUnreadCount();
    return { success: true, data: { count } };
  }

  @Post()
  @HttpCode(201)
  async create(@Validated(createSchema) v: CreateRequest) {
    const data = await this.systemNotifications.create(v.body);
    return { success: true, data, message: 'Bildirishnoma yaratildi' };
  }

  @Post('read-all')
  @HttpCode(200)
  async markAllRead() {
    const data = await this.systemNotifications.markAllRead();
    return { success: true, data, message: "Hammasi o'qildi" };
  }

  /** Javobda `message` YO'Q — Express handler'i faqat `data` qaytaradi. */
  @Post(':id/read')
  @HttpCode(200)
  async markRead(@Validated(idSchema) v: IdRequest) {
    const data = await this.systemNotifications.markRead(v.params.id);
    return { success: true, data };
  }
}
