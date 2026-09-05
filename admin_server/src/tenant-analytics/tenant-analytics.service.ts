import { Injectable, Logger, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import type { Tenant, Vps } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * TENANT ANALITIKASI — TENANTDAN O'QIB OLINADI, NUSXA SAQLANMAYDI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── NEGA HEARTBEAT ORQALI EMAS ──
 * Heartbeat har 15 daqiqada HAMMA tenantdan keladi va uning vazifasi —
 * limit tekshiruvi. Unga moliya trendini, kesimlarni va kategoriyalarni
 * qo'shish har tenantdan har chorak soatda o'nlab kilobayt tortardi,
 * hech kim qaramaydigan paytda ham. Analitika esa panel OCHILGANDA
 * kerak bo'ladi — ya'ni TORTIB olish (pull) to'g'ri model.
 *
 * ── NEGA NUSXA SAQLANMAYDI ──
 * `admin_server` bazasida moliya jadvali YO'Q va bo'lmaydi. Nusxa
 * ikkinchi haqiqat manbai yaratardi: tenantda raqam o'zgarsa, panelda
 * eskisi turardi va qaysi biri to'g'riligini hech kim ayta olmasdi.
 * Javob KESHLANADI (qisqa muddat), lekin bu kesh — tezlik uchun, manba
 * uchun emas.
 *
 * ── MANZIL: DOMEN BIRINCHI, IP IKKINCHI ──
 * 1) `https://<domain>/api/...` — nginx orqali. Bu HAR DOIM ishlaydi:
 *    tenant porti tashqariga ochilmagan bo'lsa ham.
 * 2) `http://<vps.host>:<port>/api/...` — zaxira: DNS hali ko'chmagan
 *    yoki sertifikat olinmagan bo'lsa (ko'chirishdan keyingi soatlar).
 *
 * ── IZOLYATSIYA ──
 * Har tenantning O'Z `heartbeatSecret` i bilan, O'Z manziliga so'rov
 * ketadi. `tenantId` sim ustidan UZATILMAYDI — tenant serveri
 * so'ralgan id'ga emas, o'z bazasiga qaraydi. Ya'ni "boshqa tenant
 * analitikasini so'rash" degan holat protokolda mavjud emas.
 */

const TIMEOUT_MS = 15_000;
/** Kesh — tezlik uchun. Panel tab'lar orasida sakraganda qayta tortmasin. */
const CACHE_MS = 60_000;

type Snapshot = Record<string, unknown> & { generatedAt?: string };

@Injectable()
export class TenantAnalyticsService {
  private readonly logger = new Logger('TenantAnalytics');
  private readonly cache = new Map<string, { at: number; data: Snapshot }>();

  constructor(private readonly prisma: PrismaService) {}

  private urlsFor(tenant: Tenant & { vps: Vps | null }, months: number): string[] {
    const q = `months=${months}`;
    const urls: string[] = [`https://${tenant.domain}/api/internal/analytics?${q}`];
    const host = tenant.vps?.host || tenant.serverIp;
    if (host) urls.push(`http://${host}:${tenant.port}/api/internal/analytics?${q}`);
    return urls;
  }

  /**
   * Tenantdan proyeksiyani oladi.
   *
   * ⚠ XATO YUTILMAYDI. Bu — foydalanuvchi bosgan tugmaning javobi;
   * bo'sh obyekt qaytarsak panel "daromad 0" deb chizardi. Yetib
   * bo'lmasa 503 va sabab.
   */
  async fetch(tenantId: string, months = 6, force = false): Promise<Snapshot & { cached: boolean }> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { vps: true },
    });
    if (!tenant) throw new NotFoundException('Loyiha topilmadi');
    if (!tenant.heartbeatSecret) {
      throw new ServiceUnavailableException(
        "Loyihada heartbeat siri yo'q — analitika kanali sozlanmagan (qayta provision qiling)",
      );
    }
    if (tenant.status === 'DELETED') {
      throw new ServiceUnavailableException("O'chirilgan loyiha analitikasi mavjud emas");
    }

    const key = `${tenantId}:${months}`;
    const hit = this.cache.get(key);
    if (!force && hit && Date.now() - hit.at < CACHE_MS) {
      return { ...hit.data, cached: true };
    }

    const errors: string[] = [];
    for (const url of this.urlsFor(tenant, months)) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      try {
        const res = await fetch(url, {
          headers: { 'x-heartbeat-secret': tenant.heartbeatSecret },
          signal: controller.signal,
        });
        if (!res.ok) {
          // 404 — eski tenant: kod hali `platform-analytics` modulisiz.
          // Buni "o'chib qolgan" bilan aralashtirmaslik kerak.
          errors.push(`${new URL(url).host} → ${res.status}`);
          continue;
        }
        const data = (await res.json()) as Snapshot;
        this.cache.set(key, { at: Date.now(), data });
        return { ...data, cached: false };
      } catch (err) {
        errors.push(`${new URL(url).host} → ${(err as Error)?.message}`);
      } finally {
        clearTimeout(timer);
      }
    }

    this.logger.warn(`Analitika olinmadi (${tenant.domain}): ${errors.join('; ')}`);
    throw new ServiceUnavailableException(
      `Loyihadan analitika olinmadi. Urinishlar: ${errors.join('; ')}. ` +
        "Loyiha ishlab turibdimi va kodi yangilanganmi tekshiring (eski versiyada bu kanal yo'q).",
    );
  }
}
