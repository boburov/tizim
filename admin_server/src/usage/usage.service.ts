import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { EntitlementsService } from '../entitlements/entitlements.service.js';

/** Bitta heartbeat'da qabul qilinadigan maksimal metrika soni (himoya). */
const MAX_METRICS = 50;
/** Metrika kaliti uchun ruxsat etilgan shakl. */
const METRIC_KEY_RE = /^[a-z][a-z0-9_]{0,48}$/;

@Injectable()
export class UsageService {
  private readonly logger = new Logger(UsageService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
  ) {}

  /**
   * Tenant server yuborgan heartbeat'ni qabul qiladi.
   *
   * Autentifikatsiya JWT emas, tenantga xos `heartbeatSecret` orqali —
   * bu server-server chaqiruvi, foydalanuvchi sessiyasi yo'q.
   *
   * Javobda tenantga uning limitlari qaytadi, shunda tenant server ularni
   * keshlab, o'zida enforcement qiladi (admin server o'chsa ham ishlaydi).
   */
  async heartbeat(
    tenantId: string,
    secret: string | undefined,
    metrics: Record<string, unknown>,
  ) {
    if (!secret) {
      throw new UnauthorizedException('Heartbeat kaliti yuborilmadi');
    }

    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { id: true, heartbeatSecret: true, status: true, domain: true },
    });
    if (!tenant) throw new NotFoundException('Tenant topilmadi');

    if (!tenant.heartbeatSecret || tenant.heartbeatSecret !== secret) {
      throw new UnauthorizedException("Heartbeat kaliti noto'g'ri");
    }
    if (tenant.status === 'DELETED' || tenant.status === 'DEPROVISIONING') {
      throw new UnauthorizedException("Bu tenant o'chirilgan");
    }

    const clean = this.sanitizeMetrics(metrics);

    // Snapshotlarni yozamiz (tarix — grafik uchun) va oxirgi aloqani belgilaymiz
    await this.prisma.$transaction([
      this.prisma.usageSnapshot.createMany({
        data: Object.entries(clean).map(([metricKey, value]) => ({
          tenantId,
          metricKey,
          value,
        })),
      }),
      this.prisma.tenant.update({
        where: { id: tenantId },
        data: { lastHeartbeatAt: new Date() },
      }),
    ]);

    // Tenant serverga limitlarini qaytaramiz — u keshlaydi
    return this.entitlements.compactForTenant(tenantId);
  }

  /** Metrikalarni tozalaydi: kalit shakli, butun son, manfiy emas. */
  private sanitizeMetrics(raw: Record<string, unknown>): Record<string, number> {
    const entries = Object.entries(raw ?? {});
    if (entries.length === 0) {
      throw new BadRequestException('Metrikalar bo\'sh');
    }
    if (entries.length > MAX_METRICS) {
      throw new BadRequestException(
        `Juda ko'p metrika (maksimum ${MAX_METRICS})`,
      );
    }

    const out: Record<string, number> = {};
    for (const [key, value] of entries) {
      if (!METRIC_KEY_RE.test(key)) {
        throw new BadRequestException(
          `Metrika kaliti noto'g'ri: "${key}" (faqat kichik harf, raqam, _)`,
        );
      }
      const num = Number(value);
      if (!Number.isFinite(num)) {
        throw new BadRequestException(`"${key}" qiymati raqam emas`);
      }
      // Butun songa yaxlitlaymiz (storage_mb kabi kasrlar uchun)
      const int = Math.round(num);
      if (int < 0) {
        throw new BadRequestException(`"${key}" manfiy bo'lishi mumkin emas`);
      }
      out[key] = int;
    }
    return out;
  }

  /** Admin UI uchun: tenantning usage tarixi (grafik). */
  async history(tenantId: string, metricKey?: string, days = 30) {
    const since = new Date();
    since.setDate(since.getDate() - days);

    return this.prisma.usageSnapshot.findMany({
      where: {
        tenantId,
        recordedAt: { gte: since },
        ...(metricKey ? { metricKey } : {}),
      },
      orderBy: { recordedAt: 'asc' },
      select: { metricKey: true, value: true, recordedAt: true },
      take: 5000,
    });
  }

  /** Admin UI uchun: hamma tenantlarning oxirgi holati (dashboard). */
  async overview() {
    const tenants = await this.prisma.tenant.findMany({
      where: { status: { notIn: ['DELETED'] } },
      select: {
        id: true,
        name: true,
        domain: true,
        status: true,
        lastHeartbeatAt: true,
        subscription: { select: { status: true, plan: { select: { name: true } } } },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Har tenant uchun limit/usage holati
    const result: any[] = [];
    for (const t of tenants) {
      const ent = await this.entitlements.forTenant(t.id).catch(() => null);
      result.push({
        ...t,
        planName: t.subscription?.plan.name ?? null,
        limits: ent?.limits ?? [],
        exceeded: ent?.limits.filter((l) => l.exceeded).map((l) => l.key) ?? [],
        // Heartbeat 30 daqiqadan ko'p kelmasa — aloqa uzilgan deb hisoblaymiz
        online: t.lastHeartbeatAt
          ? Date.now() - t.lastHeartbeatAt.getTime() < 30 * 60 * 1000
          : false,
      });
    }
    return result;
  }

  /**
   * Eski snapshotlarni tozalash — jadval cheksiz o'smasligi uchun.
   * Standart: 90 kundan eski yozuvlar.
   */
  async pruneOlderThan(days = 90) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    const res = await this.prisma.usageSnapshot.deleteMany({
      where: { recordedAt: { lt: cutoff } },
    });
    this.logger.log(`Usage tozalash: ${res.count} eski snapshot o'chirildi`);
    return { deleted: res.count };
  }
}
