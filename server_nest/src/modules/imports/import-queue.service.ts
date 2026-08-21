import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue, Worker } from 'bullmq';
// ⚠ `ioredis` v6 ESM'da NOM BILAN eksport qiladi — standart import
// TypeScript'da "not constructable" beradi.
import { Redis as IORedis } from 'ioredis';
import { PrismaService } from '../../prisma/prisma.service.js';
import { runWithBranchContext } from '../../common/als/branch-context.js';
import type { AppConfig } from '../../config/env.validation.js';
import { ImportEngineService } from './import-engine.service.js';
import { ImportRegistryService } from './import-registry.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OMMAVIY IMPORT NAVBATI (`queues/importQueue.js` KO'CHIRMASI).
 *
 * ── ⚠ REDIS IXTIYORIY BOG'LIQLIK ──
 * `REDIS_URL` bo'sh bo'lsa tizim navbatsiz (SINXRON, qattiq qator
 * chegarasi bilan) ishlaydi. Redis'ni majburiy qilish mavjud
 * o'rnatmalarni upgrade'dan keyin ishga tushmaydigan qilib qo'yardi —
 * moliyaviy tizimda bu qabul qilinmaydi.
 *
 * ── ⚠ WORKER OCHIQ BAYROQ BILAN BOSHQARILADI ──
 * `NEST_IMPORT_WORKER=false` (standart) — `Queue` bor, `Worker` YO'Q.
 * Bu `JobsModule` dagi bilan AYNI qoida: kesishuv davrida IKKI stek
 * bir navbatni ISTE'MOL qilsa bitta ish IKKI MARTA bajarilardi.
 * Ishni Express worker'i oladi (`startImportWorker`), navbat nomi va
 * prefiksi AYNAN bir xil.
 *
 * ⚠ EXPRESS O'CHIRILGANDA `NEST_IMPORT_WORKER=true` QILINISHI SHART.
 * Aks holda NestJS ishni navbatga qo'yadi-yu, HECH KIM olmaydi va
 * import "queued" holatida ABADIY qotib qoladi — xato ham chiqmaydi.
 *
 * ── ⚠ NAVBAT YO'LI BU MUHITDA O'LCHANMAGAN ──
 * `REDIS_URL` sozlanmagan, ya'ni na `enqueue`, na worker shoxi
 * bajariladi (ikkala stekda ham) va import SINXRON ishlaydi.
 * Hisobotda U O'LCHANMADI deb belgilanadi — "ishlaydi" deb aytish
 * uchun asos yo'q.
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const IMPORT_QUEUE_NAME = 'bulk-import';

/**
 * ⚠ BullMQ TALABI: `maxRetriesPerRequest` `null` bo'lishi SHART. Aks
 * holda ioredis uzilish paytida so'rovni `MaxRetriesPerRequestError`
 * bilan rad etadi va navbat JIMGINA o'ladi.
 */
const CONNECTION_OPTS = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  retryStrategy: (times: number) => Math.min(times * 500, 10_000),
};

@Injectable()
export class ImportQueueService implements OnApplicationShutdown, OnApplicationBootstrap {
  private readonly logger = new Logger('ImportQueue');
  private readonly redisUrl: string;
  private readonly redisPrefix: string;
  private readonly syncMaxRows: number;
  private readonly workerEnabled: boolean;
  private readonly concurrency: number;
  private redis: IORedis | null = null;
  private queue: Queue | null = null;
  private worker: Worker | null = null;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly engine: ImportEngineService,
    private readonly registry: ImportRegistryService,
    @Inject(ConfigService) config: ConfigService<AppConfig, true>,
  ) {
    this.redisUrl = (config.get('REDIS_URL', { infer: true }) as string) || '';
    this.redisPrefix = (config.get('REDIS_PREFIX', { infer: true }) as string) || 'lc';
    this.syncMaxRows = config.get('IMPORT_SYNC_MAX_ROWS', { infer: true }) as number;
    this.workerEnabled = config.get('NEST_IMPORT_WORKER', { infer: true }) as boolean;
    this.concurrency = config.get('IMPORT_QUEUE_CONCURRENCY', { infer: true }) as number;
  }

  /**
   * ═══════════════════════════════════════════════════════════════════
   * NAVBAT ISTE'MOLCHISI — FAQAT OCHIQ YOQILGANDA.
   *
   * ⚠ KESISHUV DAVRIDA O'CHIQ (`NEST_IMPORT_WORKER=false`): navbatni
   * EXPRESS worker'i oladi. Ikkala stek bir navbatni iste'mol qilsa
   * BITTA import IKKI MARTA bajarilardi.
   *
   * ⚠ EXPRESS O'CHIRILGANDA YOQILISHI SHART: aks holda NestJS ishni
   * navbatga qo'yadi-yu, HECH KIM olmaydi va import "queued" holatida
   * ABADIY qotib qoladi — xato ham chiqmaydi.
   *
   * ⚠ NAVBAT NOMI, PREFIKS VA `jobId` SHAKLI Express bilan AYNAN BIR
   * XIL — shuning uchun kesishuv paytida qo'yilgan ish ham olinadi.
   */
  onApplicationBootstrap(): void {
    if (!this.workerEnabled) {
      this.logger.log(
        "Import worker O'CHIQ (NEST_IMPORT_WORKER=false) — navbatni Express oladi",
      );
      return;
    }
    if (!this.isRedisEnabled()) {
      // ⚠ JIMGINA O'TIB KETILMAYDI: bayroq yoqilgan, lekin Redis yo'q —
      // bu sozlash xatosi va import SINXRON yo'lga tushadi.
      this.logger.warn(
        `Import worker yoqilgan, lekin REDIS_URL yo'q — navbat ishlamaydi, ` +
          `import SINXRON bajariladi (bir faylda ${this.syncMaxRows} qatorgacha)`,
      );
      return;
    }

    this.worker = new Worker(
      IMPORT_QUEUE_NAME,
      async (job) => this.runImportJob(String((job.data as { jobId: string }).jobId)),
      {
        connection: this.connection() as never,
        prefix: this.queuePrefix(),
        concurrency: this.concurrency,
      },
    );

    this.worker.on('failed', (job, err: Error) => {
      // ⚠ JIMGINA YUTILMASIN: yiqilgan import foydalanuvchiga "queued"
      // bo'lib ko'rinardi.
      this.logger.error(
        `Ommaviy import yiqildi (${(job?.data as { jobId?: string })?.jobId}): ${err?.message}`,
      );
    });
    this.worker.on('completed', (job) => {
      this.logger.log(
        `Ommaviy import yakunlandi (${(job?.data as { jobId?: string })?.jobId})`,
      );
    });

    this.logger.warn(
      `⚠ NestJS import navbatining EGASI bo'lmoqda (concurrency: ` +
        `${this.concurrency}). Express'da worker TO'XTATILGANIGA ishonch ` +
        `hosil qiling.`,
    );
  }

  isRedisEnabled(): boolean {
    return Boolean(this.redisUrl);
  }

  get maxSyncRows(): number {
    return this.syncMaxRows;
  }

  /** Kalit prefiksi — bir nechta markaz bitta Redis'ni bo'lishishi mumkin. */
  private queuePrefix(): string {
    return `{${this.redisPrefix}}`;
  }

  /** YAGONA Redis ulanishi — navbat ham, worker ham shuni ishlatadi. */
  private connection(): IORedis {
    if (this.redis) return this.redis;
    this.redis = new IORedis(this.redisUrl, CONNECTION_OPTS as never);
    this.redis.on('error', (err: Error) => {
      // ⚠ JIMGINA YUTILMASIN: Redis o'chsa import navbatda QOTIB qoladi.
      this.logger.error(`Redis ulanish xatosi (import navbati): ${err?.message}`);
    });
    this.redis.on('ready', () => this.logger.log('Redis ulandi (import navbati)'));
    return this.redis;
  }

  private getQueue(): Queue | null {
    if (!this.isRedisEnabled()) return null;
    if (this.queue) return this.queue;

    this.queue = new Queue(IMPORT_QUEUE_NAME, {
      connection: this.connection() as never,
      prefix: this.queuePrefix(),
      defaultJobOptions: {
        attempts: 1,
        removeOnComplete: { count: 50 },
        removeOnFail: { count: 100 },
      },
    });
    return this.queue;
  }

  /**
   * Ishni navbatga qo'yadi.
   *
   * ⚠ Navbat nomi (`bulk-import`), prefiks va `jobId` shakli
   * (`import:<id>`) Express bilan AYNAN bir xil — ishni Express
   * worker'i oladi.
   *
   * ⚠ Redis yo'q bo'lsa `null` qaytadi va chaqiruvchi SINXRON yo'lga
   * tushadi (Express bilan aynan bir xil).
   */
  async enqueueImport(jobId: string): Promise<unknown | null> {
    const q = this.getQueue();
    if (!q) return null;
    return q.add('run', { jobId: String(jobId) }, { jobId: `import:${jobId}` });
  }

  async onApplicationShutdown(): Promise<void> {
    // ⚠ WORKER AVVAL YOPILADI: navbat yopilgandan keyin yopilsa
    // ishlayotgan job ulanishsiz qolardi.
    await this.worker?.close().catch(() => null);
    this.worker = null;
    await this.queue?.close().catch(() => null);
    this.queue = null;
    if (this.redis) {
      await this.redis.quit().catch(() => this.redis?.disconnect());
      this.redis = null;
    }
  }

  /**
   * ISHNI BAJARADI (sinxron yo'l va Express worker'i uchun bir xil).
   *
   * ⚠ `queued → running` o'tishi SHARTLI (`updateMany` + `count`):
   * ikki jarayon bir vaqtda olsa faqat BITTASI bajaradi. Usiz import
   * IKKI MARTA yozilardi.
   */
  async runImportJob(jobId: string, { onProgress }: { onProgress?: any } = {}) {
    const job = await this.prisma.importJob.findUnique({ where: { id: String(jobId) } });
    if (!job) throw new Error(`ImportJob topilmadi: ${jobId}`);

    const updateRes = await this.prisma.importJob.updateMany({
      where: { id: job.id, status: 'queued' },
      data: { status: 'running', startedAt: new Date() },
    });

    if (updateRes.count === 0) {
      this.logger.warn(
        `Import allaqachon boshlangan yoki tugagan - o'tkazib yuborildi ` +
          `(${jobId}, ${job.status})`,
      );
      return null;
    }

    const claimed: any = await this.prisma.importJob.findUnique({
      where: { id: job.id },
    });

    const importer = this.registry.getImporter(claimed.importerKey);
    if (!importer) {
      await this.prisma.importJob.update({
        where: { id: claimed.id },
        data: {
          status: 'failed',
          error: `Noma'lum import turi: ${claimed.importerKey}`,
          finishedAt: new Date(),
        },
      });
      throw new Error(`Noma'lum import turi: ${claimed.importerKey}`);
    }

    const currentUser = claimed.userId
      ? await this.prisma.user.findUnique({ where: { id: claimed.userId } })
      : null;

    const scope =
      (typeof claimed.scope === 'object'
        ? claimed.scope
        : JSON.parse(claimed.scope || '{}')) || {};
    const startedAt = Date.now();

    // ⚠ FILIAL KONTEKSTI TIKLANADI: ish HTTP so'rovidan ajralgan, ya'ni
    // ALS bo'sh. Usiz `branchFilter()` bo'sh filtr qaytarib, import
    // BARCHA filiallarni ko'rardi.
    return runWithBranchContext(
      {
        branchId: scope.branchId ? String(scope.branchId) : null,
        allowedBranchIds: (scope.allowedBranchIds || []).map(String),
        canSeeAllBranches: Boolean(scope.canSeeAllBranches),
        userId: claimed.userId ? String(claimed.userId) : null,
      },
      async () => {
        try {
          let rawRows = claimed.rows;
          if (typeof rawRows === 'string') {
            try { rawRows = JSON.parse(rawRows); } catch { rawRows = []; }
          } else if (!Array.isArray(rawRows)) {
            rawRows = [];
          }

          const result = await this.engine.commitRows({
            importer,
            rows: rawRows,
            currentUser,
            importJobId: claimed.id,
            actor: { currentUser, permissions: scope.permissions || [] },
            onProgress: async (processed: number) => {
              await this.prisma.importJob
                .update({ where: { id: claimed.id }, data: { processed } })
                .catch(() => null);
              onProgress?.(processed);
            },
          });

          await this.prisma.importJob.update({
            where: { id: claimed.id },
            data: {
              status: 'completed',
              processed: result.summary.total,
              total: result.summary.total,
              imported: result.summary.imported,
              failed: result.summary.failed + result.summary.error,
              duplicate: result.summary.duplicate,
              pending: result.summary.pending,
              results: result.rows,
              durationMs: Date.now() - startedAt,
              finishedAt: new Date(),
              rows: [],
            } as never,
          });

          return result;
        } catch (err: any) {
          await this.prisma.importJob
            .update({
              where: { id: claimed.id },
              data: {
                status: 'failed',
                error: String(err?.message || err).slice(0, 1000),
                durationMs: Date.now() - startedAt,
                finishedAt: new Date(),
                rows: [],
              } as never,
            })
            .catch(() => null);
          throw err;
        }
      },
    );
  }
}
