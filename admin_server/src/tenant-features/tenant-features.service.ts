import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { EntitlementsService } from '../entitlements/entitlements.service.js';
import { TenantRefreshService } from './tenant-refresh.service.js';

/** Qiymat qayerdan kelgani — panelda ko'rsatiladi. */
export type FeatureSource = 'override' | 'plan' | 'default';

export interface TenantFeatureRow {
  key: string;
  name: string;
  isModule: boolean;
  /**
   * TIZIM O'ZAGI — XAVFLI, lekin o'chiriladi.
   *
   * ⚠ MA'NOSI O'ZGARDI: ilgari "o'chirgich ko'rsatilmaydi" edi. Endi
   * panel bu qatorni qizil ogohlantirish va qo'shimcha tasdiq bilan
   * ko'rsatadi — o'chirish MUMKIN.
   */
  isCore: boolean;
  /**
   * QULFLANGAN — o'chirgich yo'q, `setOverride()` 409 beradi.
   * Atigi ikki kalit: `auth` va `features`.
   */
  isLocked: boolean;
  /**
   * Hozir shu kalitni o'chirishga TO'SQINLIK qilayotgan ochiq bo'limlar.
   *
   * ⚠ OLDINDAN hisoblanadi, bosilgandan keyin emas. Aks holda odam
   * o'chirgichni bosib, 409 olib, nima uchunligini faqat xato
   * matnidan bilardi.
   */
  blockedBy: string[];
  /**
   * To'siq QULFLANGAN modul tufaylimi — ya'ni uni bartaraf etib
   * bo'lmaydi. Panel bunday o'chirgichni qulflangan holda ko'rsatadi
   * va sababini yozadi, chunki bosilsa har doim 409 qaytarardi.
   *
   * ⚠ Shart `isLocked`, ilgarigidek `isCore` EMAS: core to'siqni endi
   * bartaraf etish MUMKIN (avval o'sha core modulni o'chirasiz).
   * Amalda bu `auth` ga tayanadigan bir necha modulni qamraydi —
   * `attendance`, `finance`, `groups`, `opening-balance`,
   * `student-freeze` (login javobi ularning ma'lumotini yig'adi).
   */
  permanentlyBlocked: boolean;
  parentKey: string | null;
  requiresKeys: string[];
  /** Mijoz AMALDA ko'radigan holat (ota zanjiri hisobga olingan). */
  enabled: boolean;
  source: FeatureSource;
  /** Ustun qaror bo'lsa — sababi, kim va qachon qo'ygani. */
  override: {
    enabled: boolean;
    reason: string;
    createdBy: string;
    createdAt: Date;
  } | null;
  /** Tarif shu kalitni beradimi (ustun qarorsiz holat). */
  planGrants: boolean;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * LOYIHA MODULLARINI BOSHQARISH.
 *
 * ⚠ YECHISHNI O'ZI QAYTA HISOBLAMAYDI. Holat `EntitlementsService.forTenant`
 * dan olinadi — tenant serverga ketadigan javob AYNAN o'sha yerdan
 * chiqadi. Ikkinchi hisoblovchi yozilsa panel bir narsani ko'rsatib,
 * mijoz boshqasini ko'rgan bo'lardi va bu farqni hech narsa ushlamasdi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class TenantFeaturesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly refresh: TenantRefreshService,
  ) {}

  private async tenantOrFail(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
    });
    if (!tenant) throw new NotFoundException('Loyiha topilmadi');
    return tenant;
  }

  /** Loyihaning modul holati — panel jadvali shu javobdan chiziladi. */
  async stateFor(tenantId: string): Promise<TenantFeatureRow[]> {
    await this.tenantOrFail(tenantId);

    const [features, overrides, resolved] = await Promise.all([
      this.prisma.feature.findMany({
        where: { isModule: true, isActive: true },
        orderBy: { key: 'asc' },
      }),
      this.prisma.tenantFeatureOverride.findMany({ where: { tenantId } }),
      this.entitlements.forTenant(tenantId),
    ]);

    const resolvedByKey = new Map(resolved.limits.map((l) => [l.key, l]));
    const overrideByKey = new Map(overrides.map((o) => [o.featureKey, o]));

    // Tarifning O'ZI (ustun qarorsiz) nima berishini bilish uchun faol
    // obunaning tarif kalitlari alohida o'qiladi: panelda "tarifda bor,
    // lekin qo'lda o'chirilgan" holatini ko'rsatish uchun kerak.
    const sub = await this.prisma.subscription.findUnique({
      where: { tenantId },
      include: { plan: { include: { features: { include: { feature: true } } } } },
    });
    const planKeys = new Set(
      (sub?.plan.features ?? [])
        .filter((pf) => pf.value > 0)
        .map((pf) => pf.feature.key),
    );

    const isOn = (key: string) => (resolvedByKey.get(key)?.value ?? 0) > 0;

    // Kim kimga tayanadi — to'siqni OLDINDAN hisoblash uchun.
    const dependentsOf = (key: string) =>
      features
        .filter(
          (d) =>
            d.key !== key &&
            (d.requiresKeys.includes(key) || d.parentKey === key) &&
            isOn(d.key),
        );

    return features.map((f) => {
      const ov = overrideByKey.get(f.key);
      const blockers = dependentsOf(f.key);
      return {
        key: f.key,
        name: f.name,
        isModule: f.isModule,
        isCore: f.isCore,
        isLocked: f.isLocked,
        blockedBy: blockers.map((b) => b.key),
        // ⚠ QULFLANGAN to'siqni bartaraf etib bo'lmaydi: uni o'chirish
        // imkoni yo'q, ya'ni bu o'chirgich hech qachon ishlamaydi.
        permanentlyBlocked: blockers.some((b) => b.isLocked),
        parentKey: f.parentKey,
        requiresKeys: f.requiresKeys,
        enabled: isOn(f.key),
        source: ov ? 'override' : planKeys.has(f.key) ? 'plan' : 'default',
        override: ov
          ? {
              enabled: ov.enabled,
              reason: ov.reason,
              createdBy: ov.createdBy,
              createdAt: ov.createdAt,
            }
          : null,
        planGrants: planKeys.has(f.key),
      };
    });
  }

  /**
   * O'chirish TO'SILADIMI — shu kalitga tayanadigan, hozir OCHIQ bo'lgan
   * bo'limlar ro'yxati.
   *
   * ⚠ TO'SIQ KONFIGURATSIYA PAYTIDA CHIQADI, ish vaqtida emas. Sabab:
   * bog'liq bo'limlarning ba'zilari yo'q ma'lumotni XATO deb emas,
   * "bo'sh" deb o'qiydi (masalan xodim KPI bonusi davomat yozuvi
   * yo'qligini "belgilanmagan" deb hisoblaydi). Ya'ni noto'g'ri o'chirish
   * ekranga xato chiqarmaydi — u JIMGINA noto'g'ri pul hisoblaydi.
   * Shuning uchun to'siq odam o'qiy oladigan yagona joyda turadi.
   */
  private async blockers(tenantId: string, key: string): Promise<string[]> {
    const dependents = await this.prisma.feature.findMany({
      where: { isModule: true, isActive: true, requiresKeys: { has: key } },
    });
    // Bolalar ham to'siq: otasi o'chsa ular baribir o'chadi, lekin buni
    // odam OLDINDAN bilishi kerak.
    const children = await this.prisma.feature.findMany({
      where: { isModule: true, isActive: true, parentKey: key },
    });

    const state = await this.stateFor(tenantId);
    const enabled = new Set(state.filter((r) => r.enabled).map((r) => r.key));

    return [...dependents, ...children]
      .map((f) => f.key)
      .filter((k) => k !== key && enabled.has(k));
  }

  /** Ustun qaror qo'yish. Faqat SUPER_ADMIN, sabab MAJBURIY. */
  async setOverride(
    tenantId: string,
    key: string,
    enabled: boolean,
    reason: string,
    actorEmail: string,
  ) {
    const tenant = await this.tenantOrFail(tenantId);

    const feature = await this.prisma.feature.findUnique({ where: { key } });
    if (!feature || !feature.isModule) {
      throw new NotFoundException(`Modul kaliti topilmadi: ${key}`);
    }
    // ⚠ QULFLANGAN MODUL HECH QACHON O'CHIRILMAYDI. Panel uni
    // ko'rsatmaydi, lekin API to'g'ridan-to'g'ri chaqirilishi mumkin.
    //
    // ⚠ Shart `isLocked`, ilgarigidek `isCore` EMAS: `core` modullar
    // endi sotiladi va o'chiriladi (panel qo'shimcha tasdiq so'raydi).
    // Qulflangani atigi ikkitasi va ikkalasining sababi ham TEXNIK:
    // `auth` o'chsa kirish yo'li yo'qoladi, `features` o'chsa tenantni
    // tashqaridan tuzatib bo'lmaydi.
    if (feature.isLocked) {
      throw new ConflictException(
        `"${key}" — tizimning qulflangan o'zagi, uni o'chirib bo'lmaydi`,
      );
    }

    const trimmed = reason.trim();
    if (!trimmed) throw new BadRequestException('Sabab yozilishi shart');

    if (!enabled) {
      const blocking = await this.blockers(tenantId, key);
      if (blocking.length) {
        throw new ConflictException(
          `"${key}" ni o'chirib bo'lmaydi — unga tayanadigan bo'limlar ochiq: ` +
            `${blocking.join(', ')}. Avval o'shalarni o'chiring.`,
        );
      }
    }

    const before = await this.stateFor(tenantId);
    const beforeRow = before.find((r) => r.key === key);

    await this.prisma.tenantFeatureOverride.upsert({
      where: {
        tenantId_featureKey_branchId: { tenantId, featureKey: key, branchId: '' },
      },
      create: {
        tenantId,
        featureId: feature.id,
        featureKey: key,
        enabled,
        reason: trimmed,
        createdBy: actorEmail,
      },
      update: { enabled, reason: trimmed, createdBy: actorEmail },
    });

    await this.audit(tenantId, key, beforeRow?.enabled ?? false, enabled, trimmed, actorEmail);
    const pushed = await this.refresh.poke(tenant);

    return { key, enabled, pushed };
  }

  /** Ustun qarorni olib tashlash — kalit yana tarifga bo'ysunadi. */
  async clearOverride(tenantId: string, key: string, actorEmail: string) {
    const tenant = await this.tenantOrFail(tenantId);

    const existing = await this.prisma.tenantFeatureOverride.findUnique({
      where: {
        tenantId_featureKey_branchId: { tenantId, featureKey: key, branchId: '' },
      },
    });
    if (!existing) throw new NotFoundException('Bu kalitda ustun qaror yo\'q');

    const before = await this.stateFor(tenantId);
    const beforeRow = before.find((r) => r.key === key);

    // Olib tashlash bo'limni O'CHIRIB yuborishi mumkin (tarif uni
    // bermasa) — shuning uchun bu ham o'chirish kabi tekshiriladi.
    if (beforeRow?.enabled && !beforeRow.planGrants) {
      const blocking = await this.blockers(tenantId, key);
      if (blocking.length) {
        throw new ConflictException(
          `Ustun qarorni olib tashlash "${key}" ni o'chiradi, unga tayanadigan ` +
            `bo'limlar esa ochiq: ${blocking.join(', ')}.`,
        );
      }
    }

    await this.prisma.tenantFeatureOverride.delete({ where: { id: existing.id } });

    const after = await this.stateFor(tenantId);
    const afterRow = after.find((r) => r.key === key);
    await this.audit(
      tenantId,
      key,
      beforeRow?.enabled ?? false,
      afterRow?.enabled ?? false,
      'Ustun qaror olib tashlandi',
      actorEmail,
    );
    const pushed = await this.refresh.poke(tenant);

    return { key, enabled: afterRow?.enabled ?? false, pushed };
  }

  /**
   * ⚠ MAVJUD AUDIT JADVALIGA YOZADI, yangisiga emas. Tijorat qarorlari
   * bitta tarixda tursin: "nega bu loyihada davomat bepul?" degan savol
   * filial chegarasi tarixi bilan bir joydan o'qilsin.
   */
  private async audit(
    tenantId: string,
    featureKey: string,
    before: boolean,
    after: boolean,
    reason: string,
    actorEmail: string,
  ): Promise<void> {
    await this.prisma.tenantCommercialChange.create({
      data: {
        tenantId,
        featureKey,
        action: 'MODULE_TOGGLE',
        enabledBefore: before,
        enabledAfter: after,
        limitBefore: before ? 1 : 0,
        limitAfter: after ? 1 : 0,
        reason,
        actor: actorEmail,
      },
    });
  }
}
