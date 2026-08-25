import {
  Controller, Delete, Get, HttpCode, Patch, Post, Req, UseGuards,
} from '@nestjs/common';
import { MarketService } from './market.service.js';
import { CoinSettingsService } from '../coin/coin-settings.service.js';
import { CoinSwitchGuard, RequiresMarket } from '../coin/coin-switch.guard.js';
import { PermissionsGuard } from '../../common/guards/permissions.guard.js';
import { Permissions, Validated } from '../../common/decorators/index.js';
import { COIN_PERMISSIONS } from '../../common/constants/coin.js';
import { parsePagination, buildMeta } from '../../common/utils/pagination.js';
import type { AuthenticatedRequest } from '../../common/types/authenticated-request.js';
import {
  productIdSchema, productListSchema, productCreateSchema, productUpdateSchema,
  buySchema, orderListSchema, orderStatusSchema, orderIdSchema,
  type ProductIdRequest, type ProductListRequest, type ProductCreateRequest,
  type ProductUpdateRequest, type BuyRequest, type OrderListRequest,
  type OrderStatusRequest, type OrderIdRequest,
} from '../coin/coin.validators.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MARKET — `/market/*`
 *
 * ⚠⚠ E'LON TARTIBI: `/catalog`, `/orders*` `GET /products/:id` DAN
 * OLDIN turishi shart emas (ular boshqa prefiksda), lekin
 * `GET /orders/my` `GET /orders/:id` DAN OLDIN turishi SHART — aks
 * holda "my" buyurtma ID'si deb o'qilib, o'quvchi o'z ro'yxati
 * o'rniga 404 olardi.
 *
 * ── UCH XIL HIMOYA ──
 *  1. `/catalog`, `POST /buy`, `/orders/my`, `POST /orders/:id/cancel`
 *     — RUXSATSIZ: har qanday o'quvchi o'zi uchun ishlatadi.
 *  2. `GET /products*`, `GET /orders` — `market.read`.
 *  3. Mahsulot yozish — `market.manage`; buyurtma holati —
 *     `market.fulfill`.
 *
 * ⚠ BUTUN KONTROLLER `@RequiresMarket()` OSTIDA (sinf darajasida):
 * do'kon o'chirilgan bo'lsa BITTA marshrut ham javob bermaydi. Sozlama
 * marshrutlari bu yerda EMAS (`/coins/settings`), ya'ni o'zini qulflab
 * qo'yish xavfi yo'q.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Controller('market')
@RequiresMarket()
@UseGuards(CoinSwitchGuard, PermissionsGuard)
export class MarketController {
  constructor(
    private readonly market: MarketService,
    private readonly settings: CoinSettingsService,
  ) {}

  // ───────────────────────── O'QUVCHI ─────────────────────────

  /** DO'KON VITRINASI — balans bilan birga (ikkinchi so'rov kerak emas). */
  @Get('catalog')
  async catalog(
    @Validated(productListSchema) _v: ProductListRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const { page, limit } = parsePagination(req.query as Record<string, unknown>);
    const data = await this.market.catalog(String(req.user!._id), { page, limit });
    return {
      success: true,
      data: data.items,
      meta: {
        ...buildMeta({ page, limit, total: data.total }),
        balance: data.balance,
        coinLabel: data.coinLabel,
      },
    };
  }

  @Post('buy')
  @HttpCode(201)
  async buy(@Validated(buySchema) v: BuyRequest, @Req() req: AuthenticatedRequest) {
    const data = await this.market.buy(v.body, req.user!);
    return { success: true, data, message: 'Xaridingiz qabul qilindi' };
  }

  /** ⚠ `GET /orders/:id` DAN OLDIN. */
  @Get('orders/my')
  async myOrders(
    @Validated(orderListSchema) v: OrderListRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const { page, limit } = parsePagination(req.query as Record<string, unknown>);
    const { items, total } = await this.market.myOrders(String(req.user!._id), {
      page,
      limit,
      status: v.query.status,
    });
    return { success: true, data: items, meta: buildMeta({ page, limit, total }) };
  }

  /** O'quvchi O'ZI bekor qiladi — faqat `pending` holatida. */
  @Post('orders/:id/cancel')
  @HttpCode(200)
  async cancelOwn(
    @Validated(orderIdSchema) v: OrderIdRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.market.cancelOwn(v.params.id, req.user!);
    return { success: true, data, message: 'Buyurtma bekor qilindi, tanga qaytarildi' };
  }

  // ───────────────────────── MAHSULOTLAR ─────────────────────────

  @Get('products')
  @Permissions(COIN_PERMISSIONS.MARKET_READ, COIN_PERMISSIONS.MARKET_MANAGE)
  async listProducts(
    @Validated(productListSchema) v: ProductListRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const { page, limit } = parsePagination(req.query as Record<string, unknown>);
    const { items, total } = await this.market.listProducts({
      search: v.query.search,
      includeInactive: v.query.includeInactive,
      page,
      limit,
    });
    return { success: true, data: items, meta: buildMeta({ page, limit, total }) };
  }

  @Get('products/:id')
  @Permissions(COIN_PERMISSIONS.MARKET_READ, COIN_PERMISSIONS.MARKET_MANAGE)
  async getProduct(@Validated(productIdSchema) v: ProductIdRequest) {
    return { success: true, data: await this.market.getProduct(v.params.id) };
  }

  @Post('products')
  @HttpCode(201)
  @Permissions(COIN_PERMISSIONS.MARKET_MANAGE)
  async createProduct(
    @Validated(productCreateSchema) v: ProductCreateRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.market.createProduct(v.body, req.user, req.permissions);
    return { success: true, data, message: "Mahsulot qo'shildi" };
  }

  @Patch('products/:id')
  @Permissions(COIN_PERMISSIONS.MARKET_MANAGE)
  async updateProduct(
    @Validated(productUpdateSchema) v: ProductUpdateRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.market.updateProduct(v.params.id, v.body, req.permissions);
    return { success: true, data, message: 'Saqlandi' };
  }

  @Delete('products/:id')
  @Permissions(COIN_PERMISSIONS.MARKET_MANAGE)
  async removeProduct(
    @Validated(productIdSchema) v: ProductIdRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    await this.market.removeProduct(v.params.id, String(req.user!._id), req.permissions);
    return { success: true, message: "Mahsulot o'chirildi" };
  }

  // ───────────────────────── BUYURTMALAR (ADMIN) ─────────────────────────

  @Get('orders')
  @Permissions(COIN_PERMISSIONS.MARKET_READ, COIN_PERMISSIONS.MARKET_FULFILL)
  async listOrders(
    @Validated(orderListSchema) v: OrderListRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const { page, limit } = parsePagination(req.query as Record<string, unknown>);
    const { items, total } = await this.market.listOrders({
      page,
      limit,
      status: v.query.status,
      userId: v.query.userId,
    });
    return { success: true, data: items, meta: buildMeta({ page, limit, total }) };
  }

  @Get('orders/:id')
  @Permissions(COIN_PERMISSIONS.MARKET_READ, COIN_PERMISSIONS.MARKET_FULFILL)
  async getOrder(@Validated(orderIdSchema) v: OrderIdRequest) {
    return { success: true, data: await this.market.getOrder(v.params.id) };
  }

  @Patch('orders/:id/status')
  @Permissions(COIN_PERMISSIONS.MARKET_FULFILL)
  async setStatus(
    @Validated(orderStatusSchema) v: OrderStatusRequest,
    @Req() req: AuthenticatedRequest,
  ) {
    const data = await this.market.setStatus(v.params.id, v.body, req.user!);
    return { success: true, data, message: 'Holat yangilandi' };
  }
}
