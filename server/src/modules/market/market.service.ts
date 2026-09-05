import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { withLegacyId, withLegacyIds } from '../../common/utils/serialize.js';
import {
  branchFilter,
  getAllowedBranchIds,
} from '../../common/als/branch-context.js';
import { BranchAccessService } from '../../common/rbac/branch-access.service.js';
import { hasPermission } from '../../common/rbac/permission.service.js';
import { PERMISSIONS } from '../../common/constants/permissions.js';
import { CoinService } from '../coin/index.js';
import { CoinSettingsService } from '../coin/index.js';
import { NotificationsService } from '../notifications/index.js';
import {
  MARKET_ORDER_STATUS_LABELS,
  MARKET_ORDER_TRANSITIONS,
  MARKET_REFUND_STATUSES,
  MARKET_STUDENT_CANCELABLE,
  type MarketOrderStatusValue,
} from '../../common/constants/coin.js';
import type { AuthenticatedUser } from '../../common/types/authenticated-request.js';

const DAY_MS = 24 * 60 * 60 * 1000;

const PRODUCT_SELECT = {
  id: true, name: true, description: true, imageUrl: true, price: true,
  stock: true, deliveryInfo: true, deliveryDays: true, isActive: true,
  sortOrder: true, branchId: true, createdAt: true, updatedAt: true,
};

const ORDER_USER_SELECT = {
  id: true, firstName: true, lastName: true, phone: true, role: true,
};

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MARKET — tanga sarflanadigan yagona joy.
 *
 * ── FILIAL KO'LAMI: MAHSULOT IKKI XIL BO'LADI ──
 *   `branchId = NULL`  →  BUTUN markaz uchun (faqat owner qo'ya oladi)
 *   `branchId = "..."` →  faqat o'sha filial o'quvchilariga
 *
 * ⚠ SHU SABABLI ODATIY `branchFilter()` NI TO'G'RIDAN ISHLATIB
 * BO'LMAYDI: u `{ branchId: "X" }` beradi va SQL'da `NULL = 'X'` hech
 * qachon rost bo'lmaydi — ya'ni markazning umumiy mahsulotlari
 * ro'yxatdan JIMGINA yo'qolardi. Shuning uchun har bir so'rovda
 * `OR: [{ branchId: null }, <ko'lam>]` shakli ishlatiladi.
 *
 * ── XARID ATOMIK ──
 * Tanga yechish, zaxira kamaytirish va buyurtma yaratish BITTA
 * tranzaksiyada. Bo'linsa ikki tomonlama xato bo'lardi: tanga yechilib
 * buyurtma yaratilmasa o'quvchi puldan ayrilardi; teskarisi bo'lsa
 * mahsulot tekinga ketardi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class MarketService {
  private readonly logger = new Logger('Market');

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly coins: CoinService,
    private readonly settings: CoinSettingsService,
    private readonly branchAccess: BranchAccessService,
    private readonly notifications: NotificationsService,
  ) {}

  // ──────────────────────── KO'LAM YORDAMCHILARI ────────────────────────

  /**
   * "Markaz umumiysi YOKI mening filialim" filtri.
   *
   * Ko'lam cheklanmagan bo'lsa (owner "barcha filiallar") — bo'sh
   * obyekt, ya'ni hamma narsa ko'rinadi.
   */
  private visibilityFilter(): Record<string, unknown> {
    const scope = branchFilter('branchId');
    if (Object.keys(scope).length === 0) return {};
    return { OR: [{ branchId: null }, scope] };
  }

  /**
   * MARKAZ DARAJASIDAGI VAKOLAT.
   *
   * ⚠ `canSeeAllBranches()` NI ISHLATIB BO'LMAYDI. U KO'RINISH REJIMI,
   * vakolat emas: YAKKA FILIALLI markazda `resolveBranchScope` uni
   * HAMMA UCHUN (egasi uchun ham) `false` qilib qaytaradi — u yerda
   * "barcha filiallar" degan rejim umuman mavjud emas. Unga tayanilsa
   * bitta filialli markazning EGASI o'zining markaz umumiy
   * mahsulotini tahrirlay olmasdi va sabab hech qayerda ko'rinmasdi.
   *
   * Vakolat manbai — RUXSAT: `branches.view_all` butun kodbazada
   * "tashkilot darajasidagi odam" belgisi (`OWNER_ONLY_PERMISSIONS`).
   */
  private isOrgLevel(permissions?: string[]): boolean {
    return hasPermission(permissions, PERMISSIONS.BRANCHES_VIEW_ALL);
  }

  /** Yozish uchun: mahsulot joriy ko'lamda ekanini tekshiradi. */
  private assertProductWritable(
    product: { branchId: string | null },
    permissions?: string[],
  ): void {
    if (this.isOrgLevel(permissions)) return;

    if (product.branchId === null) {
      // ⚠ MARKAZ UMUMIY MAHSULOTI — u BARCHA filiallarda ko'rinadi,
      // ya'ni uning narxini o'zgartirish boshqa filiallarga ham
      // ta'sir qiladi. Bitta filial direktori bunday qarorni
      // yolg'iz qabul qila olmaydi.
      throw new ApiError(403, 'Markaz umumiy mahsulotini faqat egasi tahrirlaydi');
    }

    const allowed = getAllowedBranchIds();
    if (!allowed.includes(String(product.branchId))) {
      throw new ApiError(403, 'Bu mahsulot sizning filialingizga tegishli emas');
    }
  }

  // ─────────────────────────── MAHSULOTLAR ───────────────────────────

  async listProducts({
    search,
    includeInactive = false,
    page = 1,
    limit = 20,
  }: {
    search?: string;
    includeInactive?: boolean;
    page?: number;
    limit?: number;
  }) {
    const where: Record<string, unknown> = {
      isDeleted: false,
      ...this.visibilityFilter(),
    };
    if (!includeInactive) where.isActive = true;
    if (search) {
      where.name = { contains: String(search).trim(), mode: 'insensitive' };
    }

    const [items, total] = await Promise.all([
      this.prisma.marketProduct.findMany({
        where: where as never,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          branch: { select: { id: true, name: true } },
          createdBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
      this.prisma.marketProduct.count({ where: where as never }),
    ]);

    return { items: withLegacyIds(items), total };
  }

  /**
   * O'QUVCHI KO'RINISHI — do'kon vitrinasi.
   *
   * Balans bilan BIRGA qaytariladi: klient "yetadi/yetmaydi" ni ikkinchi
   * so'rovsiz ko'rsatishi kerak, aks holda sahifa avval hamma narsani
   * "sotib olish mumkin" qilib chizib, keyin sakrab o'zgarardi.
   */
  async catalog(userId: string, { page = 1, limit = 50 }: { page?: number; limit?: number }) {
    const where: Record<string, unknown> = {
      isDeleted: false,
      isActive: true,
      ...this.visibilityFilter(),
    };

    const [items, total, balance, config] = await Promise.all([
      this.prisma.marketProduct.findMany({
        where: where as never,
        orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
        select: PRODUCT_SELECT,
      }),
      this.prisma.marketProduct.count({ where: where as never }),
      this.coins.getBalance(userId),
      this.settings.get(),
    ]);

    const products = items.map((p) => ({
      ...withLegacyId(p),
      // `stock === null` CHEKSIZ degani — `0` bilan aralashtirib
      // bo'lmaydi (`0` = tugagan).
      inStock: p.stock === null || p.stock > 0,
      affordable: balance >= p.price,
    }));

    return {
      items: products,
      total,
      balance,
      coinLabel: config.coinLabel,
    };
  }

  async getProduct(id: string) {
    const product = await this.prisma.marketProduct.findFirst({
      // FILIAL: `list()` va `catalog` allaqachon `visibilityFilter()` bilan
      // kesilgan, `:id` esa YALANG'OCH edi — begona filialning mahsuloti
      // (narxi, zaxirasi) ID bo'yicha ochilardi. Yozish yo'li
      // (`assertProductWritable`) himoyalangan edi, o'qish yo'li YO'Q.
      //
      // ⚠ `visibilityFilter()`: markaz umumiysi (`branchId = null`)
      // HAMMAGA ko'rinadi — sof `branchFilter()` uni yashirib qo'yardi.
      where: { id: String(id), isDeleted: false, ...this.visibilityFilter() },
      include: { branch: { select: { id: true, name: true } } },
    });
    if (!product) throw new ApiError(404, 'Mahsulot topilmadi');
    return withLegacyId(product);
  }

  async createProduct(
    body: Record<string, any>,
    user: AuthenticatedUser | undefined,
    permissions?: string[],
  ) {
    // ⚠ `null` VA `undefined` FARQ QILADI. `branchId: null` — "butun
    // markaz uchun" degan OCHIQ niyat va uni faqat barcha filialni
    // ko'ra oladigan odam bildira oladi. Maydon umuman berilmasa
    // (`undefined`) filial odatdagidek KONTEKSTDAN hisoblanadi.
    let branchId: string | null;
    if (body.branchId === null) {
      if (!this.isOrgLevel(permissions)) {
        throw new ApiError(403, "Markaz umumiy mahsulotini faqat egasi qo'sha oladi");
      }
      branchId = null;
    } else {
      branchId = await this.branchAccess.resolveBranchForWrite(user, body.branchId ?? null);
    }

    const created = await this.prisma.marketProduct.create({
      data: {
        name: String(body.name).trim(),
        description: body.description ? String(body.description) : '',
        imageUrl: body.imageUrl ? String(body.imageUrl) : '',
        price: Math.trunc(Number(body.price)),
        stock: body.stock === undefined || body.stock === null ? null : Math.trunc(Number(body.stock)),
        deliveryInfo: body.deliveryInfo ? String(body.deliveryInfo) : '',
        deliveryDays: Math.trunc(Number(body.deliveryDays) || 0),
        isActive: body.isActive === undefined ? true : body.isActive === true,
        sortOrder: Math.trunc(Number(body.sortOrder) || 100),
        branchId,
        createdById: user ? String(user._id) : null,
      },
    });

    return withLegacyId(created);
  }

  async updateProduct(id: string, body: Record<string, any>, permissions?: string[]) {
    const product = await this.prisma.marketProduct.findFirst({
      where: { id: String(id), isDeleted: false },
    });
    if (!product) throw new ApiError(404, 'Mahsulot topilmadi');
    this.assertProductWritable(product, permissions);

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = String(body.name).trim();
    if (body.description !== undefined) data.description = String(body.description);
    if (body.imageUrl !== undefined) data.imageUrl = String(body.imageUrl);
    if (body.price !== undefined) data.price = Math.trunc(Number(body.price));
    if (body.stock !== undefined) {
      data.stock = body.stock === null ? null : Math.trunc(Number(body.stock));
    }
    if (body.deliveryInfo !== undefined) data.deliveryInfo = String(body.deliveryInfo);
    if (body.deliveryDays !== undefined) data.deliveryDays = Math.trunc(Number(body.deliveryDays));
    if (body.isActive !== undefined) data.isActive = body.isActive === true;
    if (body.sortOrder !== undefined) data.sortOrder = Math.trunc(Number(body.sortOrder));

    const updated = await this.prisma.marketProduct.update({
      where: { id: String(id) },
      data: data as never,
    });
    return withLegacyId(updated);
  }

  /**
   * SOFT DELETE — yozuv QOLADI.
   *
   * ⚠ HARD DELETE MUMKIN EMAS: buyurtmalar mahsulotga FK bilan
   * bog'langan (`ON DELETE RESTRICT`) va ular tanga sarflanganini
   * ISBOTLAYDI. Mahsulotni o'chirib yuborish o'quvchining "men buni
   * sotib olgandim" degan tarixini yo'q qilardi.
   */
  async removeProduct(id: string, actorId?: string | null, permissions?: string[]) {
    const product = await this.prisma.marketProduct.findFirst({
      where: { id: String(id), isDeleted: false },
    });
    if (!product) throw new ApiError(404, 'Mahsulot topilmadi');
    this.assertProductWritable(product, permissions);

    await this.prisma.marketProduct.update({
      where: { id: String(id) },
      data: {
        isDeleted: true,
        isActive: false,
        deletedAt: new Date(),
        deletedBy: actorId ? String(actorId) : null,
      },
    });
    return { id: String(id) };
  }

  // ─────────────────────────── XARID ───────────────────────────

  async buy(
    { productId, note }: { productId: string; note?: string },
    user: AuthenticatedUser,
  ) {
    const config = await this.settings.get();
    const userId = String(user._id);

    const product = await this.prisma.marketProduct.findFirst({
      where: { id: String(productId), isDeleted: false, isActive: true },
    });
    if (!product) throw new ApiError(404, 'Mahsulot topilmadi');

    // ⚠ KO'RINISH TEKSHIRUVI: boshqa filialning mahsulotini ID orqali
    // sotib olib bo'lmasligi kerak. Ro'yxatda ko'rinmagan narsani
    // xarid qilish yo'li ochiq qolsa, filial chegarasi UI bezagiga
    // aylanardi.
    if (product.branchId !== null) {
      const allowed = getAllowedBranchIds();
      if (allowed.length && !allowed.includes(String(product.branchId))) {
        throw new ApiError(404, 'Mahsulot topilmadi');
      }
    }

    const expectedAt =
      product.deliveryDays > 0 ? new Date(Date.now() + product.deliveryDays * DAY_MS) : null;

    // ⚠ BUYURTMANING FILIALI — XARIDORNIKI, MAHSULOTNIKI EMAS.
    //
    // Buyurtma o'quvchi turgan joyda BAJARILADI: mahsulot qabulxonaga
    // qo'yiladi va uni o'sha filial xodimi topshiradi. Markaz umumiy
    // mahsuloti (`branchId = null`) da mahsulotdan olinsa buyurtma
    // filialsiz qolardi va `listOrders` filtriga UMUMAN tushmasdi —
    // ya'ni hech bir administrator uni ko'rmasdi.
    //
    // Mahsulot filiali zaxira sifatida qoladi: o'quvchiga uy filiali
    // qo'yilmagan bo'lsa (yangi yozuv) buyurtma baribir bir joyga
    // biriktiriladi.
    const branchId =
      (await this.branchAccess.resolveBranchFromUser(userId)) || product.branchId;

    const status: MarketOrderStatusValue = config.orderAutoApprove ? 'approved' : 'pending';

    const order = await this.prisma.$transaction(async (tx) => {
      // ── 1) ZAXIRA ──
      // `stock === null` CHEKSIZ. Aks holda SHARTLI UPDATE: ikki
      // o'quvchi oxirgi mahsulotni bir vaqtda olsa faqat bittasi o'tadi.
      if (product.stock !== null) {
        const res = await tx.marketProduct.updateMany({
          where: { id: product.id, stock: { gte: 1 } },
          data: { stock: { decrement: 1 } },
        });
        if (res.count === 0) throw new ApiError(409, 'Mahsulot qolmagan');
      }

      // ── 2) BUYURTMA ──
      // ⚠ TANGADAN OLDIN. Sabab: ledger yozuvi `refId` (buyurtma ID'si)
      // bilan yozilishi kerak — "qaysi xarid uchun yechildi" degan
      // savol javobsiz qolmasligi uchun. Teskari tartibda buyurtma ID'si
      // hali mavjud emas va uni KEYIN `updateMany` bilan bog'lashga
      // to'g'ri kelardi — o'sha so'rov esa oldingi uzilgan xariddan
      // qolgan `refId = null` yozuvni ham ushlab, TASODIFIY xaridga
      // bog'lab yuborardi.
      //
      // Tanga yetmasa `spendInTx` xato tashlaydi va butun tranzaksiya
      // (buyurtma ham, zaxira ham) bekor bo'ladi.
      const created = await tx.marketOrder.create({
        data: {
          userId,
          productId: product.id,
          // ⚠ SURAT: nom, narx va yetkazish sharti xarid PAYTIDAGI
          // holatda muzlatiladi (model izohiga qarang).
          productName: product.name,
          priceCoins: product.price,
          deliveryInfo: product.deliveryInfo,
          deliveryDays: product.deliveryDays,
          expectedAt,
          status: status as never,
          note: note ? String(note) : '',
          branchId,
          ...(status === 'approved'
            ? { handledAt: new Date() }
            : {}),
        },
      });

      // ── 3) TANGA ── (yetmasa ApiError → butun tranzaksiya bekor)
      await this.coins.spendInTx(tx as never, {
        userId,
        amount: product.price,
        reason: `Market: ${product.name}`,
        refId: created.id,
        branchId,
        // ⚠ IDEMPOTENTLIK: bitta buyurtma bitta marta to'laydi. Klient
        // "Sotib olish" ni ikki marta bossa (sekin tarmoqda odatiy hol)
        // ikkinchi tranzaksiya shu kalitda to'xtaydi.
        sourceKey: `order:${created.id}`,
      });

      return created;
    });

    // Xabar BLOKLAMAYDI: bildirishnoma yuborilmagani uchun xarid bekor
    // qilinmaydi (tanga allaqachon yechilgan).
    void this.notifyOrder(order, 'created').catch((err) =>
      this.logger.warn(`Xarid xabari yuborilmadi: ${err}`),
    );

    return withLegacyId(order);
  }

  // ─────────────────────────── BUYURTMALAR ───────────────────────────

  async myOrders(
    userId: string,
    { page = 1, limit = 20, status }: { page?: number; limit?: number; status?: string },
  ) {
    const where: Record<string, unknown> = { userId: String(userId) };
    if (status) where.status = status;

    const [items, total] = await Promise.all([
      this.prisma.marketOrder.findMany({
        where: where as never,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: { product: { select: { id: true, imageUrl: true, name: true } } },
      }),
      this.prisma.marketOrder.count({ where: where as never }),
    ]);

    return { items: withLegacyIds(items), total };
  }

  async listOrders({
    page = 1,
    limit = 20,
    status,
    userId,
  }: {
    page?: number;
    limit?: number;
    status?: string;
    userId?: string;
  }) {
    // Buyurtmada `branchId` BOR (xaridorning filiali) — bu yerda odatiy
    // filtr yetarli, mahsulotdagi NULL holati takrorlanmaydi.
    const where: Record<string, unknown> = { ...branchFilter('branchId') };
    if (status) where.status = status;
    if (userId) where.userId = String(userId);

    const [items, total] = await Promise.all([
      this.prisma.marketOrder.findMany({
        where: where as never,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: ORDER_USER_SELECT },
          product: { select: { id: true, name: true, imageUrl: true } },
          handledBy: { select: { id: true, firstName: true, lastName: true } },
          branch: { select: { id: true, name: true } },
        },
      }),
      this.prisma.marketOrder.count({ where: where as never }),
    ]);

    return { items: withLegacyIds(items), total };
  }

  /**
   * BUYURTMA JORIY FILIAL KO'LAMIDAMI.
   *
   * ⚠ RO'YXAT FILTRI YETARLI EMAS. `listOrders` ko'lamni qo'llaydi,
   * lekin `GET /market/orders/:id` va holat siljitish ID ni TO'G'RIDAN
   * oladi — ya'ni A filial administratori B filialining buyurtma
   * ID'sini qo'lda kiritib uni topshirilgan deb belgilay olardi.
   * Ro'yxatda ko'rinmagan yozuvga tegib bo'lmasligi kerak.
   */
  private assertOrderInScope(order: { branchId: string | null }): void {
    const scope = branchFilter('branchId');
    if (Object.keys(scope).length === 0) return; // owner / barcha filiallar
    const allowed = getAllowedBranchIds();
    // `branchId = null` — filiali aniqlanmagan buyurtma (xaridor hech
    // qaysi filialga biriktirilmagan). Unga faqat markaz darajasidagi
    // odam tegadi, ya'ni yuqoridagi bo'sh ko'lam shoxi.
    if (!order.branchId || !allowed.includes(String(order.branchId))) {
      throw new ApiError(404, 'Buyurtma topilmadi');
    }
  }

  async getOrder(id: string) {
    const order = await this.prisma.marketOrder.findUnique({
      where: { id: String(id) },
      include: {
        user: { select: ORDER_USER_SELECT },
        product: { select: { id: true, name: true, imageUrl: true } },
        handledBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!order) throw new ApiError(404, 'Buyurtma topilmadi');
    this.assertOrderInScope(order);
    return withLegacyId(order);
  }

  /**
   * HOLATNI SILJITISH — admin.
   *
   * `rejected` / `canceled` ga o'tganda tanga QAYTARILADI va zaxira
   * tiklanadi — ikkalasi ham AYNI tranzaksiyada.
   *
   * ⚠ `refundedAt` IKKI MARTA QAYTARISHNI TO'SADI. Holat grafida
   * `rejected` dan chiqish yo'li yo'q, lekin himoya baribir qoladi:
   * graf kod, `refundedAt` esa MA'LUMOT — kelajakdagi kod xatosi
   * ma'lumotni buza olmaydi.
   */
  async setStatus(
    id: string,
    { status, adminNote }: { status: MarketOrderStatusValue; adminNote?: string },
    actor: AuthenticatedUser,
  ) {
    const order = await this.prisma.marketOrder.findUnique({ where: { id: String(id) } });
    if (!order) throw new ApiError(404, 'Buyurtma topilmadi');
    this.assertOrderInScope(order);

    const current = order.status as MarketOrderStatusValue;
    if (current === status) throw new ApiError(400, 'Holat allaqachon shunday');

    const allowed = MARKET_ORDER_TRANSITIONS[current] || [];
    if (!allowed.includes(status)) {
      throw new ApiError(
        400,
        `«${MARKET_ORDER_STATUS_LABELS[current]}» holatidan «${MARKET_ORDER_STATUS_LABELS[status]}» ga o'tib bo'lmaydi`,
      );
    }

    const mustRefund = MARKET_REFUND_STATUSES.includes(status);

    const updated = await this.prisma.$transaction(async (tx) => {
      // ═══════════════════════════════════════════════════════════════
      // ⚠ IKKI SHARTLI UPDATE — POYGA SHU YERDA HAL BO'LADI
      //
      // Yuqorida o'qilgan `order` — SURAT, qulf emas. Ikki administrator
      // bir vaqtda tugma bossa, ikkalasi ham AYNI eski holatni ko'radi.
      // Tekshiruv faqat JS'da bo'lsa ikkalasi ham o'tib ketardi:
      // bitta buyurtma ikki marta rad etilib, tanga IKKI MARTA
      // qaytarilardi (`refundedAt` ni ikkalasi ham `null` deb ko'rgani
      // uchun).
      //
      // `updateMany` + `where` esa qatorni QULFLAYDI va Postgres qulfni
      // olgach shartni QAYTA tekshiradi — ikkinchisi `count = 0` oladi.
      // ═══════════════════════════════════════════════════════════════

      // 1) O'TISH HUQUQINI EGALLASH — holat hamon o'sha ekanini talab qiladi.
      const claimed = await tx.marketOrder.updateMany({
        where: { id: order.id, status: current as never },
        data: {
          status: status as never,
          adminNote: adminNote !== undefined ? String(adminNote) : order.adminNote,
          handledById: String(actor._id),
          handledAt: new Date(),
          ...(status === 'delivered' ? { deliveredAt: new Date() } : {}),
        },
      });
      if (claimed.count === 0) {
        throw new ApiError(409, "Buyurtma holati o'zgargan — sahifani yangilang");
      }

      // 2) QAYTARISHNI EGALLASH — `refundedAt` bir marta qo'yiladi.
      if (mustRefund) {
        const refundClaim = await tx.marketOrder.updateMany({
          where: { id: order.id, refundedAt: null },
          data: { refundedAt: new Date() },
        });

        if (refundClaim.count === 1) {
          await this.coins.refundInTx(tx as never, {
            userId: String(order.userId),
            amount: order.priceCoins,
            reason: `Market: ${order.productName} — ${MARKET_ORDER_STATUS_LABELS[status]}`,
            refId: order.id,
            branchId: order.branchId,
            // Oxirgi to'siq: qaytarish yozuvi bitta buyurtmaga bitta marta.
            sourceKey: `order-refund:${order.id}`,
          });

          // Zaxira tiklanadi — mahsulot berilmadi. `stock = null`
          // CHEKSIZ degani va `increment` uni o'zgartirmasligi kerak,
          // shuning uchun shart ochiq yozilgan.
          const product = await tx.marketProduct.findUnique({
            where: { id: order.productId },
            select: { stock: true },
          });
          if (product && product.stock !== null) {
            await tx.marketProduct.update({
              where: { id: order.productId },
              data: { stock: { increment: 1 } },
            });
          }
        }
      }

      return tx.marketOrder.findUniqueOrThrow({ where: { id: order.id } });
    });

    void this.notifyOrder(updated, 'status').catch((err) =>
      this.logger.warn(`Buyurtma xabari yuborilmadi: ${err}`),
    );

    return withLegacyId(updated);
  }

  /**
   * O'QUVCHI O'ZI BEKOR QILADI.
   *
   * FAQAT `pending` da. Tasdiqlangandan keyin mahsulot allaqachon
   * tayyorlanayotgan bo'lishi mumkin — o'sha bosqichda bekor qilish
   * qarori adminniki.
   */
  async cancelOwn(id: string, user: AuthenticatedUser) {
    const order = await this.prisma.marketOrder.findUnique({ where: { id: String(id) } });
    if (!order) throw new ApiError(404, 'Buyurtma topilmadi');
    if (String(order.userId) !== String(user._id)) {
      throw new ApiError(403, 'Bu buyurtma sizniki emas');
    }
    if (!MARKET_STUDENT_CANCELABLE.includes(order.status as MarketOrderStatusValue)) {
      throw new ApiError(
        400,
        'Tasdiqlangan buyurtmani bekor qilish uchun administratorga murojaat qiling',
      );
    }

    const updated = await this.prisma.$transaction(async (tx) => {
      // `setStatus` bilan AYNI naqsh: holatni egallash, keyin
      // qaytarishni egallash. O'quvchi "Bekor qilish" ni ikki marta
      // bossa ikkinchisi `count = 0` oladi va tanga ikki marta
      // qaytarilmaydi.
      const claimed = await tx.marketOrder.updateMany({
        where: { id: order.id, status: 'pending' },
        data: { status: 'canceled' },
      });
      if (claimed.count === 0) {
        throw new ApiError(409, "Buyurtma holati o'zgargan — sahifani yangilang");
      }

      const refundClaim = await tx.marketOrder.updateMany({
        where: { id: order.id, refundedAt: null },
        data: { refundedAt: new Date() },
      });

      if (refundClaim.count === 1) {
        await this.coins.refundInTx(tx as never, {
          userId: String(order.userId),
          amount: order.priceCoins,
          reason: `Market: ${order.productName} — bekor qilindi`,
          refId: order.id,
          branchId: order.branchId,
          sourceKey: `order-refund:${order.id}`,
        });
        const product = await tx.marketProduct.findUnique({
          where: { id: order.productId },
          select: { stock: true },
        });
        if (product && product.stock !== null) {
          await tx.marketProduct.update({
            where: { id: order.productId },
            data: { stock: { increment: 1 } },
          });
        }
      }

      return tx.marketOrder.findUniqueOrThrow({ where: { id: order.id } });
    });

    // O'quvchi o'zi bekor qilgan bo'lsa ham xabar yuboriladi: tanga
    // qaytarilgani YOZMA tasdiq bo'lib qolishi kerak.
    void this.notifyOrder(updated, 'status').catch((err) =>
      this.logger.warn(`Bekor qilish xabari yuborilmadi: ${err}`),
    );

    return withLegacyId(updated);
  }

  // ─────────────────────── BILDIRISHNOMA ───────────────────────

  /**
   * O'QUVCHIGA XABAR — "qanday olaman va qachon yetadi".
   *
   * ⚠ MATNDA UCHTA NARSA BO'LISHI SHART (talab): mahsulot, OLISH
   * YO'LI (`deliveryInfo`) va MUDDAT (`expectedAt`). Yetkazish
   * ma'lumoti buyurtmadan olinadi, mahsulotdan EMAS — mahsulot
   * keyin o'zgargan bo'lsa ham o'quvchiga xarid paytida aytilgan
   * shart borishi kerak.
   *
   * `audience: auto_system` — bu tur HTTP validatorida yo'q va filial
   * ko'lamini QO'LLAMAYDI. Bu ataylab: xabarni TIZIM yuboryapti,
   * oluvchi esa allaqachon aniq (xaridorning o'zi).
   *
   * `dedupeKey` — bir holat uchun BITTA xabar: `setStatus` qayta
   * chaqirilsa (yoki ikki admin bir vaqtda bossa) ikkinchi push
   * yuborilmaydi.
   */
  private async notifyOrder(
    order: {
      id: string;
      userId: string;
      productName: string;
      priceCoins: number;
      deliveryInfo: string;
      deliveryDays: number;
      expectedAt: Date | null;
      status: string;
      adminNote?: string;
    },
    trigger: 'created' | 'status',
  ): Promise<void> {
    const config = await this.settings.get();
    const coin = config.coinLabel || 'tanga';
    const status = order.status as MarketOrderStatusValue;

    const lines: string[] = [];
    let title: string;

    if (trigger === 'created') {
      title = 'Xaridingiz qabul qilindi';
      lines.push(`«${order.productName}» — ${order.priceCoins} ${coin}`);
      lines.push(
        status === 'approved'
          ? 'Holat: tasdiqlandi, tayyorlanmoqda.'
          : 'Holat: tasdiq kutilmoqda.',
      );
    } else {
      title = `Buyurtma holati: ${MARKET_ORDER_STATUS_LABELS[status]}`;
      lines.push(`«${order.productName}» — ${MARKET_ORDER_STATUS_LABELS[status]}.`);
      if (MARKET_REFUND_STATUSES.includes(status)) {
        lines.push(`${order.priceCoins} ${coin} hisobingizga qaytarildi.`);
      }
      if (order.adminNote) lines.push(`Izoh: ${order.adminNote}`);
    }

    // ── QANDAY OLINADI ──
    if (order.deliveryInfo && !MARKET_REFUND_STATUSES.includes(status)) {
      lines.push(`Qanday olish: ${order.deliveryInfo}`);
    }

    // ── QACHON YETADI ──
    if (status === 'delivered') {
      lines.push('Mahsulot topshirildi. Foydalanib yuring!');
    } else if (status === 'ready') {
      lines.push('Mahsulot tayyor — administratordan olib ketishingiz mumkin.');
    } else if (!MARKET_REFUND_STATUSES.includes(status)) {
      if (order.expectedAt) {
        const d = new Date(order.expectedAt);
        const day = String(d.getUTCDate()).padStart(2, '0');
        const month = String(d.getUTCMonth() + 1).padStart(2, '0');
        lines.push(
          `Taxminiy muddat: ${order.deliveryDays} kun (${day}.${month}.${d.getUTCFullYear()} gacha).`,
        );
      } else {
        lines.push('Taxminiy muddat: administrator tayyor bo\'lishi bilan xabar beradi.');
      }
    }

    await this.notifications.send(
      {
        title,
        body: lines.join('\n'),
        category: 'other',
        audience: { type: 'auto_system', userIds: [String(order.userId)] },
        isAuto: true,
        dedupeKey: `market_order:${order.id}:${status}`,
      },
      null,
    );
  }
}
