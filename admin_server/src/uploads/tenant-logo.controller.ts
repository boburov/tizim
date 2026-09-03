import {
  Controller,
  Delete,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MAX_LOGO_BYTES, TenantLogoService } from './tenant-logo.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { DeveloperAdminGuard } from '../common/guards/developer-admin.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';

/**
 * Loyiha logosini yuklash.
 *
 * ⚠ VIEWER YO'Q: logo — mijozning brendi, uni almashtirish tashqi
 * ko'rinadigan o'zgarish. O'qish uchun alohida marshrut kerak emas —
 * `logoUrl` tenant obyektida allaqachon qaytadi.
 */
@UseGuards(JwtAuthGuard, DeveloperAdminGuard, RolesGuard)
@Roles('SUPER_ADMIN', 'ADMIN')
@Controller('tenants/:id/logo')
export class TenantLogoController {
  constructor(private readonly logos: TenantLogoService) {}

  @Post()
  @UseInterceptors(
    FileInterceptor('file', {
      // ⚠ Chegara SHU YERDA ham qo'yiladi: multer xotiraga yozishdan
      // OLDIN to'xtatadi, servisdagi tekshiruv esa keyin. Ikkalasi kerak —
      // birinchisi resursni, ikkinchisi aniq xato matnini beradi.
      limits: { fileSize: MAX_LOGO_BYTES, files: 1 },
    }),
  )
  upload(@Param('id') id: string, @UploadedFile() file?: Express.Multer.File) {
    return this.logos.upload(id, file);
  }

  @Delete()
  remove(@Param('id') id: string) {
    return this.logos.remove(id);
  }
}
