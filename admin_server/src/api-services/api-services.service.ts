import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ChangeStatusDto,
  ChangeTierDto,
  CreateApiConsumerDto,
  CreateApiKeyDto,
  CreateApiServiceDto,
  CreateApiSubscriptionDto,
  CreateApiTierDto,
  ExtendSubscriptionDto,
  UpdateApiConsumerDto,
  UpdateApiServiceDto,
  UpdateApiTierDto,
} from './dto/api-service.dto.js';
import { generateApiKey, maskApiKey } from './api-key.util.js';

/** UI grafigi va "so'nggi faollik" ustuni uchun standart oyna. */
const DEFAULT_USAGE_DAYS = 30;

/**
 * API xizmatlarining control plane mantiqi: xizmat/tarif/mijoz/obuna/kalit.
 *
 * Limitni MAJBURLASH bu yerda emas — u xizmatning o'zida (data plane) bo'ladi.
 * Bu yerda faqat "kim, qaysi tarifda, qachongacha" saqlanadi.
 */
@Injectable()
export class ApiServicesService {
  constructor(private readonly prisma: PrismaService) {}

  // ===================== XIZMATLAR =====================

  /** Ro'yxat sahifasi: har xizmat + tariflari + faol obunalar + 30 kunlik hisob. */
  async listServices() {
    const services = await this.prisma.apiService.findMany({
      include: {
        tiers: { orderBy: [{ sortOrder: 'asc' }, { price: 'asc' }] },
        subscriptions: {
          select: {
            id: true,
            status: true,
            expiresAt: true,
            lastRequestAt: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    const since = daysAgo(DEFAULT_USAGE_DAYS);
    const totals = await this.prisma.apiUsageDaily.groupBy({
      by: ['subscriptionId'],
      where: { day: { gte: since } },
      _sum: { ok: true, rejected: true, failed: true },
    });
    const bySub = new Map(totals.map((t) => [t.subscriptionId, t._sum]));

    // Bugungi hisob alohida: "raqamlar hozir o'syaptimi?" degan savolga
    // 30 kunlik yig'indi javob bera olmaydi.
    const todayRows = await this.prisma.apiUsageDaily.groupBy({
      by: ['subscriptionId'],
      where: { day: { gte: daysAgo(0) } },
      _sum: { ok: true, rejected: true, failed: true },
    });
    const todayBySub = new Map(todayRows.map((t) => [t.subscriptionId, t._sum]));

    return services.map((s) => {
      let ok = 0;
      let rejected = 0;
      let todayOk = 0;
      let active = 0;
      let lastRequestAt: Date | null = null;

      for (const sub of s.subscriptions) {
        const sum = bySub.get(sub.id);
        ok += sum?.ok ?? 0;
        rejected += sum?.rejected ?? 0;
        todayOk += todayBySub.get(sub.id)?.ok ?? 0;
        if (effectiveStatus(sub) === 'ACTIVE') active += 1;
        if (
          sub.lastRequestAt &&
          (!lastRequestAt || sub.lastRequestAt > lastRequestAt)
        ) {
          lastRequestAt = sub.lastRequestAt;
        }
      }

      const { subscriptions, ...rest } = s;
      return {
        ...rest,
        subscriptionCount: subscriptions.length,
        activeSubscriptions: active,
        usage30d: { ok, rejected },
        usageToday: { ok: todayOk },
        lastRequestAt,
      };
    });
  }

  /** Bitta xizmatning to'liq holati — detail sahifasi shundan chiziladi. */
  async getService(id: string) {
    const service = await this.prisma.apiService.findUnique({
      where: { id },
      include: {
        tiers: { orderBy: [{ sortOrder: 'asc' }, { price: 'asc' }] },
        subscriptions: {
          include: {
            consumer: true,
            tier: true,
            keys: { orderBy: { createdAt: 'desc' } },
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
    if (!service) throw new NotFoundException('Xizmat topilmadi');

    const since = daysAgo(DEFAULT_USAGE_DAYS);
    const totals = await this.prisma.apiUsageDaily.groupBy({
      by: ['subscriptionId'],
      where: {
        day: { gte: since },
        subscriptionId: { in: service.subscriptions.map((s) => s.id) },
      },
      _sum: { ok: true, rejected: true, failed: true, totalMs: true },
    });
    const bySub = new Map(totals.map((t) => [t.subscriptionId, t._sum]));

    const todayRows = await this.prisma.apiUsageDaily.groupBy({
      by: ['subscriptionId'],
      where: {
        day: { gte: daysAgo(0) },
        subscriptionId: { in: service.subscriptions.map((s) => s.id) },
      },
      _sum: { ok: true, rejected: true, failed: true },
    });
    const todayBySub = new Map(todayRows.map((t) => [t.subscriptionId, t._sum]));

    return {
      ...service,
      subscriptions: service.subscriptions.map((sub) => {
        const sum = bySub.get(sub.id);
        const today = todayBySub.get(sub.id);
        const ok = sum?.ok ?? 0;
        return {
          ...sub,
          // Kalitning o'zi hech qachon qaytmaydi — faqat niqoblangan ko'rinishi.
          keys: sub.keys.map((k) => ({
            id: k.id,
            prefix: k.prefix,
            masked: maskApiKey(k.prefix),
            label: k.label,
            lastUsedAt: k.lastUsedAt,
            revokedAt: k.revokedAt,
            createdAt: k.createdAt,
          })),
          effectiveStatus: effectiveStatus(sub),
          usage30d: {
            ok,
            rejected: sum?.rejected ?? 0,
            failed: sum?.failed ?? 0,
            avgMs: ok > 0 ? Math.round((sum?.totalMs ?? 0) / ok) : null,
          },
          usageToday: {
            ok: today?.ok ?? 0,
            rejected: today?.rejected ?? 0,
            failed: today?.failed ?? 0,
          },
        };
      }),
    };
  }

  async createService(dto: CreateApiServiceDto) {
    const exists = await this.prisma.apiService.findUnique({
      where: { key: dto.key },
    });
    if (exists) throw new ConflictException('Bu key band');
    return this.prisma.apiService.create({ data: dto });
  }

  async updateService(id: string, dto: UpdateApiServiceDto) {
    await this.mustFindService(id);
    return this.prisma.apiService.update({ where: { id }, data: dto });
  }

  // ===================== TARIFLAR =====================

  async createTier(serviceId: string, dto: CreateApiTierDto) {
    await this.mustFindService(serviceId);
    const exists = await this.prisma.apiTier.findUnique({
      where: { serviceId_key: { serviceId, key: dto.key } },
    });
    if (exists) throw new ConflictException('Bu xizmatda bunday key bor');
    return this.prisma.apiTier.create({ data: { ...dto, serviceId } });
  }

  async updateTier(tierId: string, dto: UpdateApiTierDto) {
    await this.mustFindTier(tierId);
    return this.prisma.apiTier.update({ where: { id: tierId }, data: dto });
  }

  /**
   * Tarifni o'chirish. Unga bog'langan obuna bo'lsa rad etiladi — aks holda
   * ishlayotgan mijoz limitsiz qolardi.
   */
  async removeTier(tierId: string) {
    await this.mustFindTier(tierId);
    const used = await this.prisma.apiSubscription.count({ where: { tierId } });
    if (used > 0) {
      throw new ConflictException(
        `Bu tarifda ${used} ta obuna bor — avval ularni boshqa tarifga o'tkazing`,
      );
    }
    await this.prisma.apiTier.delete({ where: { id: tierId } });
    return { ok: true };
  }

  // ===================== MIJOZLAR =====================

  listConsumers() {
    return this.prisma.apiConsumer.findMany({
      include: {
        customer: { select: { id: true, email: true, fullName: true } },
        tenant: { select: { id: true, name: true, domain: true } },
        subscriptions: {
          select: { id: true, serviceId: true, status: true, expiresAt: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  createConsumer(dto: CreateApiConsumerDto) {
    return this.prisma.apiConsumer.create({ data: dto });
  }

  async updateConsumer(id: string, dto: UpdateApiConsumerDto) {
    const found = await this.prisma.apiConsumer.findUnique({ where: { id } });
    if (!found) throw new NotFoundException('Mijoz topilmadi');
    return this.prisma.apiConsumer.update({ where: { id }, data: dto });
  }

  // ===================== OBUNALAR =====================

  /**
   * Yangi obuna + birinchi kalit. Kalit ochiq matni FAQAT shu javobda
   * qaytadi — keyin uni hech kim, jumladan admin ham, ko'ra olmaydi.
   */
  async createSubscription(
    serviceId: string,
    dto: CreateApiSubscriptionDto,
    adminEmail?: string,
  ) {
    await this.mustFindService(serviceId);
    const tier = await this.mustFindTier(dto.tierId);
    if (tier.serviceId !== serviceId) {
      throw new ConflictException('Tarif boshqa xizmatga tegishli');
    }

    const consumer = await this.prisma.apiConsumer.findUnique({
      where: { id: dto.consumerId },
    });
    if (!consumer) throw new NotFoundException('Mijoz topilmadi');

    const duplicate = await this.prisma.apiSubscription.findUnique({
      where: {
        consumerId_serviceId: { consumerId: dto.consumerId, serviceId },
      },
    });
    if (duplicate) {
      throw new ConflictException(
        "Bu mijozda shu xizmatga obuna allaqachon bor — tarifini o'zgartiring",
      );
    }

    const months = dto.months ?? 1;
    const key = generateApiKey();

    const subscription = await this.prisma.apiSubscription.create({
      data: {
        consumerId: dto.consumerId,
        serviceId,
        tierId: dto.tierId,
        status: 'ACTIVE',
        expiresAt: months > 0 ? addMonths(new Date(), months) : null,
        keys: {
          create: {
            prefix: key.prefix,
            hash: key.hash,
            label: 'Birinchi kalit',
            createdBy: adminEmail,
          },
        },
      },
      include: { consumer: true, tier: true },
    });

    return { subscription, apiKey: key.plaintext };
  }

  /**
   * TARIFNI ALMASHTIRISH. Data plane kalit keshini 60 soniyada yangilaydi,
   * shuning uchun o'zgarish darhol emas — javobda shuni aytamiz.
   */
  async changeTier(subscriptionId: string, dto: ChangeTierDto) {
    const sub = await this.mustFindSubscription(subscriptionId);
    const tier = await this.mustFindTier(dto.tierId);
    if (tier.serviceId !== sub.serviceId) {
      throw new ConflictException('Tarif boshqa xizmatga tegishli');
    }
    const updated = await this.prisma.apiSubscription.update({
      where: { id: subscriptionId },
      data: { tierId: dto.tierId },
      include: { tier: true, consumer: true },
    });
    return { ...updated, appliesInSeconds: 60 };
  }

  /**
   * Muddatni uzaytirish. Muddati o'tgan obuna BUGUNDAN boshlab uzayadi
   * (o'tmishdagi sanaga qo'shsak, mijoz to'lagan oyni yo'qotardi), va
   * EXPIRED holati avtomatik ACTIVE ga qaytadi.
   */
  async extend(subscriptionId: string, dto: ExtendSubscriptionDto) {
    const sub = await this.mustFindSubscription(subscriptionId);
    const now = new Date();
    const base =
      sub.expiresAt && sub.expiresAt > now ? sub.expiresAt : now;

    return this.prisma.apiSubscription.update({
      where: { id: subscriptionId },
      data: {
        expiresAt: addMonths(base, dto.months),
        status: sub.status === 'ACTIVE' ? sub.status : 'ACTIVE',
        canceledAt: null,
      },
      include: { tier: true, consumer: true },
    });
  }

  async changeStatus(subscriptionId: string, dto: ChangeStatusDto) {
    const sub = await this.mustFindSubscription(subscriptionId);

    // Muddati o'tgan obunani "faollashtirish" mantiqsiz — avval uzaytirish kerak.
    if (
      dto.status === 'ACTIVE' &&
      sub.expiresAt &&
      sub.expiresAt <= new Date()
    ) {
      throw new ConflictException(
        "Obuna muddati o'tgan — avval uzaytiring, keyin faollashtiring",
      );
    }

    return this.prisma.apiSubscription.update({
      where: { id: subscriptionId },
      data: {
        status: dto.status,
        canceledAt: dto.status === 'CANCELED' ? new Date() : null,
      },
      include: { tier: true, consumer: true },
    });
  }

  // ===================== KALITLAR =====================

  async createKey(
    subscriptionId: string,
    dto: CreateApiKeyDto,
    adminEmail?: string,
  ) {
    await this.mustFindSubscription(subscriptionId);
    const key = generateApiKey();

    const created = await this.prisma.apiKey.create({
      data: {
        subscriptionId,
        prefix: key.prefix,
        hash: key.hash,
        label: dto.label,
        createdBy: adminEmail,
      },
    });

    return {
      id: created.id,
      prefix: created.prefix,
      label: created.label,
      createdAt: created.createdAt,
      /** Bir marta ko'rsatiladi. */
      apiKey: key.plaintext,
    };
  }

  /**
   * Kalitni bekor qilish. Yozuv o'chirilmaydi — `revokedAt` qo'yiladi,
   * shunda "qachon va kim bekor qildi" tarixi qoladi.
   */
  async revokeKey(keyId: string) {
    const key = await this.prisma.apiKey.findUnique({ where: { id: keyId } });
    if (!key) throw new NotFoundException('Kalit topilmadi');
    if (key.revokedAt) return { ok: true, alreadyRevoked: true };

    await this.prisma.apiKey.update({
      where: { id: keyId },
      data: { revokedAt: new Date() },
    });
    return { ok: true, appliesInSeconds: 60 };
  }

  // ===================== HISOB =====================

  /** Kunlik qatorlar — grafik uchun. Bo'sh kunlar ham to'ldiriladi. */
  async usageHistory(subscriptionId: string, days = DEFAULT_USAGE_DAYS) {
    await this.mustFindSubscription(subscriptionId);
    const since = daysAgo(days);

    const rows = await this.prisma.apiUsageDaily.groupBy({
      by: ['day'],
      where: { subscriptionId, day: { gte: since } },
      _sum: { ok: true, rejected: true, failed: true, totalMs: true },
      orderBy: { day: 'asc' },
    });

    const byDay = new Map(
      rows.map((r) => [toDayKey(r.day), r._sum] as const),
    );

    const out: Array<{
      day: string;
      ok: number;
      rejected: number;
      failed: number;
      avgMs: number | null;
    }> = [];
    for (let i = days - 1; i >= 0; i -= 1) {
      const d = daysAgo(i);
      const key = toDayKey(d);
      const sum = byDay.get(key);
      const ok = sum?.ok ?? 0;
      out.push({
        day: key,
        ok,
        rejected: sum?.rejected ?? 0,
        failed: sum?.failed ?? 0,
        avgMs: ok > 0 ? Math.round((sum?.totalMs ?? 0) / ok) : null,
      });
    }
    return out;
  }

  // ===================== YORDAMCHILAR =====================

  private async mustFindService(id: string) {
    const s = await this.prisma.apiService.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Xizmat topilmadi');
    return s;
  }

  private async mustFindTier(id: string) {
    const t = await this.prisma.apiTier.findUnique({ where: { id } });
    if (!t) throw new NotFoundException('Tarif topilmadi');
    return t;
  }

  private async mustFindSubscription(id: string) {
    const s = await this.prisma.apiSubscription.findUnique({ where: { id } });
    if (!s) throw new NotFoundException('Obuna topilmadi');
    return s;
  }
}

/**
 * Bazadagi status + muddat -> haqiqiy holat.
 *
 * Muddat o'tganini alohida cron yozib yurmaydi: hisoblab olish arzonroq va
 * "cron ishlamay qoldi" degan xato holati umuman paydo bo'lmaydi. Bazadagi
 * `EXPIRED` esa data plane so'raganda yoziladi (authorize).
 */
export function effectiveStatus(sub: {
  status: string;
  expiresAt: Date | null;
}): string {
  if (sub.status !== 'ACTIVE') return sub.status;
  if (sub.expiresAt && sub.expiresAt <= new Date()) return 'EXPIRED';
  return 'ACTIVE';
}

/** Sanaga oy qo'shadi. Oy oxiri masalasi: 31-yanvar + 1 oy = 28/29-fevral. */
export function addMonths(from: Date, months: number): Date {
  const d = new Date(from);
  const day = d.getDate();
  d.setMonth(d.getMonth() + months);
  // Oy qisqa bo'lsa JS keyingi oyga o'tkazib yuboradi — orqaga qaytaramiz.
  if (d.getDate() < day) d.setDate(0);
  return d;
}

/** N kun oldingi kun boshi (UTC) — `day` ustuni DATE turida. */
function daysAgo(n: number): Date {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - n);
  return d;
}

function toDayKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}
