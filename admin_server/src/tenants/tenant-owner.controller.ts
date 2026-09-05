import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { TenantDbService } from '../tenant-db/tenant-db.service.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { DeveloperAdminGuard } from '../common/guards/developer-admin.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import {
  SetOwnerPasswordDto,
  TenantOwnerCredentialsDto,
} from './dto/tenant-owner.dto.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LOYIHA EGASI — KIRISH MA'LUMOTLARI.
 *
 * ── ⚠ NEGA FAQAT SUPER_ADMIN ──
 *
 * Javobda parol OCHIQ MATNDA ketadi (tenant tomonida parollar shunday
 * saqlanadi — ataylab qabul qilingan qaror). Ya'ni bu marshrut mijoz
 * tizimiga to'liq kirish huquqini beradi. ADMIN va VIEWER ko'rmaydi.
 *
 * ── NEGA ADMIN BAZASIDA NUSXA SAQLANMAYDI ──
 *
 * Parol faqat tenant bazasida yashaydi va shu yerdan O'QILADI. Nusxa
 * saqlash ikkita muammo tug'dirardi: ikkinchi haqiqat manbai (mijoz
 * parolni o'zi almashtirsa panel eskisini ko'rsatardi) va ikkinchi sizib
 * chiqish nuqtasi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@UseGuards(JwtAuthGuard, DeveloperAdminGuard, RolesGuard)
@Roles('SUPER_ADMIN')
@Controller('tenants/:id/owner')
export class TenantOwnerController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantDb: TenantDbService,
  ) {}

  private async loadTenant(id: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id } });
    if (!tenant) throw new NotFoundException('Loyiha topilmadi');
    return tenant;
  }

  /**
   * Mavjud egani o'qiydi.
   *
   * Baza hali yaratilmagan (DRAFT/PROVISIONING) yoki tenant boshqa
   * mashinada bo'lib javob bermayotgan holat XATO EMAS — panel buni
   * "hali tayyor emas" deb ko'rsatishi kerak, 500 emas.
   */
  @Get()
  async find(@Param('id') id: string) {
    const tenant = await this.loadTenant(id);

    try {
      const owner = await this.tenantDb.findOwner(tenant);
      if (!owner) return { reachable: true, exists: false };
      return { reachable: true, exists: true, owner };
    } catch (err) {
      return {
        reachable: false,
        exists: false,
        error: (err as Error).message,
      };
    }
  }

  /** Ega yo'q bo'lsa yaratadi (mavjud loyihalar uchun). */
  @Post()
  async create(
    @Param('id') id: string,
    @Body() dto: TenantOwnerCredentialsDto,
  ) {
    const tenant = await this.loadTenant(id);

    const existing = await this.tenantDb.findOwner(tenant).catch(() => {
      throw new BadRequestException(
        "Loyiha bazasiga ulanib bo'lmadi — provisioning tugaganini tekshiring",
      );
    });
    if (existing) {
      throw new BadRequestException('Bu loyihada ega allaqachon mavjud');
    }

    try {
      const owner = await this.tenantDb.createOwner(tenant, {
        username: dto.ownerUsername,
        password: dto.ownerPassword,
        firstName: dto.ownerFirstName,
        lastName: dto.ownerLastName,
      });
      return { exists: true, owner };
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }

  /** Parolni almashtirish. Tirik seanslar bekor qilinadi. */
  @Put('password')
  async setPassword(
    @Param('id') id: string,
    @Body() dto: SetOwnerPasswordDto,
  ) {
    const tenant = await this.loadTenant(id);

    const owner = await this.tenantDb.findOwner(tenant).catch(() => null);
    if (!owner) throw new NotFoundException('Bu loyihada ega topilmadi');

    try {
      await this.tenantDb.setOwnerPassword(tenant, owner.id, dto.password);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }

    return { ok: true, username: owner.username, password: dto.password };
  }
}
