import {
  Controller, Delete, Get, HttpCode, Post, Req, Res, UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { AssignmentsService } from './assignments.service.js';
import { StorageService } from '../storage/storage.service.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { Roles, Permissions, Validated } from '../../common/decorators/index.js';
import { PERMISSIONS, ROLES } from '../../common/constants/permissions.js';
import { actorOf } from '../../common/helpers/actor.js';
import { canonicalMimeOf } from '../../common/middleware/upload-attachment.js';
import { parsePagination, buildMeta } from '../../common/utils/pagination.js';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.js';
import { contentDisposition } from '../../common/utils/content-disposition.js';
import {
  createSchema, previewSchema, listSchema, idSchema, recipientListSchema,
  myListSchema,
  type CreateRequest, type PreviewRequest, type ListRequest, type IdRequest,
  type RecipientListRequest, type MyListRequest,
} from './assignments.validators.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * VAZIFALAR — Express `assignments.routes.js` NING TO'LIQ EKVIVALENTI
 * (10/10).
 *
 * ⚠⚠ E'LON TARTIBI O'ZGARTIRILMASIN ⚠⚠
 * `/my/...` `/:id` DAN OLDIN turishi SHART. Express'da bo'lmasa "my"
 * ID deb qabul qilinib, validator 400 qaytarardi; NestJS aniq
 * segmentni parametrdan ustun ko'rsa ham, Express tartibi ATAYLAB
 * takrorlangan — ikkala stekni yonma-yon o'qiganda farq ko'rinmasin.
 *
 * ── FAYL YUKLASH ZANJIRI (`assignments.module.ts`) ──
 *   AuthMiddleware → sendPermissionMiddleware → uploadLimiter
 *   → UploadAttachmentMiddleware → (PermissionsGuard) → handler
 *
 * `sendPermissionMiddleware` ATAYLAB TAKRORLANADI: NestJS
 * qo'riqchilari middleware'dan KEYIN ishlaydi, ya'ni qo'riqchiga
 * tayanilsa ruxsatsiz foydalanuvchining 5 MB fayli avval xotiraga
 * o'qilardi. Express'da tartib teskari va aynan shu sababdan.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Controller('assignments')
@UseGuards(RolesGuard, PermissionsGuard)
export class AssignmentsController {
  constructor(
    private readonly assignments: AssignmentsService,
    private readonly storage: StorageService,
  ) {}

  // ═══════════════════════ O'QUVCHI YUZASI ═══════════════════════

  @Get('my/unread-count')
  @Roles(ROLES.STUDENT)
  async myUnreadCount(@Req() req: AuthenticatedRequest) {
    const data = await this.assignments.unreadCountForStudent(req.user!._id);
    return { success: true, data };
  }

  @Get('my')
  @Roles(ROLES.STUDENT)
  async myList(
    @Validated(myListSchema) _v: MyListRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>);
    const { items, total } = await this.assignments.listForStudent(req.user!._id, {
      page, limit, skip,
    });
    return { success: true, data: items, meta: buildMeta({ page, limit, total }) };
  }

  /** ⚠ 200 — Express `res.json()`. NestJS `POST` standart holda 201 berardi. */
  @Post('my/:id/read')
  @HttpCode(200)
  @Roles(ROLES.STUDENT)
  async markRead(
    @Validated(idSchema) v: IdRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.assignments.markRead(v.params.id, req.user!._id);
    return { success: true, data };
  }

  // ═══════════════════════ YUBORISH ═══════════════════════

  /**
   * Yuborishdan oldingi ko'rib chiqish: nechta o'quvchiga yetadi,
   * nechtasi botni bloklagan.
   */
  @Post('preview')
  @HttpCode(200)
  @Permissions(PERMISSIONS.ASSIGNMENTS_SEND)
  async preview(
    @Validated(previewSchema) v: PreviewRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.assignments.preview(v.body, actorOf(req));
    return { success: true, data };
  }

  @Post()
  @HttpCode(201)
  @Permissions(PERMISSIONS.ASSIGNMENTS_SEND)
  async create(
    @Validated(createSchema) v: CreateRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.assignments.create({
      body: v.body,
      // ⚠ `req.file` ni MULTER middleware to'ldiradi
      // (`UploadAttachmentMiddleware`). Fayl BO'LMASLIGI mumkin —
      // vazifa faqat matndan iborat bo'lishi mumkin.
      file: (req as { file?: Express.Multer.File }).file,
      currentUser: actorOf(req),
    });
    return { success: true, data, message: 'Vazifa yuborildi' };
  }

  // ═══════════════════════ BOSHQARUV YUZASI ═══════════════════════

  @Get()
  @Permissions(PERMISSIONS.ASSIGNMENTS_READ)
  async list(
    @Validated(listSchema) v: ListRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>);
    const { items, total } = await this.assignments.list(
      { page, limit, skip, groupId: v.query.groupId },
      actorOf(req),
    );
    return { success: true, data: items, meta: buildMeta({ page, limit, total }) };
  }

  /**
   * Fayl yuklab olish.
   *
   * ⚠ `@Permissions` ATAYLAB YO'Q: o'quvchi ham o'ziga kelgan faylni
   * oladi. Kirish huquqi servis ichida EGALIK bo'yicha tekshiriladi
   * (`assertCanRead`) — bitta manzil uch xil rolga xizmat qiladi va
   * ruxsat qo'riqchisi ularning birortasini butunlay yopib qo'yardi.
   */
  @Get(':id/file')
  async download(
    @Validated(idSchema) v: IdRequest,
    @Req() req: AuthenticatedRequest,
    @Res() res: Response,
  ) {
    const file = await this.assignments.getDownloadable(
      v.params.id, actorOf(req), req.permissions,
    );
    const buffer = await this.storage.readFile(file as never);

    // ⚠ Content-Type SAQLANGAN qiymatdan emas, KENGAYTMADAN olinadi.
    //
    // `file.mimeType` — yuklovchi bergan satr. Bu tekshiruvlar joriy
    // qilinishidan oldin yuklangan fayllarda u istalgan narsa bo'lishi
    // mumkin (masalan "text/html"), va uni qaytarish brauzerga faylni
    // SAHIFA sifatida talqin qilish uchun sabab berardi.
    const originalName = (file as { originalName: string }).originalName;
    res.setHeader('Content-Type', canonicalMimeOf(originalName));
    res.setHeader('Content-Length', buffer.length);
    // Fayl HAR DOIM yuklab olinadi, hech qachon brauzerda ochilmaydi.
    res.setHeader('Content-Disposition', contentDisposition(originalName));
    // helmet buni global qo'yadi; bu yerda ATAYLAB takrorlanadi — fayl
    // qaytaradigan yagona yo'l shu va u helmet sozlamasiga bog'liq
    // bo'lib qolmasligi kerak.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.send(buffer);
  }

  @Get(':id/recipients')
  @Permissions(PERMISSIONS.ASSIGNMENTS_READ)
  async getRecipients(
    @Validated(recipientListSchema) v: RecipientListRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    // ⚠ Egalik tekshiruvi `getById` ICHIDA (o'qituvchi faqat
    // o'zinikini ko'radi). Chaqiruvni olib tashlash begona vazifaning
    // oluvchilar ro'yxatini ochib qo'yardi.
    await this.assignments.getById(v.params.id, actorOf(req));

    const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>);
    const { items, total } = await this.assignments.getRecipientList(v.params.id, {
      page, limit, skip, status: v.query.status,
    });

    return { success: true, data: items, meta: buildMeta({ page, limit, total }) };
  }

  @Get(':id')
  @Permissions(PERMISSIONS.ASSIGNMENTS_READ)
  async getById(
    @Validated(idSchema) v: IdRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.assignments.getById(v.params.id, actorOf(req));
    return { success: true, data };
  }

  @Delete(':id')
  @Permissions(PERMISSIONS.ASSIGNMENTS_SEND)
  async remove(
    @Validated(idSchema) v: IdRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.assignments.remove(v.params.id, actorOf(req));
    return { success: true, data, message: "Vazifa o'chirildi, joy bo'shatildi" };
  }
}
