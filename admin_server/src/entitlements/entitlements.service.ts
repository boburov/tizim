import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/** Cheksiz limitni bildiruvchi qiymat (PlanFeature.value = -1). */
export const UNLIMITED = -1;

export interface ResolvedLimit {
  key: string;
  name: string;
  type: 'LIMIT' | 'BOOLEAN';
  unit: string | null;
  metricKey: string | null;
  /** Tarif + add-on'lardan hisoblangan yakuniy qiymat. -1 = cheksiz. */
  value: number;
  /** Hozirgi foydalanish (metricKey bo'lsa, oxirgi snapshot). */
  usage: number | null;
  /** usage/value foizi (0-100+). Cheksiz yoki BOOLEAN bo'lsa null. */
  percent: number | null;
  /** usage >= value (LIMIT uchun). */
  exceeded: boolean;
}

/**
 * Tenant uchun yakuniy imkoniyatlarni (entitlements) hisoblaydi:
 *   tarif limiti + faol add-on'lar qo'shimchasi
 *
 * Bu yagona manba — ham admin UI, ham tenant serverning limit tekshiruvi
 * shu yerdan oladi. Shuning uchun limit mantiqi bitta joyda turadi.
 */
@Injectable()
export class EntitlementsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Tenantning oxirgi usage qiymatlarini metrika bo'yicha qaytaradi. */
  async latestUsage(tenantId: string): Promise<Record<string, number>> {
    // Har metrika uchun eng oxirgi yozuv. Postgres DISTINCT ON eng tez yo'l.
    const rows = await this.prisma.$queryRaw<
      Array<{ metricKey: string; value: number }>
    >`
      SELECT DISTINCT ON ("metricKey") "metricKey", "value"
      FROM "UsageSnapshot"
      WHERE "tenantId" = ${tenantId}
      ORDER BY "metricKey", "recordedAt" DESC
    `;
    const out: Record<string, number> = {};
    for (const r of rows) out[r.metricKey] = Number(r.value);
    return out;
  }

  /**
   * Tenantning to'liq entitlement holati: tarif, limitlar, usage, oshganlari.
   */
  async forTenant(tenantId: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: {
        subscription: {
          include: {
            plan: { include: { features: { include: { feature: true } } } },
          },
        },
        addons: { include: { addon: { include: { feature: true } } } },
      },
    });
    if (!tenant) throw new NotFoundException('Tenant topilmadi');

    const usage = await this.latestUsage(tenantId);
    const sub = tenant.subscription;

    // Obuna faol emasmi? (muddat o'tgan yoki bekor qilingan)
    const subActive =
      !!sub &&
      (sub.status === 'ACTIVE' || sub.status === 'TRIALING') &&
      (!sub.currentPeriodEnd || sub.currentPeriodEnd > new Date());

    const limits = new Map<string, ResolvedLimit>();

    // 1) Tarif limitlari
    for (const pf of sub?.plan.features ?? []) {
      const f = pf.feature;
      limits.set(f.key, {
        key: f.key,
        name: f.name,
        type: f.type,
        unit: f.unit,
        metricKey: f.metricKey,
        value: pf.value,
        usage: null,
        percent: null,
        exceeded: false,
      });
    }

    // 2) Faol add-on'lar tarif limitiga QO'SHILADI
    const now = new Date();
    for (const ta of tenant.addons) {
      if (!ta.isActive) continue;
      if (ta.expiresAt && ta.expiresAt < now) continue;
      const f = ta.addon.feature;
      if (!f) continue;

      const existing = limits.get(f.key);
      if (existing) {
        // Cheksizga qo'shib bo'lmaydi — cheksiz cheksizligicha qoladi
        if (existing.value !== UNLIMITED) {
          existing.value =
            f.type === 'BOOLEAN'
              ? Math.max(existing.value, ta.addon.value)
              : existing.value + ta.addon.value;
        }
      } else {
        limits.set(f.key, {
          key: f.key,
          name: f.name,
          type: f.type,
          unit: f.unit,
          metricKey: f.metricKey,
          value: ta.addon.value,
          usage: null,
          percent: null,
          exceeded: false,
        });
      }
    }

    // 3) Usage'ni bog'lash va oshganini hisoblash
    for (const lim of limits.values()) {
      if (lim.metricKey && usage[lim.metricKey] !== undefined) {
        lim.usage = usage[lim.metricKey];
      }
      if (
        lim.type === 'LIMIT' &&
        lim.value !== UNLIMITED &&
        lim.usage !== null
      ) {
        lim.percent =
          lim.value > 0 ? Math.round((lim.usage / lim.value) * 100) : 100;
        lim.exceeded = lim.usage >= lim.value;
      }
    }

    return {
      tenantId,
      subscription: sub
        ? {
            status: sub.status,
            planKey: sub.plan.key,
            planName: sub.plan.name,
            currentPeriodEnd: sub.currentPeriodEnd,
            isActive: subActive,
          }
        : null,
      limits: Array.from(limits.values()),
      usage,
    };
  }

  /**
   * Tenant server uchun ixcham ko'rinish — heartbeat javobida qaytadi.
   * { "max_users": 1000, "telegram_bot": 1 }
   */
  async compactForTenant(tenantId: string) {
    const full = await this.forTenant(tenantId);
    const map: Record<string, number> = {};
    for (const l of full.limits) map[l.key] = l.value;
    return {
      planKey: full.subscription?.planKey ?? null,
      subscriptionActive: full.subscription?.isActive ?? false,
      limits: map,
      exceeded: full.limits.filter((l) => l.exceeded).map((l) => l.key),
    };
  }
}
