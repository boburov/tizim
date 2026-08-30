import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service.js';
import { EntitlementsService } from '../../common/entitlements/entitlements.service.js';
import { EntitlementCacheStore } from '../../common/entitlements/entitlement-cache.store.js';
import { ROLES } from '../../common/constants/permissions.js';
import { usageMonthKey } from '../../common/utils/ai-usage.js';
import type { AppConfig } from '../../config/env.validation.js';
import type { JobDefinition } from '../job.types.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * USAGE HEARTBEAT — `server/src/jobs/usageHeartbeat.job.js` KO'CHIRMASI.
 *
 * Har 15 daqiqada admin panelga tenant metrikalarini yuboradi va JAVOBDAN
 * tarif limitlarini keshga oladi. Ikkala yo'nalish ham muhim: metrika
 * bizga (hisob-kitob), limitlar tenantga (`EntitlementsService`).
 *
 * ── FAQAT PROVISION QILINGAN TENANTDA ISHLAYDI ──
 *
 * `ADMIN_API_URL` + `TENANT_ID` + `HEARTBEAT_SECRET` uchalasi ham bo'lsa.
 * Standalone/lokal o'rnatmalarda job butunlay o'chiq qoladi — bu XATO
 * EMAS, normal holat.
 *
 * ── NEGA BU JOB KO'CHIRILDI ──
 *
 * Yagona bog'liqligi — `aiBudget.monthlyUsage()` dan olinadigan BITTA
 * son (oylik chaqiruvlar). U AI modulining qolgan qismiga umuman
 * tayanmaydi: bitta `ai_usage_logs` bo'yicha agregat so'rov. Shuning
 * uchun quyida o'sha so'rovning O'ZI (`aiCallsThisMonth`) turibdi,
 * `ai` modulini kutish shart emas.
 *
 * ⚠ AI MODULI KO'CHGANDA: bu metod `aiBudget` servisiga ko'chirilsin va
 * bu yerda o'sha servis chaqirilsin. Ikkita nusxa QOLMASIN.
 *
 * ── IKKILANISH XAVFI ──
 *
 * O'RTA. Ikki jarayon yuborsa admin panel bir xil oynada IKKI marta
 * yozadi — bu metrika snapshot'i bo'lgani uchun ma'lumotni buzmaydi,
 * lekin "oxirgi ko'rilgan" vaqti va so'rov hisobi ikkilanadi. Shuning
 * uchun job ham standart holda O'CHIQ.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class UsageHeartbeatJob implements JobDefinition {
  /** ⚠ Express bilan aynan bir xil nom. */
  readonly name = 'usage.heartbeat';
  // Express `jobs/index.js`: every("*/15 * * * *", USAGE_HEARTBEAT_JOB)
  readonly cron = '*/15 * * * *';

  private readonly logger = new Logger('Job:usage-heartbeat');

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly entitlements: EntitlementsService,
    private readonly cacheStore: EntitlementCacheStore,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /**
   * Sozlanganmi. ⚠ Uchala qiymat ham SHART: bittasi yetishmasa admin
   * panel so'rovni baribir rad etadi va biz har 15 daqiqada bekorga
   * xato loglagan bo'lardik.
   */
  isConfigured(): boolean {
    return Boolean(
      this.config.get('ADMIN_API_URL', { infer: true }) &&
        this.config.get('TENANT_ID', { infer: true }) &&
        this.config.get('HEARTBEAT_SECRET', { infer: true }),
    );
  }

  /**
   * Joriy oydagi MUVAFFAQIYATLI AI chaqiruvlari.
   *
   * ⚠ `FILTER (WHERE "ok")` — faqat muvaffaqiyatlisi sanaladi. Mijoz
   * "N ta izoh" sotib oldi, bizning 429 xatolarimizni emas. (Tannarx
   * `costUsd` esa hammasini sanaydi — u AI moduliga tegishli va bu
   * yerda kerak emas.)
   */
  private async aiCallsThisMonth(): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ calls: number }>>`
      SELECT COUNT(*) FILTER (WHERE "ok")::int AS calls
      FROM "ai_usage_logs"
      WHERE "monthKey" = ${usageMonthKey()}
    `;
    return Number(rows?.[0]?.calls) || 0;
  }

  async collectMetrics(): Promise<Record<string, number>> {
    const notDeleted = { isDeleted: false };

    const [
      userCount,
      studentCount,
      teacherCount,
      groupCount,
      activeGroupCount,
      branchCount,
    ] = await Promise.all([
        // ⚠ `role: { not: STUDENT }` — "foydalanuvchi" = xodim + o'qituvchi.
        // O'quvchilar ALOHIDA sanaladi, chunki tarif ikkalasini boshqa-boshqa
        // chegaralaydi.
        this.prisma.user.count({
          where: { ...notDeleted, role: { not: ROLES.STUDENT } },
        }),
        this.prisma.user.count({ where: { ...notDeleted, role: ROLES.STUDENT } }),
        this.prisma.user.count({ where: { ...notDeleted, role: ROLES.TEACHER } }),
        this.prisma.group.count({ where: notDeleted }),
        this.prisma.group.count({ where: { ...notDeleted, isActive: true } }),
        // ⚠ FILIALLAR — `isActive` FILTRISIZ, ATAYLAB.
        //
        // Chegara "nechta filial YARATILGAN" ni sanaydi, "nechtasi
        // hozir yoqilgan" ni emas. Aks holda mijoz filiallarni
        // navbatma-navbat o'chirib-yoqib, chegaradan istagancha ko'p
        // filial ochib olardi. `PlanLimitsService.branchCount()` ham
        // AYNAN shunday sanaydi — ikki raqam ajralib qolmasin.
        this.prisma.branch.count({ where: notDeleted }),
      ]);

    const metrics: Record<string, number> = {
      user_count: userCount,
      student_count: studentCount,
      teacher_count: teacherCount,
      group_count: groupCount,
      active_group_count: activeGroupCount,
      // Admin panel "Used: 3 / Limit: 5" ni shundan chizadi.
      branch_count: branchCount,
    };

    // ⚠ QO'SHIMCHA METRIKALAR YIQILSA HEARTBEAT YIQILMAYDI. Ular
    // "yaxshi bo'lardi" turkumidan; ular uchun butun heartbeat'ni
    // yo'qotish limitlar keshini ham eskirtirardi.
    try {
      metrics.ai_calls_month = await this.aiCallsThisMonth();
    } catch (err) {
      this.logger.debug(`AI usage metrikasi olinmadi: ${String(err)}`);
    }

    try {
      const rows = await this.prisma.$queryRaw<Array<{ size: bigint }>>`
        SELECT pg_database_size(current_database()) as size
      `;
      const size = rows?.[0]?.size;
      if (size) metrics.storage_mb = Math.round(Number(size) / (1024 * 1024));
    } catch (err) {
      this.logger.debug(`Baza hajmi olinmadi: ${String(err)}`);
    }

    return metrics;
  }

  /**
   * Yuboradi va javobdan limitlarni keshga oladi.
   *
   * ⚠ HECH QACHON XATO TASHLAMAYDI. Admin panel o'chib qolsa tenant
   * ishlashda davom etishi kerak; xato tashlansa pg-boss uni 3 marta
   * qayta urib, keyin "failed" deb yozardi — foydasi yo'q shovqin.
   */
  async send(): Promise<unknown | null> {
    if (!this.isConfigured()) return null;

    const base = String(this.config.get('ADMIN_API_URL', { infer: true })).replace(
      /\/$/,
      '',
    );
    const tenantId = this.config.get('TENANT_ID', { infer: true });
    const url = `${base}/tenant-api/${tenantId}/heartbeat`;
    const metrics = await this.collectMetrics();

    // ⚠ 10 SONIYALIK CHEGARA. Usiz osilib qolgan so'rov worker slotini
    // band qilib turardi va keyingi yurish ham kechikardi.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-heartbeat-secret': String(
            this.config.get('HEARTBEAT_SECRET', { infer: true }),
          ),
        },
        body: JSON.stringify({ metrics }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text().catch(() => '');
        this.logger.warn(
          `Heartbeat rad etildi (${res.status}): ${text.slice(0, 200)}`,
        );
        return null;
      }

      const data = await res.json();
      const receivedAt = new Date();
      this.entitlements.set(data, receivedAt);
      // ⚠ BAZAGA HAM YOZILADI: modul darvozalari yopiq yiqilgani uchun
      // qayta ishga tushishda kesh bo'sh qolsa bo'limlar o'chib ketardi.
      // `await` — saqlanmagani jimgina yo'qolmasin (xato ichkarida
      // yutiladi, so'rovni yiqitmaydi).
      await this.cacheStore.save(data, receivedAt);
      this.logger.debug(`Heartbeat yuborildi (plan: ${data?.planKey ?? '-'})`);
      return data;
    } catch (err) {
      this.logger.warn(`Heartbeat yuborilmadi: ${(err as Error)?.message}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  async run(): Promise<void> {
    await this.send();
  }

  /**
   * Startupda DARHOL bir marta — 15 daqiqa kutmasdan.
   *
   * Sabab Express bilan bir xil: limitlar keshi (`EntitlementsService`)
   * bo'sh holda ko'tariladi va "cheksiz" deb o'qiladi. Birinchi
   * heartbeat kelmaguncha tarif chegaralari AMALDA ishlamaydi.
   */
  async runOnBoot(): Promise<void> {
    if (!this.isConfigured()) return;
    await this.send();
    this.logger.log('Usage heartbeat yoqildi (har 15 daqiqada)');
  }
}
