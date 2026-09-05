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
 * LOYIHA EGASI — LOGIN KO'RINADI, PAROL KO'RINMAYDI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── ⚠ NIMA O'ZGARDI ──
 *
 * Ilgari `GET` javobida parol OCHIQ MATNDA ketardi va panel uni ko'z
 * tugmasi bilan ko'rsatardi. Bu yo'l YOPILDI:
 *
 *   • parol tenant bazasida `scrypt` hash sifatida yotadi;
 *   • hech bir endpoint uni qaytarmaydi;
 *   • admin faqat QAYTA O'RNATA oladi (`POST password/reset`) va yangi
 *     parol javobda BIR MARTA ko'rinadi — u hech qayerda saqlanmaydi.
 *
 * Sabab oddiy: parolni ko'rish uchun uni qaytariladigan shaklda saqlash
 * kerak, ya'ni bitta baza nusxasi HAR BIR markazning to'liq huquqli
 * hisobini ochib berardi. Qo'llab-quvvatlash uchun "ko'rish" shart
 * emas — "qayta o'rnatish" yetarli.
 *
 * ── ESKI HISOBLAR ──
 * Ustunda hali ochiq parol yotgan bo'lishi mumkin. `POST password/upgrade`
 * uni parolni O'ZGARTIRMASDAN hash'ga o'giradi: mijoz o'z parolini
 * bilishda davom etadi, bazadan esa uni o'qib bo'lmaydi.
 *
 * ── NEGA FAQAT SUPER_ADMIN ──
 * Parolni qayta o'rnatish — mijoz tizimiga kirish yo'lini ochish
 * (yangi parol admin qo'lida bo'ladi). ADMIN va VIEWER ko'rmaydi.
 *
 * ── NEGA ADMIN BAZASIDA NUSXA SAQLANMAYDI ──
 * Ega hisobi faqat tenant bazasida yashaydi. Nusxa ikkinchi haqiqat
 * manbai va ikkinchi sizish nuqtasi bo'lardi.
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
    // `vps` BILAN: tenant masofaviy VPS'da bo'lsa `TenantDbService`
    // ulanishni SSH tunnel orqali ochadi.
    const tenant = await this.prisma.tenant.findUnique({ where: { id }, include: { vps: true } });
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

    // ⚠ Parol JAVOBDA QAYTARILMAYDI. Uni admin allaqachon biladi (o'zi
    // yozdi); qaytarish uni yana bir marta log va tarmoq bo'ylab
    // yubordan o'tkazardi.
    return { ok: true, username: owner.username };
  }

  /**
   * PAROLNI QAYTA O'RNATISH — vaqtinchalik parol yaratiladi va javobda
   * BIR MARTA qaytadi.
   *
   * ⚠ IKKINCHI MARTA OLIB BO'LMAYDI: bazada faqat hash qoladi. Panel
   * buni ochiq aytadi va nusxa olishni taklif qiladi.
   */
  @Post('password/reset')
  async resetPassword(@Param('id') id: string) {
    const tenant = await this.loadTenant(id);

    const owner = await this.tenantDb.findOwner(tenant).catch(() => null);
    if (!owner) throw new NotFoundException('Bu loyihada ega topilmadi');

    try {
      const { password } = await this.tenantDb.resetOwnerPassword(tenant, owner.id);
      return {
        ok: true,
        username: owner.username,
        password,
        once: true,
        message: "Bu parol FAQAT HOZIR ko'rinadi — nusxa oling va mijozga yetkazing.",
      };
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }

  /**
   * Eski OCHIQ parolni hash'ga o'girish — parolni o'zgartirmasdan.
   * Mijoz o'z paroli bilan kirishda davom etadi.
   */
  @Post('password/upgrade')
  async upgrade(@Param('id') id: string) {
    const tenant = await this.loadTenant(id);
    try {
      const result = await this.tenantDb.upgradeOwnerHash(tenant);
      return {
        ok: true,
        result,
        message: {
          upgraded: "Parol himoyalandi — mijoz paroli o'zgarmadi.",
          already: 'Parol allaqachon himoyalangan.',
          missing: "Ega yoki parol topilmadi.",
        }[result],
      };
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }
}
