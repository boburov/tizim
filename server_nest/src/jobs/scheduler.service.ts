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
 * ── ⚠ IKKI XIL ROL: ISHLAB CHIQARUVCHI va ISHCHI ──
 *
 * Bu farq migratsiyaning eng muhim nuqtasi.
 *
 *   PRODUSER (ishlab chiqaruvchi) — navbatga ish QO'YADI (`now`, `at`).
 *     Bu DUBLIKAT EMAS: bitta HTTP so'rov → bitta yozuv. NestJS
 *     qo'ygan ishni Express'ning ishchisi olib bajaradi, ya'ni
 *     migratsiya davomida zanjir UZILMAYDI.
 *
 *   ISHCHI (worker) — navbatdan ish OLADI va cron jadvalini yuritadi.
 *     ANA SHU ikkilanishga olib keladi va aynan shu `NEST_WORKERS_ENABLED`
 *     + `NEST_WORKER_JOBS` bilan yopilgan.
 *
 * Shuning uchun produser rejimida pg-boss ATAYLAB cheklangan holda
 * ulanadi:
 *     supervise: false   — texnik xizmatni (eskirgan ishlarni tozalash)
 *                          Express bajaradi, ikki nusxa kerak emas;
 *     schedule:  false   — ⚠ ENG MUHIMI: cron soati YURITILMAYDI, ya'ni
 *                          NestJS jarayoni `pgboss.schedule` dagi
 *                          yozuvlar bo'yicha ish YARATMAYDI. Busiz
 *                          Express ro'yxatga olgan 22 ta cron NestJS
 *                          tomonidan ham ishga tushirilardi — kuniga
 *                          ikki marta bildirishnoma, ikki marta accrual;
 *     migrate/createSchema: false
 *                        — sxema Express'niki; uni ikkinchi ilova
 *                          ko'chirmasligi kerak.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class SchedulerService implements OnApplicationShutdown {
  private readonly logger = new Logger('Scheduler');
  private boss: PgBoss | null = null;
  /** pg-boss ulangan (`start()` chaqirilgan). */
  private connected = false;
  /** ⚠ Bu jarayon ishchi sifatida ishlayaptimi (navbatdan ish OLADI). */
  private workersStarted = false;

  constructor(private readonly config: ConfigService<AppConfig, true>) {}

  /**
   * ⚠ "ISHCHI rejimida ishga tushganmi" — "ulanganmi" EMAS.
   * Testlar va tashxis aynan shu farqni tekshiradi.
   */
  isStarted(): boolean {
    return this.workersStarted;
  }

  /** pg-boss ulanganmi (produser rejimi ham shu). */
  isConnected(): boolean {
    return this.connected;
  }

  /** Bu jarayon ishchi bo'lishi kerakmi (sozlama bo'yicha). */
  private workersEnabled(): boolean {
    return Boolean(this.config.get('NEST_WORKERS_ENABLED', { infer: true }));
  }

  /**
   * pg-boss nusxasi. ATAYLAB dangasa (lazy): `NEST_WORKERS_ENABLED=false`
   * bo'lganda `PgBoss` obyekti UMUMAN yaratilmaydi va `pgboss` sxemasiga
   * bitta ham so'rov ketmaydi.
   */
  private instance(): PgBoss {
    if (this.boss) return this.boss;

    const asWorker = this.workersEnabled();
    const boss = new PgBoss({
      connectionString: this.config.get('DATABASE_URL', { infer: true }),
      // ⚠ Express bilan BIR XIL sxema. Boshqasi bo'lsa Nest o'zining
      // alohida navbat to'plamini yaratardi va NestJS qo'ygan ishni
      // Express'ning ishchisi HECH QACHON ko'rmasdi.
      schema: 'pgboss',
      // ⚠ PRODUSER CHEKLOVLARI — yuqoridagi izohga qarang.
      // `asWorker` bo'lsa standart (to'liq) rejim.
      ...(asWorker
        ? {}
        : { supervise: false, schedule: false, migrate: false, createSchema: false }),
    } as never);
    boss.on('error', (err: unknown) => this.logger.error('pg-boss xatosi', err));
    this.boss = boss;
    return boss;
  }

  /**
   * Ulanishni kafolatlaydi (bir marta).
   *
   * ⚠ ISH QO'YISH UCHUN HAM `start()` SHART: `send()`/`sendAfter()`
   * ulanmagan nusxada ishlamaydi. Shuning uchun produserlar ham shu
   * yerdan o'tadi — lekin yuqoridagi cheklovlar bilan, ya'ni ulanish
   * ularni ISHCHIGA aylantirmaydi.
   */
  private async ensureConnected(): Promise<PgBoss> {
    const boss = this.instance();
    if (this.connected) return boss;
    await boss.start();
    this.connected = true;
    if (!this.workersEnabled()) {
      this.logger.log(
        "pg-boss PRODUSER rejimida ulandi (cron va ishchi YO'Q) — " +
          "ishni Express'ning ishchisi bajaradi",
      );
    }
    return boss;
  }

  /**
   * Navbatlarni yaratadi, worker'larni ulaydi va cron jadvalini yozadi.
   *
   * ⚠ SHU METOD `pgboss` SXEMASIGA YOZADI. Uni chaqirish — "bu jarayon
   * shu navbatlarning EGASI" degani.
   */
  async start(jobs: readonly JobDefinition[]): Promise<void> {
    if (this.workersStarted) return;
    if (jobs.length === 0) {
      // Bo'sh ro'yxat bilan `boss.start()` qilish ma'nosiz bo'lardi:
      // migratsiya ishlaydi, ulanish hovuzi ochiladi — natija esa nol.
      this.logger.warn(
        "Ro'yxatda birorta job yo'q — rejalashtiruvchi ishga tushirilmadi",
      );
      return;
    }

    const boss = await this.ensureConnected();

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

    this.workersStarted = true;
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

  /**
   * Express `scheduler.now(name, data)` — darhol bajarish uchun navbatga.
   *
   * ⚠ PRODUSER AMALI. NestJS ishchi bo'lmasa ham ishlaydi va bu TO'G'RI:
   * ishni Express'ning ishchisi oladi. Chaqiruvchi xatoni O'ZI ushlashi
   * kerak (Express'da ham `scheduleDelivery` shunday qilgan) — navbat
   * yo'q bo'lsa so'rov yiqilmasligi lozim.
   */
  async now(name: string, data: Record<string, unknown> | null = null) {
    const boss = await this.ensureConnected();
    return boss.send(name, data as never);
  }

  /** Express `scheduler.schedule(when, name, data)` — belgilangan vaqtda. */
  async at(when: Date | string | number, name: string, data: Record<string, unknown> | null = null) {
    const boss = await this.ensureConnected();
    const date = when instanceof Date ? when : new Date(when);
    return boss.sendAfter(name, data as never, null as never, date);
  }

  /**
   * Express `scheduler.cancel({ name })` — CRON rejasini bekor qilish.
   *
   * ⚠ BU `sendAfter` BILAN QO'YILGAN BITTA ISHNI BEKOR QILMAYDI —
   * `boss.unschedule` faqat `pgboss.schedule` (cron) yozuvini o'chiradi.
   * Express'da ham xuddi shunday, ya'ni rejalashtirilgan xabarni
   * "bekor qilish" AMALDA ish darajasida emas, HANDLER darajasida
   * ishlaydi: `dispatchScheduled` status `scheduled` bo'lmasa jimgina
   * chiqadi. Bu bog'liqlikni buzmang — aks holda bekor qilingan xabar
   * baribir yuborilardi.
   */
  async unschedule(name: string): Promise<void> {
    if (!name) return;
    const boss = await this.ensureConnected();
    await boss.unschedule(name).catch(() => null);
  }

  async stop(): Promise<void> {
    if (!this.connected || !this.boss) return;
    await this.boss.stop({ graceful: true });
    this.connected = false;
    this.workersStarted = false;
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
