import { Controller, Get, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import { NotificationsService } from './notifications.service.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Permissions, Validated } from '../../common/decorators/index.js';
import { PERMISSIONS, ROLES } from '../../common/constants/permissions.js';
import { ApiError } from '../../common/errors/api-error.js';
import { parsePagination, buildMeta } from '../../common/utils/pagination.js';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.js';
import {
  idSchema,
  listSchema,
  sendSchema,
  previewSchema,
  inboxListSchema,
  recipientListSchema,
  type IdRequest,
  type ListRequest,
  type SendRequest,
  type PreviewRequest,
  type InboxListRequest,
  type RecipientListRequest,
} from './notifications.validators.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BILDIRISHNOMALAR — Express `notifications.routes.js` NING TO'LIQ
 * EKVIVALENTI (11/11).
 *
 * ⚠⚠ E'LON TARTIBI EXPRESS BILAN AYNAN BIR XIL VA O'ZGARTIRILMASIN.
 *
 * `/inbox/...` va `/stats` `/:id` DAN OLDIN turadi. Aksi bo'lsa Nest
 * `GET /inbox` ni `GET /:id` ga moslardi (`id = "inbox"`) va o'quvchi
 * o'z pochtasi o'rniga 404 olardi — bundan ham yomoni, `/:id` ruxsat
 * to'sig'i ostida, ya'ni O'QUVCHI UMUMAN 403 olardi va inbox butunlay
 * ishlamay qolardi.
 *
 * ── IKKI XIL HIMOYA DARAJASI ──
 *
 *  1. `/inbox/*` — FAQAT `requireAuth`. Har bir tizimga kirgan odam o'z
 *     pochtasini ko'radi; ko'lam `userId` ning O'ZI (boshqa parametr yo'q).
 *  2. QOLGAN HAMMASI — RUXSAT bo'yicha. Boshqaruv sahifalarida
 *     (`/`, `/:id`, `/:id/recipients`) OLUVCHILARNING PII si (telefon
 *     raqami) bor, shuning uchun ular `notifications.read` YOKI
 *     `notifications.send` talab qiladi — o'quvchida ikkalasi ham yo'q.
 *
 * ⚠ ILGARI (3) — ROL to'sig'i (`@Roles(owner, teacher)`) bor edi. U
 * OLIB TASHLANDI: filial rahbarida `notifications.read` BOR edi, lekin
 * rol to'sig'i uni baribir 403 qilardi — ruxsat matritsasi yolg'on
 * va'da berardi. Endi ko'lam ROL NOMIDAN emas, ikki qatlamdan keladi:
 *   • ruxsat kaliti — kim umuman kira oladi;
 *   • `withSenderBranchScope` (servis) — kim NIMANI ko'radi.
 * O'qituvchining "faqat o'ziniki" cheklovi quyida, `senderId` ni
 * majburan o'ziga qo'yish bilan saqlanadi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Controller('notifications')
@UseGuards(PermissionsGuard, RolesGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  // ═══════════════ INBOX — har qanday auth'langan foydalanuvchi ═══════════════

  /** ⚠ `GET /:id` DAN OLDIN — aks holda "inbox" xabar ID'si deb o'qilardi. */
  @Get('inbox/unread-count')
  async unreadCount(@Req() req: AuthenticatedRequest) {
    const count = await this.notifications.getUnreadCount(String(req.user!._id));
    return { success: true, data: { count } };
  }

  @Get('inbox')
  async myInbox(
    @Validated(inboxListSchema) v: InboxListRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const { page, limit } = parsePagination(req.query as Record<string, unknown>);
    const { items, total } = await this.notifications.getMyInbox(String(req.user!._id), {
      page,
      limit,
      unreadOnly: v.query.unreadOnly,
    });
    return { success: true, data: items, meta: buildMeta({ page, limit, total }) };
  }

  @Post('inbox/read-all')
  @HttpCode(200)
  async markAllRead(@Req() req: AuthenticatedRequest) {
    const data = await this.notifications.markAllRead(String(req.user!._id));
    return { success: true, data, message: "Hammasi o'qildi" };
  }

  /**
   * ⚠ `:id` — OLUVCHI yozuvining ID'si, xabarning EMAS. `markRead`
   * `userId` ni ham WHERE ichiga qo'yadi, ya'ni boshqa odamning
   * yozuvini "o'qildi" qilib bo'lmaydi (IDOR yopiq).
   */
  @Post('inbox/:id/read')
  @HttpCode(200)
  async markRead(@Validated(idSchema) v: IdRequest, @Req() req: AuthenticatedRequest) {
    await this.notifications.markRead(v.params.id, String(req.user!._id));
    return { success: true, message: "O'qildi" };
  }

  // ═══════════════ BOSHQARUV ═══════════════

  /** ⚠ `GET /:id` DAN OLDIN. */
  @Get('stats')
  @Permissions(PERMISSIONS.NOTIFICATIONS_READ)
  async stats(@Req() req: AuthenticatedRequest) {
    const data = await this.notifications.getStats(req.query as Record<string, any>);
    return { success: true, data };
  }

  /**
   * Ro'yxat — owner uchun barchasi, o'qituvchi uchun FAQAT O'ZINIKI,
   * filial rahbari uchun O'Z FILIALI (`withSenderBranchScope`).
   * O'quvchilar bu yerda emas, `/inbox` dan foydalanadi.
   *
   * ⚠ IKKI KALIT, "YOKI" MANTIG'I (`PermissionsGuard` — `hasAnyPermission`).
   * `notifications.read` YETARLI EMAS: o'qituvchi rolida u YO'Q, faqat
   * `notifications.send` bor. Yolg'iz `READ` qo'yilsa o'qituvchi paneli
   * JIMGINA buzilardi. O'quvchida ikkalasi ham yo'q — u baribir to'siladi.
   */
  @Get()
  @Permissions(PERMISSIONS.NOTIFICATIONS_READ, PERMISSIONS.NOTIFICATIONS_SEND)
  async list(@Validated(listSchema) v: ListRequest, @Req() req: AuthenticatedRequest) {
    const { page, limit } = parsePagination(req.query as Record<string, unknown>);
    // ⚠ O'QITUVCHIGA `senderId` MAJBURAN O'ZINIKI QILIB QO'YILADI —
    // so'rovdagi `?senderId=` e'tiborsiz qoladi. Aks holda u boshqa
    // o'qituvchining yuborgan xabarlarini ro'yxatlab olardi.
    const senderId =
      req.user!.role === ROLES.TEACHER ? String(req.user!._id) : v.query.senderId;

    const { items, total } = await this.notifications.list({
      senderId,
      category: v.query.category,
      channel: v.query.channel,
      status: v.query.status,
      search: v.query.search,
      fromDate: v.query.fromDate,
      toDate: v.query.toDate,
      page,
      limit,
    });
    return { success: true, data: items, meta: buildMeta({ page, limit, total }) };
  }

  /** Jonli oluvchi hisobi — xabar YARATMAYDI. */
  @Post('preview')
  @HttpCode(200)
  @Permissions(PERMISSIONS.NOTIFICATIONS_SEND)
  async preview(
    @Validated(previewSchema) v: PreviewRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.notifications.previewAudience(v.body.audience, req.user);
    return { success: true, data };
  }

  @Post()
  @HttpCode(201)
  @Permissions(PERMISSIONS.NOTIFICATIONS_SEND)
  async send(@Validated(sendSchema) v: SendRequest, @Req() req: AuthenticatedRequest) {
    const data = await this.notifications.send(v.body, req.user);
    return { success: true, data, message: 'Xabar yuborildi' };
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Permissions(PERMISSIONS.NOTIFICATIONS_SEND)
  async cancel(@Validated(idSchema) v: IdRequest) {
    const data = await this.notifications.cancelScheduled(v.params.id);
    return { success: true, data, message: 'Reja bekor qilindi' };
  }

  /**
   * Tafsilot — boshqaruv yuzasi (oluvchilar PII si). O'quvchilar rol
   * to'sig'ida bloklanadi, o'qituvchi esa FAQAT O'ZI yuborganini ko'radi.
   */
  @Get(':id')
  @Permissions(PERMISSIONS.NOTIFICATIONS_READ, PERMISSIONS.NOTIFICATIONS_SEND)
  async getById(@Validated(idSchema) v: IdRequest, @Req() req: AuthenticatedRequest) {
    const data = await this.notifications.getById(v.params.id);
    if (
      req.user!.role === ROLES.TEACHER &&
      String(data.sender?._id || data.sender || '') !== String(req.user!._id)
    ) {
      throw new ApiError(403, "Ruxsat yo'q");
    }
    return { success: true, data };
  }

  @Get(':id/recipients')
  @Permissions(PERMISSIONS.NOTIFICATIONS_READ, PERMISSIONS.NOTIFICATIONS_SEND)
  async getRecipients(
    @Validated(recipientListSchema) v: RecipientListRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    // ⚠ EGALIK TEKSHIRUVI RO'YXATDAN OLDIN: o'qituvchi boshqa odamning
    // xabari oluvchilarini (ism + TELEFON RAQAMI) ko'ra olmaydi.
    if (req.user!.role === ROLES.TEACHER) {
      const notif = await this.notifications.getById(v.params.id);
      if (String(notif.sender?._id || notif.sender) !== String(req.user!._id)) {
        throw new ApiError(403, "Ruxsat yo'q");
      }
    }
    const { page, limit } = parsePagination(req.query as Record<string, unknown>);
    const { items, total } = await this.notifications.getRecipientList(v.params.id, {
      page,
      limit,
    });
    return { success: true, data: items, meta: buildMeta({ page, limit, total }) };
  }
}
