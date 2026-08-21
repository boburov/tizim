import { Controller, Delete, Get, HttpCode, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { StorageService, formatBytes } from './storage.service.js';
import { StorageAdminService } from './storage-admin.service.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { Permissions, Validated } from '../../common/decorators/index.js';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import { parsePagination, buildMeta } from '../../common/utils/pagination.js';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.js';
import {
  updateSettingsSchema,
  cleanupSchema,
  listFilesSchema,
  fileIdSchema,
  type UpdateSettingsRequest,
  type CleanupRequest,
  type ListFilesRequest,
  type FileIdRequest,
} from './storage.validators.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * SAQLAGICH — Express `storage.routes.js` NING TO'LIQ EKVIVALENTI (7/7).
 *
 * ⚠ `GET /usage` DA RUXSAT ATAYLAB YO'Q.
 *
 * Bu raqamni sidebar ko'rsatadi va u MARKAZNING UMUMIY holati (kimningdir
 * shaxsiy ma'lumoti emas). Ruxsat qo'yilsa, o'qituvchi joy tugaganini
 * faqat fayl yuklab ko'rgandan KEYIN bilib olardi. "Xavfsizlikni
 * kuchaytirish" niyatida bu yerga ruxsat qo'shilmasin.
 *
 * ⚠ QOLGAN OLTITASI `storage.manage` TALAB QILADI: ular butun markazning
 * fayllarini o'chiradi va ularni QAYTARIB BO'LMAYDI.
 *
 * ⚠ TOZALASH IKKI QADAM (`/cleanup/preview` → `/cleanup`) — ATAYLAB.
 * "Hammasini o'chirish" BIR bosishda bo'lmasligi kerak.
 *
 * ⚠ E'LON TARTIBI: `/cleanup/preview` `/cleanup` DAN OLDIN, `/files/:id`
 * esa `/files` DAN KEYIN — Express bilan bir xil.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Controller('storage')
@UseGuards(PermissionsGuard)
export class StorageController {
  constructor(
    private readonly storage: StorageService,
    private readonly admin: StorageAdminService,
  ) {}

  /** Kvota holati — RUXSATSIZ (yuqoridagi izohga qarang). */
  @Get('usage')
  async usage() {
    return { success: true, data: await this.storage.getUsage() };
  }

  /**
   * Sozlama + kvota holati BITTA javobda: sahifa ochilishida ikki so'rov
   * o'rniga bitta (va ikkalasi bir-biriga mos lahzadan olinadi).
   */
  @Get('settings')
  @Permissions(PERMISSIONS.STORAGE_MANAGE)
  async getSettings() {
    const [settings, usage] = await Promise.all([
      this.admin.getSettings(),
      this.storage.getUsage(),
    ]);
    return {
      success: true,
      data: {
        settings: { ...settings, nextRunAt: this.admin.nextRunAt(settings) },
        usage,
      },
    };
  }

  @Patch('settings')
  @Permissions(PERMISSIONS.STORAGE_MANAGE)
  async updateSettings(@Validated(updateSettingsSchema) v: UpdateSettingsRequest) {
    const settings = await this.admin.updateSettings(v.body);
    return {
      success: true,
      data: { ...settings, nextRunAt: this.admin.nextRunAt(settings) },
      message: 'Tozalash sozlamalari saqlandi',
    };
  }

  /** Nechta fayl va qancha joy o'chishini aytadi — HECH NARSA o'chirmaydi. */
  @Post('cleanup/preview')
  @HttpCode(200)
  @Permissions(PERMISSIONS.STORAGE_MANAGE)
  async cleanupPreview(@Validated(cleanupSchema) v: CleanupRequest) {
    return { success: true, data: await this.admin.previewCleanup(v.body) };
  }

  @Post('cleanup')
  @HttpCode(200)
  @Permissions(PERMISSIONS.STORAGE_MANAGE)
  async cleanup(
    @Validated(cleanupSchema) v: CleanupRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.admin.runCleanup({ ...v.body, userId: req.user!._id });
    return {
      success: true,
      data,
      message: data.deleted
        ? `${data.deleted} ta fayl o'chirildi, ${formatBytes(data.freedBytes)} bo'shadi`
        : "O'chiriladigan fayl topilmadi",
    };
  }

  @Get('files')
  @Permissions(PERMISSIONS.STORAGE_MANAGE)
  async listFiles(
    @Validated(listFilesSchema) v: ListFilesRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const { page, limit, skip } = parsePagination(req.query as Record<string, unknown>);
    const { items, total } = await this.admin.listFiles({
      page,
      limit,
      skip,
      sort: v.query.sort,
    });
    return { success: true, data: items, meta: buildMeta({ page, limit, total }) };
  }

  @Delete('files/:id')
  @Permissions(PERMISSIONS.STORAGE_MANAGE)
  async removeFile(
    @Validated(fileIdSchema) v: FileIdRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.admin.removeFileById(v.params.id, req.user!._id);
    return { success: true, data, message: "Fayl o'chirildi" };
  }
}
