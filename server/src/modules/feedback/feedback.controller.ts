import { Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { FeedbackService } from './feedback.service.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { Permissions, Validated } from '../../common/decorators/index.js';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import { parsePagination, buildMeta } from '../../common/utils/pagination.js';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.js';
import {
  idSchema, listSchema, myListSchema, submitSchema,
  replySchema, resolveSchema, rejectSchema, rangeSchema,
  type IdRequest, type ListRequest, type MyListRequest, type SubmitRequest,
  type ReplyRequest, type ResolveRequest, type RejectRequest, type RangeRequest,
} from './feedback.validators.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FIKR-MULOHAZA — Express `feedback.routes.js` EKVIVALENTI (9/9).
 *
 * ⚠⚠ E'LON TARTIBI: `/stats` VA `/me` `GET /:id` DAN OLDIN turishi SHART.
 *
 * Aks holda ular fikr ID'si deb o'qilardi. `/me` uchun bu ayniqsa
 * xavfli: u RUXSATSIZ (har kim o'zinikini ko'radi), `/:id` esa
 * `ensureOwnerOrAuthor` dan o'tadi — ya'ni foydalanuvchi o'z
 * ro'yxati o'rniga 404/403 olardi.
 *
 * ── UCH XIL HIMOYA DARAJASI ──
 *  1. `POST /` va `GET /me` — FAQAT `requireAuth`: har kim fikr yozadi
 *     va o'zinikini ko'radi.
 *  2. `GET /` va `GET /stats` — `feedback.read`.
 *  3. `POST /:id/*` (review/reply/resolve/reject) — `feedback.respond`.
 *  4. `GET /:id` — auth + `ensureOwnerOrAuthor` (owner YOKI muallif).
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Controller('feedback')
@UseGuards(PermissionsGuard)
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  /** ⚠ `GET /:id` DAN OLDIN. */
  @Get('stats')
  @Permissions(PERMISSIONS.FEEDBACK_READ)
  async stats(@Validated(rangeSchema) v: RangeRequest) {
    return { success: true, data: await this.feedback.getStats(v.query) };
  }

  /** ⚠ `GET /:id` DAN OLDIN — va RUXSATSIZ (har kim o'zinikini ko'radi). */
  @Get('me')
  async myFeedback(
    @Validated(myListSchema) v: MyListRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const { page, limit } = parsePagination(req.query as Record<string, unknown>);
    const { items, total } = await this.feedback.getMyFeedback(String(req.user!._id), {
      page, limit,
    });
    return { success: true, data: items, meta: buildMeta({ page, limit, total }) };
  }

  @Get()
  @Permissions(PERMISSIONS.FEEDBACK_READ)
  async list(@Validated(listSchema) v: ListRequest, @Req() req: AuthenticatedRequest) {
    const { page, limit } = parsePagination(req.query as Record<string, unknown>);
    const { items, total } = await this.feedback.list({ ...v.query, page, limit });
    return { success: true, data: items, meta: buildMeta({ page, limit, total }) };
  }

  /** Fikr yozish — RUXSATSIZ, har qanday auth'langan foydalanuvchi. */
  @Post()
  @HttpCode(201)
  async submit(@Validated(submitSchema) v: SubmitRequest, @Req() req: AuthenticatedRequest) {
    const data = await this.feedback.submit(v.body, req.user);
    return { success: true, data, message: 'Feedback yuborildi' };
  }

  /** Auth + egalik: owner YOKI (anonim bo'lmagan) muallif. */
  @Get(':id')
  async getById(@Validated(idSchema) v: IdRequest, @Req() req: AuthenticatedRequest) {
    const data = await this.feedback.getById(v.params.id);
    this.feedback.ensureOwnerOrAuthor(data as Record<string, any>, req.user);
    return { success: true, data };
  }

  @Post(':id/review')
  @HttpCode(200)
  @Permissions(PERMISSIONS.FEEDBACK_RESPOND)
  async review(@Validated(idSchema) v: IdRequest, @Req() req: AuthenticatedRequest) {
    const data = await this.feedback.markReviewed(v.params.id, req.user);
    return { success: true, data, message: "Ko'rib chiqishga o'tkazildi" };
  }

  @Post(':id/reply')
  @HttpCode(200)
  @Permissions(PERMISSIONS.FEEDBACK_RESPOND)
  async reply(@Validated(replySchema) v: ReplyRequest, @Req() req: AuthenticatedRequest) {
    const data = await this.feedback.reply(v.params.id, v.body, req.user);
    return { success: true, data, message: 'Javob saqlandi' };
  }

  @Post(':id/resolve')
  @HttpCode(200)
  @Permissions(PERMISSIONS.FEEDBACK_RESPOND)
  async resolve(@Validated(resolveSchema) v: ResolveRequest, @Req() req: AuthenticatedRequest) {
    const data = await this.feedback.resolve(v.params.id, v.body, req.user);
    return { success: true, data, message: 'Hal qilindi' };
  }

  @Post(':id/reject')
  @HttpCode(200)
  @Permissions(PERMISSIONS.FEEDBACK_RESPOND)
  async reject(@Validated(rejectSchema) v: RejectRequest, @Req() req: AuthenticatedRequest) {
    const data = await this.feedback.reject(v.params.id, v.body, req.user);
    return { success: true, data, message: 'Rad etildi' };
  }
}
