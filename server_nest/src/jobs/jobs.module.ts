import {
  Injectable,
  Logger,
  Module,
  type OnApplicationBootstrap,
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
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class JobsRegistry implements OnApplicationBootstrap {
  private readonly logger = new Logger('Jobs');

  constructor(
    private readonly scheduler: SchedulerService,
    private readonly config: ConfigService<AppConfig, true>,
    private readonly ttlCleanup: TtlCleanupJob,
    private readonly usageHeartbeat: UsageHeartbeatJob,
  ) {}

  /**
   * NestJS'ga KO'CHIRILGAN joblar. Ro'yxatda turishi — "kodi tayyor"
   * degani; ishga tushishi esa `NEST_WORKER_JOBS` ga bog'liq.
   */
  all(): JobDefinition[] {
    return [this.ttlCleanup, this.usageHeartbeat];
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

    // ── STARTUPDA BIR MARTA: heartbeat ──
    //
    // Express `jobs/index.js` da ham aynan shunday: 15 daqiqa kutmasdan
    // limitlar keshini darhol to'ldiramiz. `await` QILINMAYDI — startup
    // tarmoq so'roviga bog'lanib qolmasin.
    if (
      jobs.some((j) => j.name === this.usageHeartbeat.name) &&
      this.usageHeartbeat.isConfigured()
    ) {
      this.usageHeartbeat.send().catch(() => null);
      this.logger.log('Usage heartbeat yoqildi (har 15 daqiqada)');
    }
  }
}

@Module({
  providers: [
    SchedulerService,
    EntitlementsService,
    TtlCleanupJob,
    UsageHeartbeatJob,
    JobsRegistry,
  ],
  // `SchedulerService` — `notifications`/`assignments` ko'chganda ularga
  // kerak bo'ladi (`scheduler.now(...)`). `EntitlementsService` —
  // `enforceLimit` middleware'iga.
  exports: [SchedulerService, EntitlementsService, JobsRegistry],
})
export class JobsModule {}
