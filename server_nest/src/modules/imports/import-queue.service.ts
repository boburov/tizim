import { Inject, Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
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
 * ── ⚠ NEST FAQAT PRODUCER — WORKER ISHGA TUSHMAYDI ──
 * `Queue` bor (ishni navbatga qo'yish uchun), `Worker` YO'Q. Bu
 * `JobsModule` dagi bilan AYNI qoida: kesishuv davrida IKKI stek bir
 * navbatni ISTE'MOL qilsa bitta ish IKKI MARTA bajarilishi mumkin edi —
 * ya'ni PUL IKKI MARTA yozilardi. Ishni Express worker'i oladi
 * (`startImportWorker`), navbat nomi va prefiksi AYNAN bir xil.
 * Cutover'dan keyin worker shu yerda yoqiladi.
 *
 * ── ⚠ NAVBAT YO'LI BU MUHITDA O'LCHANMAGAN ──
 * `REDIS_URL` sozlanmagan, ya'ni `enqueue` shoxi HECH QACHON
 * bajarilmaydi (ikkala stekda ham). Hisobotda U O'LCHANMADI deb
 * belgilanadi — "ishlaydi" deb aytish uchun asos yo'q.
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
export class ImportQueueService implements OnApplicationShutdown {
  private readonly logger = new Logger('ImportQueue');
  private readonly redisUrl: string;
  private readonly redisPrefix: string;
  private readonly syncMaxRows: number;
  private redis: IORedis | null = null;
  private queue: Queue | null = null;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly engine: ImportEngineService,
    private readonly registry: ImportRegistryService,
    @Inject(ConfigService) config: ConfigService<AppConfig, true>,
  ) {
    this.redisUrl = (config.get('REDIS_URL', { infer: true }) as string) || '';
    this.redisPrefix = (config.get('REDIS_PREFIX', { infer: true }) as string) || 'lc';
    this.syncMaxRows = config.get('IMPORT_SYNC_MAX_ROWS', { infer: true }) as number;
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

  private getQueue(): Queue | null {
    if (!this.isRedisEnabled()) return null;
    if (this.queue) return this.queue;

    this.redis = new IORedis(this.redisUrl, CONNECTION_OPTS as never);
    this.redis.on('error', (err: Error) => {
      // ⚠ JIMGINA YUTILMASIN: Redis o'chsa import navbatda QOTIB qoladi.
      this.logger.error(`Redis ulanish xatosi (import navbati): ${err?.message}`);
    });
    this.redis.on('ready', () => this.logger.log('Redis ulandi (import navbati)'));

    this.queue = new Queue(IMPORT_QUEUE_NAME, {
      connection: this.redis as never,
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
