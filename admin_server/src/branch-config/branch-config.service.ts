import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  BRANCH_COUNT_METRIC,
  BRANCH_LIMIT_FEATURE_KEY,
  BRANCH_LIMIT_MAX,
  BRANCH_LIMIT_MIN,
  DEFAULT_BRANCH_LIMIT,
  UNLIMITED,
  branchUsage,
  resolveBranchLimit,
  type BranchLimitResult,
} from './branch-config.constants.js';
import { UpdateBranchConfigDto } from './dto/branch-config.dto.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FILIAL KONFIGURATSIYASI — YAGONA HISOBLOVCHI.
 *
 * Bu servisdan TO'RTTA iste'molchi oziqlanadi va hammasi BIR XIL javob
 * oladi — shuning uchun mantiq faqat shu yerda turadi:
 *
 *   1) Developer Admin paneli   (GET /tenants/:id/branch-config)
 *   2) tenant `.env`            (BRANCHES_ENABLED / BRANCH_LIMIT)
 *   3) heartbeat javobi         (`max_branches`, `branches_enabled`)
 *   4) mijozning o'z portali    (faqat O'QISH)
 *
 * ⚠ HISOBLASHNING O'ZI SOF FUNKSIYADA (`resolveBranchLimit`) — bu servis
 * unga faqat bazadan o'qilgan raqamlarni uzatadi. Shu tufayli qoidani
 * bazasiz sinash mumkin (`test/branch-config.test.mjs`).
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class BranchConfigService {
  private readonly logger = new Logger(BranchConfigService.name);

  constructor(private readonly prisma: PrismaService) {}

  /** Tenant + tarif + add-on'lar — chegarani hisoblash uchun kerakli hammasi. */
  private async loadTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: {
        id: true,
        name: true,
        domain: true,
        status: true,
        branchesEnabled: true,
        branchLimitOverride: true,
        subscription: {
          select: {
            status: true,
            plan: {
              select: {
                key: true,
                name: true,
                features: {
                  where: { feature: { key: BRANCH_LIMIT_FEATURE_KEY } },
                  select: { value: true },
                },
              },
            },
          },
        },
        addons: {
          select: {
            id: true,
            isActive: true,
            expiresAt: true,
            createdAt: true,
            quantity: true,
            addon: {
              select: {
                id: true,
                key: true,
                name: true,
                value: true,
                price: true,
                currency: true,
                maxQuantity: true,
                feature: { select: { key: true } },
              },
            },
          },
        },
      },
    });
    if (!tenant) throw new NotFoundException('Loyiha topilmadi');
    return tenant;
  }

  /** Faol (muddati o'tmagan) filial add-on'lari. */
  private branchAddons(tenant: Awaited<ReturnType<typeof this.loadTenant>>) {
    const now = new Date();
    return tenant.addons.filter(
      (ta) =>
        ta.addon.feature?.key === BRANCH_LIMIT_FEATURE_KEY &&
        ta.isActive &&
        (!ta.expiresAt || ta.expiresAt > now),
    );
  }

  /**
   * ENG MUHIM METOD: loyihaning AMALDAGI filial konfiguratsiyasi.
   *
   * Boshqa hamma joy (env, heartbeat, panel) shundan o'qiydi — ikkinchi
   * nusxa yozilmasin, aks holda ular vaqt o'tib ajralib ketadi.
   */
  async effective(tenantId: string): Promise<
    BranchLimitResult & { branchesEnabled: boolean; override: number | null; planLimit: number | null }
  > {
    const tenant = await this.loadTenant(tenantId);
    return this.effectiveFrom(tenant);
  }

  private effectiveFrom(tenant: Awaited<ReturnType<typeof this.loadTenant>>) {
    const planLimit = tenant.subscription?.plan.features[0]?.value ?? null;
    // ⚠ MIQDORGA KO'PAYTIRILADI. `@@unique([tenantId, addonId])` sababli
    // bitta paket loyihada FAQAT BITTA qator bo'la oladi — "+5" ni ikkinchi
    // marta sotib olish uchun ikkinchi qator ochib bo'lmaydi. Miqdorsiz
    // ikkinchi xarid JIMGINA yo'qolardi: upsert mavjud qatorni yangilardi,
    // bonus esa o'zgarmasdi.
    const addonBonus = this.branchAddons(tenant).reduce(
      (sum, ta) => sum + Math.max(0, ta.addon.value) * Math.max(0, ta.quantity),
      0,
    );

    const resolved = resolveBranchLimit({
      branchesEnabled: tenant.branchesEnabled,
      override: tenant.branchLimitOverride,
      planLimit,
      addonBonus,
    });

    return {
      ...resolved,
      branchesEnabled: tenant.branchesEnabled,
      override: tenant.branchLimitOverride,
      planLimit,
    };
  }

  /**
   * Hozirgi filiallar SONI — oxirgi heartbeat snapshot'idan.
   *
   * ⚠ BU RAQAM ~15 DAQIQAGACHA ESKI BO'LISHI MUMKIN (heartbeat davri) va
   * shuning uchun MAJBURLASHDA ISHLATILMAYDI. To'sish tenant serverning
   * O'ZIDA, o'z bazasini sanab bajariladi. Bu yerdagi son faqat panelda
   * ko'rsatish uchun.
   */
  private async usedFromSnapshots(tenantId: string): Promise<number | null> {
    const row = await this.prisma.usageSnapshot.findFirst({
      where: { tenantId, metricKey: BRANCH_COUNT_METRIC },
      orderBy: { recordedAt: 'desc' },
      select: { value: true, recordedAt: true },
    });
    return row ? Number(row.value) : null;
  }

  /** Panel uchun to'liq ko'rinish: konfiguratsiya + foydalanish + add-on'lar. */
  async describe(tenantId: string) {
    const tenant = await this.loadTenant(tenantId);
    const eff = this.effectiveFrom(tenant);
    const used = await this.usedFromSnapshots(tenantId);
    const addons = this.branchAddons(tenant);

    // Sotuvga tayyor filial paketlari — panel shundan tanlaydi.
    const available = await this.prisma.addon.findMany({
      where: { isActive: true, feature: { key: BRANCH_LIMIT_FEATURE_KEY } },
      select: {
        id: true,
        key: true,
        name: true,
        description: true,
        value: true,
        price: true,
        currency: true,
        maxQuantity: true,
      },
      orderBy: { value: 'asc' },
    });

    return {
      tenantId: tenant.id,
      name: tenant.name,
      domain: tenant.domain,
      status: tenant.status,

      branchesEnabled: eff.branchesEnabled,
      // Yakuniy chegara — mijoz aynan shunga tayanadi.
      branchLimit: eff.limit,
      unlimited: eff.unlimited,
      // Qaysi manbadan kelgani: panel "tarifdan" / "qo'lda qo'yilgan" deb yozadi.
      source: eff.source,
      base: eff.base,
      addonBonus: eff.addonBonus,
      override: eff.override,
      planLimit: eff.planLimit,
      planKey: tenant.subscription?.plan.key ?? null,
      planName: tenant.subscription?.plan.name ?? null,
      defaultLimit: DEFAULT_BRANCH_LIMIT,

      // ⚠ `used` null bo'lishi mumkin — hali birorta heartbeat kelmagan.
      // Panel buni "—" deb ko'rsatadi, 0 deb EMAS: nol "filial yo'q"
      // degan MA'LUMOT, null esa "hali bilmaymiz".
      usage:
        used === null
          ? { used: null, limit: eff.limit, remaining: null, limitReached: false, unlimited: eff.unlimited, stale: true }
          : { ...branchUsage(used, eff.limit), stale: false },

      addons: addons.map((ta) => ({
        id: ta.id,
        addonId: ta.addon.id,
        key: ta.addon.key,
        name: ta.addon.name,
        /** Bitta paket nechta filial beradi. */
        value: ta.addon.value,
        /** Necha marta sotib olingan. */
        quantity: ta.quantity,
        /** Shu paketdan kelgan jami filial — panel "+3" ni shundan yozadi. */
        units: Math.max(0, ta.addon.value) * Math.max(0, ta.quantity),
        price: ta.addon.price,
        currency: ta.addon.currency,
        /** Jami to'lov: narx × miqdor. */
        total:
          ta.addon.price === null
            ? null
            : Number(ta.addon.price) * Math.max(0, ta.quantity),
        maxQuantity: ta.addon.maxQuantity,
        expiresAt: ta.expiresAt,
        grantedAt: ta.createdAt,
      })),
      availableAddons: available,

      limits: { min: BRANCH_LIMIT_MIN, max: BRANCH_LIMIT_MAX, unlimitedValue: UNLIMITED },
    };
  }

  /** Faqat foydalanish ko'rsatkichi (panel jadvalida yengil so'rov uchun). */
  async usage(tenantId: string) {
    const eff = await this.effective(tenantId);
    const used = await this.usedFromSnapshots(tenantId);
    return {
      tenantId,
      branchesEnabled: eff.branchesEnabled,
      ...(used === null
        ? { used: null, limit: eff.limit, remaining: null, limitReached: false, unlimited: eff.unlimited, stale: true }
        : { ...branchUsage(used, eff.limit), stale: false }),
    };
  }

  /**
   * Konfiguratsiyani yozadi (Developer Admin).
   *
   * ⚠ MIJOZ BU YO'LGA UMUMAN TUSHMAYDI: kontroller `JwtAuthGuard` +
   * `@Roles('SUPER_ADMIN','ADMIN')` ostida, ya'ni admin panel hisobi
   * talab qilinadi. Mijoz portali (`customer-jwt`) boshqa guard'da.
   */
  async update(tenantId: string, dto: UpdateBranchConfigDto, updatedBy?: string) {
    // ⚠ TO'LIQ YUKLANADI, minimal `select` EMAS: audit uchun o'zgarishdan
    // OLDINGI amaldagi chegara kerak, u esa tarif va paketlarsiz
    // hisoblanmaydi. Ikkinchi so'rov yozish ham mumkin edi, lekin o'sha
    // ikki so'rov orasida holat o'zgarsa audit yolg'on yozib qo'yardi.
    const tenant = await this.loadTenant(tenantId);
    if (tenant.status === 'DELETED') {
      throw new ConflictException("O'chirilgan loyihani tahrirlab bo'lmaydi");
    }
    const before = this.effectiveFrom(tenant);

    const data: { branchesEnabled?: boolean; branchLimitOverride?: number | null } = {};

    if (dto.branchesEnabled !== undefined) {
      data.branchesEnabled = dto.branchesEnabled;
    }

    if (dto.branchLimit !== undefined) {
      // `null` = "tarifga/standartga qaytar" — TenantSetting bilan bir xil qoida.
      if (dto.branchLimit === null) {
        data.branchLimitOverride = null;
      } else if (dto.branchLimit === UNLIMITED) {
        data.branchLimitOverride = UNLIMITED;
      } else if (
        !Number.isInteger(dto.branchLimit) ||
        dto.branchLimit < BRANCH_LIMIT_MIN ||
        dto.branchLimit > BRANCH_LIMIT_MAX
      ) {
        throw new BadRequestException(
          `Filial chegarasi ${BRANCH_LIMIT_MIN}–${BRANCH_LIMIT_MAX} oralig'ida yoki ${UNLIMITED} (cheksiz) bo'lishi kerak`,
        );
      } else {
        data.branchLimitOverride = dto.branchLimit;
      }
    }

    if (!Object.keys(data).length) {
      throw new BadRequestException("O'zgartirish uchun maydon berilmadi");
    }

    await this.prisma.tenant.update({ where: { id: tenantId }, data });

    const after = await this.effective(tenantId);
    const used = await this.usedFromSnapshots(tenantId);

    // ⚠ REJIM VA CHEGARA — IKKI ALOHIDA YOZUV.
    //
    // Bitta so'rovda ikkalasi ham kelishi mumkin, lekin ular boshqa-boshqa
    // qarorlar: "yakka markazga o'tkazdik" va "chegarani 8 ga ko'tardik"
    // bir xil sabab bilan izohlanmaydi. Bitta qatorga qisilsa, tarixni
    // o'qiyotgan odam qaysi biri nima uchun bo'lganini ajrata olmasdi.
    if (data.branchesEnabled !== undefined) {
      await this.recordChange({
        tenantId,
        action: 'BRANCH_MODE',
        enabledBefore: before.branchesEnabled,
        enabledAfter: data.branchesEnabled,
        limitBefore: before.limit,
        limitAfter: after.limit,
        usedAtChange: used,
        actor: updatedBy,
        reason: dto.reason,
      });
    }
    if (data.branchLimitOverride !== undefined) {
      await this.recordChange({
        tenantId,
        action: 'LIMIT_OVERRIDE',
        overrideBefore: before.override,
        overrideAfter: data.branchLimitOverride,
        limitBefore: before.limit,
        limitAfter: after.limit,
        usedAtChange: used,
        actor: updatedBy,
        reason: dto.reason,
      });
    }

    this.logger.log(
      `Filial konfiguratsiyasi o'zgardi (tenant=${tenantId}, by=${updatedBy ?? '-'}): ` +
        `${JSON.stringify(data)} — chegara ${before.limit} → ${after.limit}`,
    );

    return this.describe(tenantId);
  }

  /**
   * Chegarani BITTALAB o'zgartiradi (panel "+1 / -1" tugmalari).
   *
   * ⚠ HOZIRGI AMALDAGI qiymatdan boshlanadi, `override` dan EMAS. Aks
   * holda tarifda 10 ta filiali bor loyihada "+1" bosilsa, chegara
   * jimgina 6 ga (standart 5 + 1) TUSHIB ketardi.
   *
   * ⚠ ADD-ON BONUSI HISOBGA OLINMAYDI — u sotib olingan va o'z-o'zicha
   * qo'shiladi. Aks holda "+1" bosilishi bilan sotib olingan paket
   * qo'lda qo'yilgan qiymatga singib ketardi va paketni bekor qilish
   * chegarani ikki marta pasaytirardi.
   */
  async adjust(tenantId: string, delta: number, updatedBy?: string, reason?: string) {
    if (!Number.isInteger(delta) || delta === 0) {
      throw new BadRequestException("O'zgarish butun va noldan farqli bo'lishi kerak");
    }

    const eff = await this.effective(tenantId);

    if (eff.unlimited) {
      throw new ConflictException(
        'Chegara cheksiz — bittalab o\'zgartirish ma\'nosiz. Avval aniq son qo\'ying.',
      );
    }
    if (!eff.branchesEnabled) {
      throw new ConflictException(
        "Yakka markaz rejimida chegara doim 1 ta. Avval ko'p filialli rejimni yoqing.",
      );
    }

    return this.update(
      tenantId,
      { branchLimit: eff.base + delta, reason },
      updatedBy,
    );
  }

  // ───────────────────────────────────── pullik kengaytma (filial paketi)

  /**
   * Filial paketini biriktiradi (+1, +5 va h.k.).
   *
   * Mavjud `Addon`/`TenantAddon` mexanizmi ISHLATILADI — ikkinchi
   * "qo'shimchalar" tizimi yaratilmaydi. Shu sababli paket narxi,
   * muddati va hisob-kitobi qolgan add-on'lar bilan bir xil yo'ldan
   * o'tadi.
   */
  async grantAddon(
    tenantId: string,
    addonKey: string,
    options: {
      /** Necha marta sotib olinmoqda. Standart 1. */
      quantity?: number;
      expiresAt?: string;
      grantedBy?: string;
      reason?: string;
    } = {},
  ) {
    const { quantity = 1, expiresAt, grantedBy, reason } = options;

    const tenant = await this.loadTenant(tenantId);
    if (tenant.status === 'DELETED') {
      throw new ConflictException("O'chirilgan loyihaga paket biriktirib bo'lmaydi");
    }
    const before = this.effectiveFrom(tenant);

    const addon = await this.prisma.addon.findUnique({
      where: { key: addonKey },
      select: {
        id: true,
        key: true,
        name: true,
        value: true,
        price: true,
        currency: true,
        isActive: true,
        maxQuantity: true,
        feature: { select: { key: true } },
      },
    });
    // ⚠ TUR TEKSHIRUVI: bu endpoint FAQAT filial paketlari uchun. Aks
    // holda u umumiy "istalgan add-on'ni bepul ber" darvozasiga aylanardi.
    if (!addon || addon.feature?.key !== BRANCH_LIMIT_FEATURE_KEY) {
      throw new BadRequestException('Bunday filial paketi topilmadi');
    }
    if (!addon.isActive) {
      throw new BadRequestException("Bu paket sotuvdan olingan");
    }

    if (!Number.isInteger(quantity) || quantity < 1) {
      throw new BadRequestException("Miqdor 1 dan kichik bo'lmagan butun son bo'lishi kerak");
    }

    const expires = expiresAt ? new Date(expiresAt) : null;
    if (expiresAt && Number.isNaN(expires!.getTime())) {
      throw new BadRequestException("Muddat sanasi noto'g'ri");
    }

    // ⚠ MAVJUD MIQDOR USTIGA QO'SHILADI, ALMASHTIRILMAYDI.
    //
    // "Mijozga yana 5 ta kerak" — bu ikkinchi XARID, oldingisining
    // tuzatilishi emas. Almashtirilsa, avval sotib olingan 5 ta jimgina
    // yo'qolardi va mijoz to'lagan filialini yo'qotardi.
    const existing = tenant.addons.find((ta) => ta.addon.id === addon.id);
    const quantityBefore =
      existing && existing.isActive ? Math.max(0, existing.quantity) : 0;
    const quantityAfter = quantityBefore + quantity;

    const cap = addon.maxQuantity ?? null;
    if (cap !== null && quantityAfter > cap) {
      throw new ConflictException(
        `"${addon.name}" paketi loyihaga eng ko'pi ${cap} marta biriktiriladi ` +
          `(hozir ${quantityBefore} ta)`,
      );
    }
    // Paket chegarasi bo'lmasa ham, yakuniy filial soni oqilona qolsin.
    if (before.base + quantityAfter * Math.max(0, addon.value) > BRANCH_LIMIT_MAX) {
      throw new ConflictException(
        `Yakuniy filial chegarasi ${BRANCH_LIMIT_MAX} dan oshib ketadi`,
      );
    }

    await this.prisma.tenantAddon.upsert({
      where: { tenantId_addonId: { tenantId, addonId: addon.id } },
      create: {
        tenantId,
        addonId: addon.id,
        quantity: quantityAfter,
        isActive: true,
        expiresAt: expires,
      },
      update: { quantity: quantityAfter, isActive: true, expiresAt: expires },
    });

    const after = await this.effective(tenantId);
    const used = await this.usedFromSnapshots(tenantId);
    const unitPrice = addon.price === null ? null : Number(addon.price);

    await this.recordChange({
      tenantId,
      action: 'ADDON_GRANT',
      addonKey: addon.key,
      quantityBefore,
      quantityAfter,
      limitBefore: before.limit,
      limitAfter: after.limit,
      usedAtChange: used,
      unitPrice,
      currency: addon.currency,
      // Bu XARIDNING summasi (jami emas): shu amalda qancha sotilgani.
      amount: unitPrice === null ? null : unitPrice * quantity,
      actor: grantedBy,
      reason,
    });

    this.logger.log(
      `Filial paketi biriktirildi (tenant=${tenantId}, addon=${addon.key}, ` +
        `${quantityBefore} → ${quantityAfter}, chegara ${before.limit} → ${after.limit}, ` +
        `by=${grantedBy ?? '-'})`,
    );

    return this.describe(tenantId);
  }

  /** Paketni olib qo'yadi (to'lov qaytarilgan yoki xato biriktirilgan). */
  async revokeAddon(
    tenantId: string,
    addonKey: string,
    revokedBy?: string,
    reason?: string,
  ) {
    const tenant = await this.loadTenant(tenantId);
    const before = this.effectiveFrom(tenant);

    const addon = await this.prisma.addon.findUnique({
      where: { key: addonKey },
      select: {
        id: true,
        price: true,
        currency: true,
        feature: { select: { key: true } },
      },
    });
    if (!addon || addon.feature?.key !== BRANCH_LIMIT_FEATURE_KEY) {
      throw new BadRequestException('Bunday filial paketi topilmadi');
    }

    const existing = tenant.addons.find((ta) => ta.addon.id === addon.id);
    const quantityBefore = existing ? Math.max(0, existing.quantity) : 0;

    const res = await this.prisma.tenantAddon.deleteMany({
      where: { tenantId, addonId: addon.id },
    });
    if (!res.count) throw new NotFoundException('Bu loyihada bunday paket yo\'q');

    const after = await this.effective(tenantId);
    const used = await this.usedFromSnapshots(tenantId);
    const unitPrice = addon.price === null ? null : Number(addon.price);

    await this.recordChange({
      tenantId,
      action: 'ADDON_REVOKE',
      addonKey,
      quantityBefore,
      quantityAfter: 0,
      limitBefore: before.limit,
      limitAfter: after.limit,
      usedAtChange: used,
      unitPrice,
      currency: addon.currency,
      // ⚠ MANFIY: bu qaytarilgan (yoki bekor qilingan) summa. Kelajakda
      // billing shu belgiga qarab qaytarim yozuvini yasay oladi.
      amount: unitPrice === null ? null : -unitPrice * quantityBefore,
      actor: revokedBy,
      reason,
    });

    this.logger.log(
      `Filial paketi olib tashlandi (tenant=${tenantId}, addon=${addonKey}, ` +
        `${quantityBefore} → 0, chegara ${before.limit} → ${after.limit}, ` +
        `by=${revokedBy ?? '-'})`,
    );

    return this.describe(tenantId);
  }

  // ──────────────────────────────────────────────────────────────── audit

  /**
   * ═════════════════════════════════════════════════════════════════════
   * TIJORAT O'ZGARISHINI YOZADI.
   *
   * ⚠ HECH QACHON XATO TASHLAMAYDI.
   *
   * Audit — YON YOZUV, asosiy amal emas. Chegara allaqachon ko'tarilgan
   * bo'lsa va shundan keyin audit yozuvi yiqilsa, butun so'rovni xato
   * qilib qaytarish MIJOZNI ikki marta jazolardi: u "xato" ko'radi, lekin
   * chegara aslida o'zgargan bo'ladi va u qayta bosib yana ko'targan
   * bo'lardi. Shuning uchun xato faqat logga tushadi.
   *
   * ⚠ SHU SABABDAN AUDIT AMAL BILAN BITTA TRANZAKSIYADA EMAS. Bu ONGLI
   * kelishuv: yozuvning yo'qolishi (juda kam) chegaraning noto'g'ri
   * holatda qolishidan (og'irroq) afzal.
   * ═════════════════════════════════════════════════════════════════════
   */
  private async recordChange(entry: {
    tenantId: string;
    action: 'LIMIT_OVERRIDE' | 'BRANCH_MODE' | 'ADDON_GRANT' | 'ADDON_REVOKE';
    addonKey?: string | null;
    quantityBefore?: number | null;
    quantityAfter?: number | null;
    overrideBefore?: number | null;
    overrideAfter?: number | null;
    enabledBefore?: boolean | null;
    enabledAfter?: boolean | null;
    limitBefore: number;
    limitAfter: number;
    usedAtChange?: number | null;
    unitPrice?: number | null;
    currency?: string | null;
    amount?: number | null;
    actor?: string | null;
    reason?: string | null;
  }) {
    try {
      await this.prisma.tenantCommercialChange.create({
        data: {
          tenantId: entry.tenantId,
          featureKey: BRANCH_LIMIT_FEATURE_KEY,
          action: entry.action,
          addonKey: entry.addonKey ?? null,
          quantityBefore: entry.quantityBefore ?? null,
          quantityAfter: entry.quantityAfter ?? null,
          overrideBefore: entry.overrideBefore ?? null,
          overrideAfter: entry.overrideAfter ?? null,
          enabledBefore: entry.enabledBefore ?? null,
          enabledAfter: entry.enabledAfter ?? null,
          limitBefore: entry.limitBefore,
          limitAfter: entry.limitAfter,
          usedAtChange: entry.usedAtChange ?? null,
          unitPrice: entry.unitPrice ?? null,
          currency: entry.currency ?? null,
          amount: entry.amount ?? null,
          source: 'DEVELOPER_ADMIN',
          actor: entry.actor ?? null,
          reason: entry.reason?.trim() || null,
        },
      });
    } catch (err) {
      this.logger.error(
        `Audit yozuvi saqlanmadi (tenant=${entry.tenantId}, ${entry.action}): ` +
          `${(err as Error)?.message}`,
      );
    }
  }

  /**
   * O'zgarishlar tarixi — "kim, qachon, nechtaga, nega".
   *
   * ⚠ `Decimal` → `number` shu yerda aylantiriladi: JSON'da Decimal
   * MATN bo'lib chiqadi va panelda `"50000.00"` ni qo'shib bo'lmaydi.
   */
  async history(tenantId: string, limit = 20) {
    const rows = await this.prisma.tenantCommercialChange.findMany({
      where: { tenantId, featureKey: BRANCH_LIMIT_FEATURE_KEY },
      orderBy: { createdAt: 'desc' },
      take: Math.min(Math.max(limit, 1), 100),
    });

    return rows.map((r) => ({
      ...r,
      unitPrice: r.unitPrice === null ? null : Number(r.unitPrice),
      amount: r.amount === null ? null : Number(r.amount),
    }));
  }
}
