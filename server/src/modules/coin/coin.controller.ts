import { Controller, Get, HttpCode, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { CoinService } from './coin.service.js';
import { CoinSettingsService } from './coin-settings.service.js';
import { BypassCoinSwitch, CoinSwitchGuard } from './coin-switch.guard.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { Permissions, Roles, Validated } from '../../common/decorators/index.js';
import { ROLES } from '../../common/constants/permissions.js';
import { COIN_PERMISSIONS } from '../../common/constants/coin.js';
import { BranchAccessService } from '../../common/rbac/branch-access.service.js';
import { parsePagination, buildMeta } from '../../common/utils/pagination.js';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.js';
import {
  historySchema, userHistorySchema, leaderboardSchema, adjustSchema,
  settingsUpdateSchema,
  type HistoryRequest, type UserHistoryRequest, type LeaderboardRequest,
  type AdjustRequest, type SettingsUpdateRequest,
} from './coin.validators.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TANGALAR — `/coins/*`
 *
 * ── E'LON TARTIBI ──
 * Bu yerda `GET /:id` UMUMAN YO'Q va bu ataylab: boshqa odamning
 * balansi `/coins/users/:userId` da yashaydi. Shu sababli `/config`,
 * `/me`, `/stats` kabi qat'iy nomlar hech qachon ID deb o'qilmaydi —
 * `feedback` modulidagi tuzoq bu yerda tuzilma darajasida yo'q.
 *
 * ── UCH XIL HIMOYA ──
 *  1. `/config` — RUXSATSIZ VA O'CHIRGICHDAN OZOD. Klient menyuni
 *     ko'rsatish/yashirishni shundan biladi; o'chirilgan holatda ham
 *     javob berishi SHART (aks holda klient "server yiqildi" deb
 *     o'ylardi).
 *  2. `/me*`, `/leaderboard` — RUXSATSIZ, lekin o'chirgich ostida.
 *     Har kim O'ZINIKINI ko'radi.
 *  3. Qolgani — `coin.read` / `coin.manage` / `coin.settings`.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Controller('coins')
@UseGuards(CoinSwitchGuard, PermissionsGuard, RolesGuard)
export class CoinController {
  constructor(
    private readonly coins: CoinService,
    private readonly settings: CoinSettingsService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  /** ⚠ O'CHIRGICHDAN OZOD — modul izohiga qarang. */
  @Get('config')
  @BypassCoinSwitch()
  async config() {
    return { success: true, data: await this.settings.publicConfig() };
  }

  /** O'z hamyonim — ruxsatsiz. */
  @Get('me')
  async me(@Req() req: AuthenticatedRequest) {
    return { success: true, data: await this.coins.getSummary(String(req.user!._id)) };
  }

  @Get('me/history')
  async myHistory(
    @Validated(historySchema) v: HistoryRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const { page, limit } = parsePagination(req.query as Record<string, unknown>);
    const { items, total } = await this.coins.history(String(req.user!._id), {
      page,
      limit,
      kind: v.query.kind,
    });
    return { success: true, data: items, meta: buildMeta({ page, limit, total }) };
  }

  /**
   * REYTING — ruxsatsiz.
   *
   * Ko'lam SERVIS ICHIDA, ALS konteksti orqali (`userBranchCondition`):
   * o'quvchi O'Z filialidagi reytingni ko'radi, ega esa hammasini.
   * Butun markaz bo'yicha bo'lsa kichik filial o'quvchisi hech qachon
   * yuqoriga chiqa olmasdi va reyting rag'bat o'rniga tushkunlik
   * berardi.
   *
   * ⚠ FILIAL ID BU YERDAN UZATILMAYDI. Ilgari `req.branchId` qo'lda
   * berilardi va servis undan O'ZINING filtrini qurardi — ya'ni
   * "kim shu filialda" degan savolning IKKINCHI javobi paydo
   * bo'lardi. Bitta javob bor va u `branch-context.ts` da.
   */
  @Get('leaderboard')
  async leaderboard(@Validated(leaderboardSchema) v: LeaderboardRequest) {
    const data = await this.coins.leaderboard({ limit: v.query.limit });
    return { success: true, data };
  }

  @Get('stats')
  @Permissions(COIN_PERMISSIONS.COIN_READ)
  async stats() {
    return { success: true, data: await this.coins.stats() };
  }

  /** ⚠ O'CHIRGICHDAN OZOD — aks holda qayta yoqib bo'lmasdi. */
  @Get('settings')
  @BypassCoinSwitch()
  @Permissions(COIN_PERMISSIONS.COIN_SETTINGS)
  async getSettings() {
    return { success: true, data: await this.settings.get() };
  }

  /** ⚠ O'CHIRGICHDAN OZOD — bu aynan o'chirgichning o'zi. */
  @Patch('settings')
  @BypassCoinSwitch()
  @Roles(ROLES.OWNER)
  @Permissions(COIN_PERMISSIONS.COIN_SETTINGS)
  async updateSettings(
    @Validated(settingsUpdateSchema) v: SettingsUpdateRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.settings.update(v.body, String(req.user!._id));
    return { success: true, data, message: 'Sozlamalar saqlandi' };
  }

  /**
   * BOSHQA ODAMNING HAMYONI.
   *
   * ⚠ FILIAL KO'LAMI TEKSHIRILADI: `coin.read` filial ichidagi ruxsat,
   * ya'ni direktor boshqa filial o'quvchisining ID'sini qo'lda kiritib
   * uning tarixini o'qiy olmasligi kerak.
   */
  @Get('users/:userId')
  @Permissions(COIN_PERMISSIONS.COIN_READ)
  async userWallet(
    @Validated(userHistorySchema) v: UserHistoryRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.branchAccess.assertUserInBranchScope(v.params.userId);
    const { page, limit } = parsePagination(req.query as Record<string, unknown>);
    const [summary, history] = await Promise.all([
      this.coins.getSummary(v.params.userId),
      this.coins.history(v.params.userId, { page, limit, kind: v.query.kind }),
    ]);
    return {
      success: true,
      data: { account: summary, transactions: history.items },
      meta: buildMeta({ page, limit, total: history.total }),
    };
  }

  /** Qo'lda tanga berish / olib qo'yish. */
  @Post('adjust')
  @HttpCode(201)
  @Permissions(COIN_PERMISSIONS.COIN_MANAGE)
  async adjust(
    @Validated(adjustSchema) v: AdjustRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.branchAccess.assertUserInBranchScope(v.body.userId);
    const data = await this.coins.manualAdjust(
      { userId: v.body.userId, delta: v.body.delta, reason: v.body.reason },
      req.user,
      req.branchId || null,
    );
    return {
      success: true,
      data,
      message: v.body.delta > 0 ? 'Tanga berildi' : "Tanga olib qo'yildi",
    };
  }
}
