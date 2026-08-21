import { Queue, Worker } from "bullmq";
import env from "../config/env.js";
import logger from "../config/logger.js";
import { getRedis, isRedisEnabled, queuePrefix } from "../config/redis.js";
import prisma from "../config/prisma.js";
import { getImporter } from "../modules/imports/registry/index.js";
import { commitRows } from "../modules/imports/services/importEngine.service.js";
import { runWithBranchContext } from "../helpers/branchContext.helper.js";

export const IMPORT_QUEUE_NAME = "bulk-import";

let queue = null;
let worker = null;

const connection = () => getRedis();

export const getImportQueue = () => {
  if (!isRedisEnabled()) return null;
  if (queue) return queue;
  queue = new Queue(IMPORT_QUEUE_NAME, {
    connection: connection(),
    prefix: queuePrefix(),
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 100 },
    },
  });
  return queue;
};

export const enqueueImport = async (jobId) => {
  const q = getImportQueue();
  if (!q) return null;
  return q.add(
    "run",
    { jobId: String(jobId) },
    {
      jobId: `import:${jobId}`,
    },
  );
};

export const runImportJob = async (jobId, { onProgress } = {}) => {
  const job = await prisma.importJob.findUnique({ where: { id: String(jobId) } });
  if (!job) throw new Error(`ImportJob topilmadi: ${jobId}`);

  const updateRes = await prisma.importJob.updateMany({
    where: { id: job.id, status: "queued" },
    data: { status: "running", startedAt: new Date() },
  });

  if (updateRes.count === 0) {
    logger.warn(
      { jobId: String(jobId), status: job.status },
      "Import allaqachon boshlangan yoki tugagan - o'tkazib yuborildi",
    );
    return null;
  }

  const claimed = await prisma.importJob.findUnique({ where: { id: job.id } });

  const importer = getImporter(claimed.importerKey);
  if (!importer) {
    await prisma.importJob.update({
      where: { id: claimed.id },
      data: {
        status: "failed",
        error: `Noma'lum import turi: ${claimed.importerKey}`,
        finishedAt: new Date(),
      },
    });
    throw new Error(`Noma'lum import turi: ${claimed.importerKey}`);
  }

  const currentUser = claimed.userId ? await prisma.user.findUnique({ where: { id: claimed.userId } }) : null;

  const scope = (typeof claimed.scope === 'object' ? claimed.scope : JSON.parse(claimed.scope || '{}')) || {};
  const startedAt = Date.now();

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
            try {
                rawRows = JSON.parse(rawRows);
            } catch (e) {
                rawRows = [];
            }
        } else if (!Array.isArray(rawRows)) {
            rawRows = [];
        }

        const result = await commitRows({
          importer,
          rows: rawRows,
          currentUser,
          importJobId: claimed.id,
          actor: { currentUser, permissions: scope.permissions || [] },
          onProgress: async (processed) => {
            await prisma.importJob.update({
              where: { id: claimed.id },
              data: { processed },
            }).catch(() => null);
            onProgress?.(processed);
          },
        });

        await prisma.importJob.update({
          where: { id: claimed.id },
          data: {
            status: "completed",
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
          },
        });

        return result;
      } catch (err) {
        await prisma.importJob.update({
          where: { id: claimed.id },
          data: {
            status: "failed",
            error: String(err?.message || err).slice(0, 1000),
            durationMs: Date.now() - startedAt,
            finishedAt: new Date(),
            rows: [],
          },
        }).catch(() => null);
        throw err;
      }
    },
  );
};

export const startImportWorker = () => {
  if (worker) return worker;

  if (!isRedisEnabled()) {
    logger.warn(
      { syncMaxRows: env.IMPORT_SYNC_MAX_ROWS },
      "Import navbati O'CHIQ (REDIS_URL yo'q) - ommaviy import sinxron " +
        "ishlaydi va bir faylda qator soni cheklanadi",
    );
    return null;
  }

  worker = new Worker(
    IMPORT_QUEUE_NAME,
    async (job) => runImportJob(job.data.jobId),
    {
      connection: connection(),
      prefix: queuePrefix(),
      concurrency: env.IMPORT_QUEUE_CONCURRENCY,
    },
  );

  worker.on("failed", (job, err) => {
    logger.error(
      { jobId: job?.data?.jobId, err: err?.message },
      "Ommaviy import yiqildi",
    );
  });
  worker.on("completed", (job) => {
    logger.info({ jobId: job?.data?.jobId }, "Ommaviy import yakunlandi");
  });

  logger.info(
    { concurrency: env.IMPORT_QUEUE_CONCURRENCY },
    "Import worker ishga tushdi (Redis)",
  );
  return worker;
};

export const stopImportWorker = async () => {
  await worker?.close().catch(() => null);
  worker = null;
  await queue?.close().catch(() => null);
  queue = null;
};
