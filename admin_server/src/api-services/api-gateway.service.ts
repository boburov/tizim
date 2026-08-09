import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { IngestUsageDto } from './dto/api-gateway.dto.js';
import { hashApiKey, parseApiKey, safeCompare } from './api-key.util.js';
import { addMonths } from './api-services.service.js';

/** Rad javobining sababi — data plane shu kod bo'yicha HTTP statusni tanlaydi. */
export type DenyReason =
  | 'invalid_api_key'
  | 'key_revoked'
  | 'service_disabled'
  | 'consumer_disabled'
  | 'subscription_suspended'
  | 'subscription_canceled'
  | 'subscription_expired';

export interface AuthorizeResult {
  allowed: boolean;
  reason?: DenyReason;
  subscriptionId?: string;
  consumerLabel?: string;
  serviceKey?: string;
  tier?: {
    key: string;
    name: string;
    concurrency: number;
    rateLimitRpm: number;
    priority: number;
    monthlyQuota: number;
  };
  /** Joriy hisob davrida sarflangan muvaffaqiyatli so'rovlar. */
  quotaUsed?: number;
  /** Joriy hisob davrining boshlanishi (ISO) — data plane keshni to'g'ri
   *  hisoblashi uchun. */
  periodStart?: string;
  expiresAt?: string | null;
}

/** `lastUsedAt` ni har so'rovda yozish bazani behuda urardi. */
const LAST_USED_THROTTLE_MS = 60_000;

/**
 * Data plane (xizmatning o'zi) bilan gaplashadigan servis.
 *
 * Ikki vazifasi bor:
 *   1. `authorize` — kalitni tekshiradi va tarif raqamlarini qaytaradi.
 *      Xizmat javobni keshlaydi, shuning uchun bu endpoint har so'rovda
 *      emas, har kalit uchun daqiqada bir marta chaqiriladi.
 *   2. `ingestUsage` — xizmat lokalda sanagan so'rovlarni qabul qiladi.
 */
@Injectable()
export class ApiGatewayService {
  private readonly logger = new Logger(ApiGatewayService.name);

  constructor(private readonly prisma: PrismaService) {}

  async authorize(rawKey: string): Promise<AuthorizeResult> {
    // Shakli noto'g'ri bo'lsa bazaga umuman bormaymiz.
    const parsed = parseApiKey(rawKey);
    if (!parsed) return { allowed: false, reason: 'invalid_api_key' };

    const key = await this.prisma.apiKey.findUnique({
      where: { prefix: parsed.prefix },
      include: {
        subscription: {
          include: { tier: true, service: true, consumer: true },
        },
      },
    });
    if (!key) return { allowed: false, reason: 'invalid_api_key' };

    // Prefiks topildi, endi sirni tekshiramiz (timing-safe).
    if (!safeCompare(key.hash, hashApiKey(rawKey.trim()))) {
      return { allowed: false, reason: 'invalid_api_key' };
    }

    if (key.revokedAt) return { allowed: false, reason: 'key_revoked' };

    const sub = key.subscription;
    const deny = this.denyReasonFor(sub);

    // Kalit haqiqiy — hatto rad etilsa ham "oxirgi ishlatilgan" belgilanadi:
    // mijoz murojaat qilganini ko'rish kerak.
    void this.touchKey(key.id, key.lastUsedAt);

    if (deny) {
      // Muddati o'tganini bazaga ham yozib qo'yamiz, shunda admin panel
      // qo'shimcha hisob-kitobsiz haqiqiy holatni ko'rsatadi.
      if (deny === 'subscription_expired' && sub.status === 'ACTIVE') {
        await this.prisma.apiSubscription
          .update({ where: { id: sub.id }, data: { status: 'EXPIRED' } })
          .catch((e) => this.logger.warn(`EXPIRED yozilmadi: ${e}`));
      }
      return { allowed: false, reason: deny };
    }

    const periodStart = currentPeriodStart(sub.startedAt, new Date());
    const quotaUsed = await this.quotaUsed(sub.id, periodStart);

    return {
      allowed: true,
      subscriptionId: sub.id,
      consumerLabel: sub.consumer.label,
      serviceKey: sub.service.key,
      tier: {
        key: sub.tier.key,
        name: sub.tier.name,
        concurrency: sub.tier.concurrency,
        rateLimitRpm: sub.tier.rateLimitRpm,
        priority: sub.tier.priority,
        monthlyQuota: sub.tier.monthlyQuota,
      },
      quotaUsed,
      periodStart: periodStart.toISOString(),
      expiresAt: sub.expiresAt ? sub.expiresAt.toISOString() : null,
    };
  }

  /**
   * Xizmat yuborgan kunlik hisoblarni qo'shadi.
   *
   * `increment` ishlatiladi (o'rniga yozish emas): xizmat har 15 soniyada
   * FARQNI yuboradi, shuning uchun qatorlar qo'shilib boradi. Shu bilan
   * birga bir batch ikki marta kelib qolsa hisob oshib ketadi — buni
   * oldini olish uchun xizmat batchni faqat muvaffaqiyatli javobdan keyin
   * tozalaydi va takror yuborishda yangi farqni yuboradi.
   */
  async ingestUsage(dto: IngestUsageDto) {
    if (dto.items.length === 0) return { accepted: 0, skipped: 0 };

    const ids = [...new Set(dto.items.map((i) => i.subscriptionId))];
    const known = await this.prisma.apiSubscription.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    const knownIds = new Set(known.map((k) => k.id));

    const valid = dto.items.filter((i) => knownIds.has(i.subscriptionId));
    const skipped = dto.items.length - valid.length;
    if (skipped > 0) {
      this.logger.warn(`${skipped} ta usage qatori noma'lum obunaga tegishli`);
    }

    // Har qator alohida upsert — 500 tagacha, bitta tranzaksiyada.
    await this.prisma.$transaction(
      valid.map((i) => {
        const day = new Date(`${i.day}T00:00:00.000Z`);
        const endpoint = i.endpoint || 'assess';
        return this.prisma.apiUsageDaily.upsert({
          where: {
            subscriptionId_day_endpoint: {
              subscriptionId: i.subscriptionId,
              day,
              endpoint,
            },
          },
          create: {
            subscriptionId: i.subscriptionId,
            day,
            endpoint,
            ok: i.ok,
            rejected: i.rejected,
            failed: i.failed,
            totalMs: i.totalMs,
          },
          update: {
            ok: { increment: i.ok },
            rejected: { increment: i.rejected },
            failed: { increment: i.failed },
            totalMs: { increment: i.totalMs },
          },
        });
      }),
    );

    return { accepted: valid.length, skipped };
  }

  // ===================== YORDAMCHILAR =====================

  private denyReasonFor(sub: {
    status: string;
    expiresAt: Date | null;
    service: { isActive: boolean };
    consumer: { isActive: boolean };
  }): DenyReason | null {
    if (!sub.service.isActive) return 'service_disabled';
    if (!sub.consumer.isActive) return 'consumer_disabled';
    if (sub.status === 'SUSPENDED') return 'subscription_suspended';
    if (sub.status === 'CANCELED') return 'subscription_canceled';
    if (sub.status === 'EXPIRED') return 'subscription_expired';
    // Muddat — status ACTIVE bo'lsa ham tekshiriladi (grace period yo'q).
    if (sub.expiresAt && sub.expiresAt <= new Date()) {
      return 'subscription_expired';
    }
    return null;
  }

  private async quotaUsed(subscriptionId: string, since: Date): Promise<number> {
    // `day` DATE turida, shuning uchun davr boshini kun aniqligiga keltiramiz.
    const dayStart = new Date(since);
    dayStart.setUTCHours(0, 0, 0, 0);

    const agg = await this.prisma.apiUsageDaily.aggregate({
      where: { subscriptionId, day: { gte: dayStart } },
      _sum: { ok: true },
    });
    return agg._sum.ok ?? 0;
  }

  private async touchKey(id: string, lastUsedAt: Date | null) {
    const now = Date.now();
    if (lastUsedAt && now - lastUsedAt.getTime() < LAST_USED_THROTTLE_MS) return;
    await this.prisma.apiKey
      .update({ where: { id }, data: { lastUsedAt: new Date() } })
      .catch(() => undefined);
  }
}

/**
 * Joriy hisob davrining boshlanishi.
 *
 * Kvota kalendar oyi bo'yicha emas, obuna boshlangan kundan sanaladi:
 * 15-mayda boshlangan obuna uchun davr 15-may — 15-iyun. Aks holda oy
 * o'rtasida obuna ochgan mijoz birinchi oyda kvotasining yarmini olardi.
 */
export function currentPeriodStart(startedAt: Date, now: Date): Date {
  // Taxminiy oylar sonidan boshlab aniq anchorni topamiz.
  let months =
    (now.getFullYear() - startedAt.getFullYear()) * 12 +
    (now.getMonth() - startedAt.getMonth());
  if (months < 0) months = 0;

  let anchor = addMonths(startedAt, months);
  if (anchor > now) anchor = addMonths(startedAt, Math.max(0, months - 1));
  return anchor;
}
