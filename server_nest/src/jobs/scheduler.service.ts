import { Injectable, Logger, type OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PgBoss } from 'pg-boss';
import type { AppConfig } from '../config/env.validation.js';
import type { JobDefinition } from './job.types.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * REJALASHTIRUVCHI — `server/src/config/scheduler.js` NING KO'CHIRMASI.
 *
 * O'SHA pg-boss, O'SHA `pgboss` sxemasi, O'SHA navbat nomlari.
 *
 * ── NEGA EXPRESS'DAGI "AGENDA ADAPTERI" KO'CHIRILMADI ──
 *
 * Express'dagi qatlam `job.attrs.data` shaklini yasab, Agenda API'sini
 * taqlid qiladi. U 26 ta faylni qayta yozmaslik uchun kerak bo'lgan —
 * ya'ni MIGRATSIYA QARZI, arxitektura qarori emas. Bu yerda hech qanday
 * Agenda kodi yo'q, shuning uchun taqlid ham keraksiz: handler `data` ni
 * to'g'ridan-to'g'ri oladi.
 *
 * Navbat sozlamalari (retryLimit 3, retryDelay 60s, expireIn 15 daqiqa,
 * batchSize 1) esa AYNAN saqlangan — ular pg-boss jadvallariga yoziladi
 * va ikki ilova bir xil navbatni boshqacha sozlasa, oxirgi ishga
 * tushgani boshqasining siyosatini JIMGINA bosib ketardi.
 *
 * ── ⚠ IKKILANISH HIMOYASI ──
 *
 * Bu servis o'zi HECH NARSANI ro'yxatga olmaydi. `register()` ga nima
 * berilsa, o'shani oladi; nimani berish esa `JobsModule` da, ochiq
 * ro'yxat (`NEST_WORKER_JOBS`) bo'yicha hal qilinadi. Shuning uchun
 * "tasodifan hamma job yoqilib ketdi" holati bu yerda MUMKIN EMAS.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class SchedulerService implements OnApplicationShutdown {
  private readonly logger = new Logger('Scheduler');
  private boss: PgBoss | null = null;
  private started = false;

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  /** Ishga tushganmi — `JobsModule` va testlar shu bo'yicha qaror qiladi. */
  isStarted(): boolean {
    return this.started;
  }

  /**
   * pg-boss nusxasi. ATAYLAB dangasa (lazy): `NEST_WORKERS_ENABLED=false`
   * bo'lganda `PgBoss` obyekti UMUMAN yaratilmaydi va `pgboss` sxemasiga
   * bitta ham so'rov ketmaydi.
   */
  private instance(): PgBoss {
    if (this.boss) return this.boss;
    const boss = new PgBoss({
      connectionString: this.config.get('DATABASE_URL', { infer: true }),
      // ⚠ Express bilan BIR XIL sxema. Boshqasi bo'lsa Nest o'zining
      // alohida navbat to'plamini yaratardi va ikkala ilova bir xil
      // cronni MUSTAQIL ravishda ishga tushirardi — aynan biz to'sayotgan
      // ikkilanish.
      schema: 'pgboss',
    });
    boss.on('error', (err: unknown) => this.logger.error('pg-boss xatosi', err));
    this.boss = boss;
    return boss;
  }

  /**
   * Navbatlarni yaratadi, worker'larni ulaydi va cron jadvalini yozadi.
   *
   * ⚠ SHU METOD `pgboss` SXEMASIGA YOZADI. Uni chaqirish — "bu jarayon
   * shu navbatlarning EGASI" degani.
   */
  async start(jobs: readonly JobDefinition[]): Promise<void> {
    if (this.started) return;
    if (jobs.length === 0) {
      // Bo'sh ro'yxat bilan `boss.start()` qilish ma'nosiz bo'lardi:
      // migratsiya ishlaydi, ulanish hovuzi ochiladi — natija esa nol.
      this.logger.warn(
        "Ro'yxatda birorta job yo'q — rejalashtiruvchi ishga tushirilmadi",
      );
      return;
    }

    const boss = this.instance();
    await boss.start();

    for (const job of jobs) {
      // pg-boss v10+ da navbat OLDIN yaratilishi shart.
      await boss.createQueue(job.name, {
        retryLimit: job.retryLimit ?? 3,
        retryDelay: job.retryDelaySec ?? 60,
        expireInSeconds: job.lockLifetimeMs
          ? Math.ceil(job.lockLifetimeMs / 1000)
          : 15 * 60,
      } as never);

      await boss.work(
        job.name,
        { localConcurrency: job.concurrency ?? 1, batchSize: 1 },
        this.adapt(job),
      );

      if (job.cron) {
        // Eski jadvalni tozalaymiz: cron ifodasi o'zgarganda ikkita reja
        // yonma-yon qolib ketmasligi uchun (idempotent qayta ishga tushirish).
        await boss.unschedule(job.name).catch(() => null);
        await boss.schedule(job.name, job.cron, null, {
          tz: job.timezone || this.config.get('TZ_NAME', { infer: true }),
        } as never);
      }
    }

    this.started = true;
    this.logger.log(
      `Rejalashtiruvchi ishga tushdi (pg-boss) — ${jobs.length} ta job: ` +
        jobs.map((j) => j.name).join(', '),
    );
  }

  /**
   * pg-boss handler'ga `Job[]` massivini beradi (batchSize=1 bo'lsa ham).
   *
   * ⚠ XATO QAYTA TASHLANADI. pg-boss faqat shunda `retryLimit` bo'yicha
   * qayta uradi; yutib yuborilsa ish "bajarildi" bo'lib yopilardi.
   */
  private adapt(job: JobDefinition) {
    return async (raw: unknown): Promise<void> => {
      const batch = (Array.isArray(raw) ? raw : [raw]) as Array<{
        id?: string;
        data?: Record<string, unknown> | null;
      }>;
      for (const item of batch) {
        try {
          await job.run(item?.data ?? {});
        } catch (err) {
          this.logger.error(`Job bajarilmadi: ${job.name}`, err);
          throw err;
        }
      }
    };
  }

  /** Express `scheduler.now(name, data)` — darhol bajarish. */
  async now(name: string, data: Record<string, unknown> | null = null) {
    return this.instance().send(name, data as never);
  }

  /** Express `scheduler.schedule(when, name, data)` — belgilangan vaqtda. */
  async at(when: Date | string | number, name: string, data: Record<string, unknown> | null = null) {
    const date = when instanceof Date ? when : new Date(when);
    return this.instance().sendAfter(name, data as never, null as never, date);
  }

  /** Express `scheduler.cancel({ name })` — rejani bekor qilish. */
  async unschedule(name: string): Promise<void> {
    if (!name) return;
    await this.instance().unschedule(name).catch(() => null);
  }

  async stop(): Promise<void> {
    if (!this.started || !this.boss) return;
    await this.boss.stop({ graceful: true });
    this.started = false;
    this.logger.log("Rejalashtiruvchi to'xtatildi");
  }

  /**
   * `onApplicationShutdown` — `onModuleDestroy` EMAS: worker'lar Prisma
   * ulanishi yopilishidan OLDIN tugashi kerak, aks holda bajarilayotgan
   * ish "ulanish yo'q" xatosi bilan yiqilib, `retryLimit` ni bekorga
   * sarflardi.
   */
  async onApplicationShutdown(): Promise<void> {
    await this.stop().catch(() => null);
  }
}
