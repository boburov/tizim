import {
  Injectable,
  Logger,
  Module,
  type OnApplicationBootstrap,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerService } from './scheduler.service.js';
import { TtlCleanupJob } from './system/ttl-cleanup.job.js';
import { UsageHeartbeatJob } from './system/usage-heartbeat.job.js';
import { EntitlementsService } from '../common/entitlements/entitlements.service.js';
import type { AppConfig } from '../config/env.validation.js';
import type { JobDefinition } from './job.types.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * FON ISHLARI — RO'YXATGA OLUVCHI.
 *
 * `server/src/jobs/index.js` ning o'rnini bosadi, LEKIN bitta tub farq
 * bilan: Express versiyasi ishga tushishi bilan 23 ta cronni SHARTSIZ
 * ro'yxatga oladi. Bu yerda esa har bir job OCHIQ RO'YXAT
 * (`NEST_WORKER_JOBS`) orqali yoqiladi.
 *
 * Sabab bitta: migratsiya davomida Express hamon ishlab turibdi. Ikkala
 * ilova bir xil `pgboss` sxemasiga ulanadi, ya'ni ikkalasi ham bir xil
 * cronni ro'yxatga olsa, ish IKKI MARTA bajarilardi. Bildirishnomada bu
 * "ikkita bir xil xabar", moliyada esa "ikkita pul harakati" degani.
 *
 * ⚠ RO'YXATGA QO'SHISH ≠ KO'CHIRISH TUGADI. Job bu yerda paydo bo'lishi
 * uchun uning BARCHA biznes servislari NestJS'da tayyor bo'lishi shart —
 * `WORKERS-DEPENDENCY-MATRIX.md` §1 aynan shuni kuzatib boradi.
 *
 * ── NEGA OCHIQ RO'YXATGA OLISH (`register`) ──
 *
 * Joblar bu yerga KONSTRUKTOR orqali kiritilmaydi. Sabab — halqa
 * (circular dependency): `NotificationsModule` `SchedulerService` uchun
 * `JobsModule` ni import qiladi, `notification.deliver` job'i esa
 * `NotificationsService` ga tayanadi. Konstruktor orqali bog'lansa
 * `JobsModule ⇄ NotificationsModule` halqasi hosil bo'lardi va
 * `forwardRef` bilan yamashga to'g'ri kelardi.
 *
 * Buning o'rniga har bir job oilasi O'Z modulida turadi va `onModuleInit`
 * da o'zini ro'yxatga oladi. `onModuleInit` `onApplicationBootstrap` dan
 * OLDIN ishlaydi, ya'ni ishchilar ishga tushganda ro'yxat to'liq bo'ladi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class JobsRegistry implements OnApplicationBootstrap {
  private readonly logger = new Logger('Jobs');

  /** Ro'yxatga olingan joblar (nom → ta'rif). */
  private readonly jobs = new Map<string, JobDefinition>();

  constructor(
    private readonly scheduler: SchedulerService,
    private readonly config: ConfigService<AppConfig, true>,
  ) {}

  /**
   * Job oilasini ro'yxatga oladi.
   *
   * ⚠ RO'YXATGA OLISH ISHGA TUSHIRISH EMAS. Bu faqat "kodi tayyor"
   * degani; haqiqatan ishlashi `NEST_WORKER_JOBS` ga bog'liq.
   */
  register(...defs: JobDefinition[]): void {
    for (const def of defs) {
      const clash = this.jobs.get(def.name);
      if (clash && clash !== def) {
        // Bir nom ikki marta — bu ish IKKI MARTA bajarilishi demak.
        // Jimgina "oxirgisi yutadi" qilib bo'lmaydi.
        throw new Error(`Job nomi takrorlandi: ${def.name}`);
      }
      this.jobs.set(def.name, def);
    }
  }

  /**
   * NestJS'ga KO'CHIRILGAN joblar. Ro'yxatda turishi — "kodi tayyor"
   * degani; ishga tushishi esa `NEST_WORKER_JOBS` ga bog'liq.
   */
  all(): JobDefinition[] {
    return [...this.jobs.values()];
  }

  /** Ochiq ro'yxat bo'yicha filtr. Bo'sh ro'yxat — hech biri. */
  selected(): JobDefinition[] {
    const raw = String(this.config.get('NEST_WORKER_JOBS', { infer: true }) || '');
    const wanted = raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    if (wanted.length === 0) return [];
    if (wanted.includes('*')) return this.all();

    const known = new Map(this.all().map((j) => [j.name, j]));
    const picked: JobDefinition[] = [];
    for (const name of wanted) {
      const job = known.get(name);
      if (job) {
        picked.push(job);
      } else {
        // ⚠ JIMGINA O'TKAZIB YUBORILMAYDI. Nomdagi xato "job yoqildi"
        // deb o'ylangan holatni yaratardi, aslida esa u umuman
        // ishlamasdi — va buni HECH NARSA ko'rsatmasdi.
        this.logger.error(
          `NEST_WORKER_JOBS da noma'lum job nomi: "${name}". ` +
            `Mavjudlari: ${[...known.keys()].join(', ') || '(yo\'q)'}`,
        );
      }
    }
    return picked;
  }

  /**
   * `onApplicationBootstrap` — `onModuleInit` EMAS: worker'lar ulanishdan
   * oldin BUTUN konteyner (Prisma ulanishi ham) tayyor bo'lishi kerak.
   * Aks holda birinchi ish bazasiz jarayonda ishga tushib yiqilardi.
   */
  async onApplicationBootstrap(): Promise<void> {
    const enabled = this.config.get('NEST_WORKERS_ENABLED', { infer: true });

    if (!enabled) {
      this.logger.log(
        "Fon ishlari O'CHIQ (NEST_WORKERS_ENABLED=false) — " +
          'Express yagona worker bo\'lib qolmoqda',
      );
      return;
    }

    const jobs = this.selected();
    if (jobs.length === 0) {
      // FAIL-CLOSED: yoqilgan-u ro'yxat bo'sh. Bu deyarli har doim
      // sozlash xatosi, shuning uchun baland ovozda aytiladi — lekin
      // jarayon yiqitilmaydi (HTTP marshrutlari ishlashda davom etsin).
      this.logger.warn(
        'NEST_WORKERS_ENABLED=true, lekin NEST_WORKER_JOBS bo\'sh — ' +
          "birorta job ro'yxatga olinmadi (fail-closed)",
      );
      return;
    }

    this.logger.warn(
      `⚠ NestJS ${jobs.length} ta navbatning EGASI bo'lmoqda: ` +
        `${jobs.map((j) => j.name).join(', ')}. ` +
        "Express'da SHU joblar to'xtatilganiga ishonch hosil qiling.",
    );

    await this.scheduler.start(jobs);

    // ── BOOT CATCH-UP ──
    //
    // Express `jobs/index.js` startupda ba'zi ishlarni DARHOL bir marta
    // bajaradi (heartbeat, o'tkazib yuborilgan oylik generatsiya...).
    // Job o'zi shu imkoniyatni e'lon qilsa — chaqiramiz.
    //
    // ⚠ `await` QILINMAYDI: startup tarmoq so'rovi yoki og'ir hisobga
    // bog'lanib qolmasin (Express'da ham aynan shunday).
    for (const job of jobs) {
      const boot = (job as JobDefinition & { runOnBoot?: () => Promise<void> }).runOnBoot;
      if (typeof boot !== 'function') continue;
      Promise.resolve(boot.call(job)).catch((err) =>
        this.logger.warn(`Boot catch-up bajarilmadi (${job.name}): ${String(err)}`),
      );
      this.logger.log(`Boot catch-up ishga tushdi: ${job.name}`);
    }
  }
}

/**
 * TIZIM joblari — biznes moduliga tayanmaydiganlari. Ular shu modulda
 * qoladi; qolgan oilalar o'z modullarida (`jobs/notifications`,
 * `jobs/storage`, ...) va o'zlarini `JobsRegistry` ga yozadi.
 */
@Injectable()
export class SystemJobsRegistrar implements OnModuleInit {
  constructor(
    private readonly registry: JobsRegistry,
    private readonly ttlCleanup: TtlCleanupJob,
    private readonly usageHeartbeat: UsageHeartbeatJob,
  ) {}

  onModuleInit(): void {
    this.registry.register(this.ttlCleanup, this.usageHeartbeat);
  }
}

@Module({
  providers: [
    SchedulerService,
    EntitlementsService,
    TtlCleanupJob,
    UsageHeartbeatJob,
    JobsRegistry,
    SystemJobsRegistrar,
  ],
  // `SchedulerService` — `notifications`/`assignments` ko'chganda ularga
  // kerak bo'ladi (`scheduler.now(...)`). `EntitlementsService` —
  // `enforceLimit` middleware'iga.
  exports: [SchedulerService, EntitlementsService, JobsRegistry],
})
export class JobsModule {}
