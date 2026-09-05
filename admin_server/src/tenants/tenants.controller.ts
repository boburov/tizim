import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { TenantsService } from './tenants.service.js';
import { CreateTenantDto } from './dto/create-tenant.dto.js';
import { DeleteTenantDto } from './dto/delete-tenant.dto.js';
import { UpdateBrandDto } from './dto/update-brand.dto.js';
import { UpdateSettingsDto } from './dto/update-settings.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator.js';
import { AdminCreateTenantDto } from './dto/admin-create-tenant.dto.js';

/**
 * Tenant repositoriysidagi GitHub Action chaqiradigan deploy hook.
 *
 * ATAYLAB alohida controller va alohida yo'l prefiksi:
 *   - JWT guard'i YO'Q — chaqiruvchi admin emas, GitHub Actions runner'i.
 *     Autentifikatsiya `Authorization: Bearer <deployToken>` orqali,
 *     servis qatlamida bajariladi.
 *   - `tenants/*` ostida emas — u yerda `:id` parametrli yo'llar bor va
 *     himoyalanmagan yo'lni ular orasiga qo'yish kelajakda oson xatoga
 *     olib keladi (guard qo'shishni unutish).
 */
@Controller('tenant-deploy')
export class TenantDeployController {
  constructor(private readonly tenants: TenantsService) {}

  @Post('hook')
  @HttpCode(200)
  hook(@Headers('authorization') auth: string, @Body() body: { ref?: string }) {
    const token = (auth || '').replace(/^Bearer\s+/i, '').trim();
    return this.tenants.deployHook(token, body?.ref);
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenants: TenantsService) {}

  @Get()
  findAll() {
    return this.tenants.findAll();
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.tenants.findOne(id);
  }

  // Sayt preview: URL + sayt javob berayotganini tekshirish
  @Get(':id/preview')
  preview(@Param('id') id: string) {
    return this.tenants.preview(id);
  }

  // Yaratish va provisioning — SUPER_ADMIN va ADMIN
  /**
   * ⚠ `AdminCreateTenantDto` — ega login/paroli MAJBURIY.
   *
   * Ilgari provisioning hech qanday foydalanuvchi yaratmasdi va yangi
   * loyihaga kirishning yo'li yo'q edi. Maydonlar shu yerda majburiy,
   * bazaviy `CreateTenantDto` esa tegilmaydi.
   */
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post()
  create(@Body() dto: AdminCreateTenantDto, @CurrentUser() user: AuthUser) {
    return this.tenants.create(dto, user.email, undefined, {
      username: dto.ownerUsername,
      password: dto.ownerPassword,
      firstName: dto.ownerFirstName,
      lastName: dto.ownerLastName,
    });
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post(':id/retry')
  retry(@Param('id') id: string) {
    return this.tenants.retry(id);
  }

  // ─────────────────────────────────────────────────────────────── brend

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Patch(':id/brand')
  updateBrand(@Param('id') id: string, @Body() dto: UpdateBrandDto) {
    return this.tenants.updateBrand(id, dto);
  }

  // ────────────────────────────────────────────────────────── sozlamalar

  @Get(':id/settings')
  settings(@Param('id') id: string) {
    return this.tenants.describeSettings(id);
  }

  @Roles('SUPER_ADMIN', 'ADMIN')
  @Patch(':id/settings')
  updateSettings(
    @Param('id') id: string,
    @Body() dto: UpdateSettingsDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.tenants.updateSettings(id, dto.values, user.email);
  }

  /** Kutilayotgan o'zgarishlarni yetkazish (pm2 restart yoki client rebuild). */
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post(':id/apply')
  @HttpCode(200)
  apply(@Param('id') id: string) {
    return this.tenants.applyPending(id);
  }

  // ───────────────────────────────────────────────────────── GitHub repo

  @Get(':id/repo')
  repo(@Param('id') id: string) {
    return this.tenants.repoInfo(id);
  }

  /** Repo yaratish (yo'q bo'lsa) va kodni qayta yuborish. */
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post(':id/repo/sync')
  @HttpCode(200)
  syncRepo(@Param('id') id: string) {
    return this.tenants.syncRepo(id);
  }

  // ──────────────────────────────────────────────────────────── o'chirish

  // O'chirish — qaytarib bo'lmaydi, faqat SUPER_ADMIN
  @Roles('SUPER_ADMIN')
  @Delete(':id')
  @HttpCode(200)
  remove(@Param('id') id: string, @Body() dto: DeleteTenantDto) {
    return this.tenants.remove(id, dto.confirmDomain);
  }

  // Arxiv yozuvini bazadan butunlay tozalash
  @Roles('SUPER_ADMIN')
  @Delete(':id/purge')
  @HttpCode(200)
  purge(@Param('id') id: string) {
    return this.tenants.purge(id);
  }
}
