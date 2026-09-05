import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { BranchConfigService } from './branch-config.service.js';
import { SettingsService } from '../settings/settings.service.js';
import {
  AdjustBranchLimitDto,
  GrantBranchAddonDto,
  RevokeBranchAddonDto,
  UpdateBranchConfigDto,
} from './dto/branch-config.dto.js';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard.js';
import { DeveloperAdminGuard } from '../common/guards/developer-admin.guard.js';
import { RolesGuard } from '../common/guards/roles.guard.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import {
  CurrentUser,
  AuthUser,
} from '../common/decorators/current-user.decorator.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FILIAL KONFIGURATSIYASI — DEVELOPER ADMIN MARSHRUTLARI.
 *
 * ⚠ BUTUN KONTROLLER `JwtAuthGuard` OSTIDA — bu ADMIN PANEL sessiyasi
 * (`AdminUser`), mijoz portali sessiyasi (`CustomerJwtGuard`) EMAS.
 * Ya'ni mijozning tokeni bu yerga umuman yetib kelmaydi.
 *
 * O'QISH ham admin panelga ochiq (VIEWER ko'ra oladi), YOZISH esa
 * SUPER_ADMIN/ADMIN da. Mijoz o'z chegarasini `/customers/tenants/:id/usage`
 * orqali FAQAT O'QIYDI.
 *
 * ── ⚠ UCHTA GUARD, UCHTA BOSHQA SAVOL ──
 *
 *   JwtAuthGuard        — token haqiqiymi (kimligini isbotladimi);
 *   DeveloperAdminGuard — bu identifikator BIZNING xodimimizmi;
 *   RolesGuard          — bu rol shu amalni bajara oladimi.
 *
 * O'rtadagisi kerak, chunki admin va mijoz tokenlari BIR XIL
 * `JWT_ACCESS_SECRET` bilan imzolanadi va ularni faqat `aud` ajratadi.
 * Hozir mijoz tokenida `role` yo'q va u shu sababdan to'siladi — lekin bu
 * TASODIFIY himoya. `DeveloperAdminGuard` shartni OCHIQ qo'yadi, ya'ni
 * mijoz payload'i kelajakda kengaysa ham bu marshrutlar yopiq qoladi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
// ⚠ UCHTA QO'RIQCHI, UCHTA BOSHQA SAVOL — tartib muhim:
//   JwtAuthGuard        — "kim bu?"          (token haqiqiymi)
//   DeveloperAdminGuard — "bizning odammi?"  (mijoz tokeni RAD ETILADI)
//   RolesGuard          — "nima qila oladi?" (@Roles bo'yicha)
//
// O'rtadagisi ATAYLAB alohida: kelajakda `@Roles(...)` yozishni unutgan
// yangi marshrut ham mijozga OCHILMAYDI.
@UseGuards(JwtAuthGuard, DeveloperAdminGuard, RolesGuard)
@Controller('tenants/:id')
export class BranchConfigController {
  constructor(
    private readonly branchConfig: BranchConfigService,
    private readonly settings: SettingsService,
  ) {}

  /**
   * ═════════════════════════════════════════════════════════════════════
   * FILIAL CHEGARASI O'ZGARGACH TENANT `.env` NI "KUTILMOQDA" DEB BELGILASH.
   *
   * ── NEGA KERAK ──
   *
   * `BRANCHES_ENABLED` va `BRANCH_LIMIT` tenant `.env` iga YOZILADI
   * (`settings.service.buildManagedValues`). Bu qiymat ATAYLAB bor:
   * heartbeat har 15 daqiqada keladi va jarayon ko'tarilgandan keyingi
   * BIRINCHI heartbeat'gacha tenant limitni bilmaydi — kesh bo'sh
   * bo'lsa "cheksiz" deb o'qiladi.
   *
   * Panelda chegara o'zgartirilganda admin bazasi va audit yozuvi
   * yangilanardi, lekin `.env` "kutilmoqda" deb BELGILANMASDI. Natijada:
   * operator chegarani 10 dan 2 ga tushiradi → heartbeat uni yetkazadi →
   * ammo tenant qayta ishga tushsa, `.env` dagi ESKI qiymat (10) yana
   * kuchga kirardi va keyingi heartbeat'gacha oyna ochilib qolardi.
   *
   * `markPending()` HECH NARSANI qayta ishga tushirmaydi — u faqat
   * "qo'llash kutilmoqda" belgisini qo'yadi, ya'ni panel buni ko'rsatadi
   * va keyingi "Qo'llash" `.env` ni yangilaydi. Jonli yetkazib berish
   * ilgarigidek heartbeat zimmasida qoladi.
   *
   * ⚠ XATO SO'ROVNI YIQITMAYDI: chegara ALLAQACHON saqlangan va audit
   * yozilgan. Belgilashdagi nosozlik uchun butun amalni bekor qilish
   * holatni yomonlashtirardi (`tenant-logo.service` dagi bilan bir xil
   * mulohaza).
   * ═════════════════════════════════════════════════════════════════════
   */
  private async withEnvSync<T>(tenantId: string, run: () => Promise<T>): Promise<T> {
    const result = await run();
    await this.settings.markPending(tenantId).catch(() => undefined);
    return result;
  }

  /** Loyihaning filial konfiguratsiyasi + foydalanish + paketlar. */
  @Get('branch-config')
  describe(@Param('id') id: string) {
    return this.branchConfig.describe(id);
  }

  /** Yengil so'rov: "Used: 3 / Limit: 5 / Remaining: 2". */
  @Get('branch-usage')
  usage(@Param('id') id: string) {
    return this.branchConfig.usage(id);
  }

  /** Rejim va/yoki chegarani yozish. */
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Patch('branch-config')
  update(
    @Param('id') id: string,
    @Body() dto: UpdateBranchConfigDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.withEnvSync(id, () => this.branchConfig.update(id, dto, user.email));
  }

  /** Chegarani bittalab oshirish/kamaytirish (panel "+/-"). */
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Patch('branch-limit')
  adjust(
    @Param('id') id: string,
    @Body() dto: AdjustBranchLimitDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.withEnvSync(id, () =>
      this.branchConfig.adjust(id, dto.delta, user.email, dto.reason),
    );
  }

  /** Pullik filial paketini biriktirish (+1, +5 …). */
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Post('branch-addons')
  @HttpCode(200)
  grant(
    @Param('id') id: string,
    @Body() dto: GrantBranchAddonDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.withEnvSync(id, () =>
      this.branchConfig.grantAddon(id, dto.addonKey, {
        quantity: dto.quantity,
        expiresAt: dto.expiresAt,
        grantedBy: user.email,
        reason: dto.reason,
      }),
    );
  }

  /** Paketni olib qo'yish. */
  @Roles('SUPER_ADMIN', 'ADMIN')
  @Delete('branch-addons/:addonKey')
  @HttpCode(200)
  revoke(
    @Param('id') id: string,
    @Param('addonKey') addonKey: string,
    @Body() dto: RevokeBranchAddonDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.branchConfig.revokeAddon(id, addonKey, user.email, dto?.reason);
  }

  /**
   * TIJORAT O'ZGARISHLARI TARIXI — "kim, qachon, nechtaga, nega".
   *
   * O'qish uchun ochiq (VIEWER ham ko'radi): audit yozuvining butun ma'nosi
   * uni KO'RISH mumkinligida. Faqat yoziladigan, lekin o'qib bo'lmaydigan
   * jurnal hisobot paytida foydasiz.
   */
  @Get('branch-history')
  history(@Param('id') id: string, @Query('limit') limit?: string) {
    const n = Number(limit);
    return this.branchConfig.history(id, Number.isFinite(n) && n > 0 ? n : 20);
  }
}
