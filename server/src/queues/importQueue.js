import { Queue, Worker } from "bullmq";
import env from "../config/env.js";
import logger from "../config/logger.js";
import { getRedis, isRedisEnabled, queuePrefix } from "../config/redis.js";
import ImportJob from "../models/importJob.model.js";
import User from "../models/user.model.js";
import { getImporter } from "../modules/imports/registry/index.js";
import { commitRows } from "../modules/imports/services/importEngine.service.js";
import { runWithBranchContext } from "../helpers/branchContext.helper.js";

/**
 * OMMAVIY IMPORT NAVBATI (Redis / BullMQ).
 *
 * NEGA KERAK: 300 qatorli o'quvchi importi har qator uchun
 * foydalanuvchi yaratadi, guruhga qo'shadi (bu esa a'zolik sanasidan
 * bugungacha HAR OY uchun to'lov qatorini quradi - qarang
 * groups.service.js -> ensureFinanceForMembershipRange) va boshlang'ich
 * qoldiqni materializatsiya qiladi. Bu o'n minglab DB amali.
 *
 * Bitta HTTP so'rovda bajarilsa nginx/heroku 30-60 soniyada ulanishni
 * uzadi. Server esa ishlashda DAVOM etadi. Foydalanuvchi "xato" ko'radi
 * va faylni QAYTA yuboradi - natijada ikkita import parallel ishlaydi.
 * Aynan shu ssenariy pulni ikki baravar yozishga eng yaqin yo'l edi.
 * (Ikkinchi to'siq baribir bor: OpeningBalance.user unique indeksi va
 * username unique - lekin birinchi to'siq shu navbat bo'lishi kerak.)
 *
 * Redis bo'lmasa navbat o'chadi va import sinxron ishlaydi, lekin
 * qator soni env.IMPORT_SYNC_MAX_ROWS bilan qattiq cheklanadi.
 */

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
      // QAYTA URINISH YO'Q - ataylab, va bu eng muhim sozlama.
      //
      // Import IDEMPOTENT EMAS: yarmida uzilgan ish qayta ishga
      // tushirilsa, allaqachon yaratilgan foydalanuvchilar "takror"
      // deb o'tib ketardi (bu yaxshi), LEKIN guruhga qo'shish va
      // moliya generatsiyasi qayta ishlanardi. Yagona to'g'ri xulq -
      // to'xtash va natijani odamga ko'rsatish.
      attempts: 1,
      removeOnComplete: { count: 50 },
      removeOnFail: { count: 100 },
    },
  });
  return queue;
};

/**
 * Ishni navbatga qo'yadi. ImportJob hujjati CHAQIRUVCHIDA yaratiladi -
 * shunda Redis o'chib qolsa ham "queued" yozuvi Mongo'da qoladi va
 * yo'qolgan import ko'rinib turadi.
 */
export const enqueueImport = async (jobId) => {
  const q = getImportQueue();
  if (!q) return null;
  return q.add(
    "run",
    { jobId: String(jobId) },
    {
      // Bitta ImportJob = bitta navbat yozuvi. Ikki marta qo'shilsa
      // (client retry, double-click) ikkinchisi jimgina e'tiborsiz
      // qoldiriladi - BullMQ bir xil jobId'ni qabul qilmaydi.
      jobId: `import:${jobId}`,
    },
  );
};

/**
 * Ishni BAJARADI. Navbat orqali ham, sinxron rejimda ham AYNAN shu
 * funksiya chaqiriladi - ikki xil yo'l bo'lsa ular vaqt o'tib
 * bir-biridan ajralib ketardi.
 */
export const runImportJob = async (jobId, { onProgress } = {}) => {
  const job = await ImportJob.findById(jobId);
  if (!job) throw new Error(`ImportJob topilmadi: ${jobId}`);

  // Faqat kutayotgan ish bajariladi. Ikki worker bitta ishni olsa
  // (Redis qayta tiklanishi, qo'lda qayta yuborish) ikkinchisi shu
  // yerda to'xtaydi - shartli atomik update, poyga holatiga chidamli.
  const claimed = await ImportJob.findOneAndUpdate(
    { _id: job._id, status: "queued" },
    { $set: { status: "running", startedAt: new Date() } },
    { new: true },
  );
  if (!claimed) {
    logger.warn(
      { jobId: String(jobId), status: job.status },
      "Import allaqachon boshlangan yoki tugagan - o'tkazib yuborildi",
    );
    return null;
  }

  const importer = getImporter(claimed.importerKey);
  if (!importer) {
    await ImportJob.findByIdAndUpdate(claimed._id, {
      $set: {
        status: "failed",
        error: `Noma'lum import turi: ${claimed.importerKey}`,
        finishedAt: new Date(),
      },
    });
    throw new Error(`Noma'lum import turi: ${claimed.importerKey}`);
  }

  const currentUser = claimed.user ? await User.findById(claimed.user) : null;

  // FILIAL KONTEKSTINI TIKLASH. Bu blokdan tashqarida bajarilgan
  // har qanday yozuv filial ko'lamisiz ketardi (qarang: ImportJob.scope).
  const scope = claimed.scope || {};
  const startedAt = Date.now();

  return runWithBranchContext(
    {
      branchId: scope.branchId ? String(scope.branchId) : null,
      allowedBranchIds: (scope.allowedBranchIds || []).map(String),
      canSeeAllBranches: Boolean(scope.canSeeAllBranches),
      userId: claimed.user ? String(claimed.user) : null,
    },
    async () => {
      try {
        const result = await commitRows({
          importer,
          rows: claimed.rows || [],
          currentUser,
          importJobId: claimed._id,
          // Ruxsatlar so'rov paytida muzlatilgan (qarang ImportJob.scope).
          actor: { currentUser, permissions: scope.permissions || [] },
          onProgress: async (processed) => {
            await ImportJob.updateOne(
              { _id: claimed._id },
              { $set: { processed } },
            ).catch(() => null);
            onProgress?.(processed);
          },
        });

        await ImportJob.findByIdAndUpdate(claimed._id, {
          $set: {
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
            // PAROLLARNI TOZALASH. Yuborilgan qatorlarda ochiq parol
            // bor edi; ish tugagach ularni tarixda saqlab turishning
            // hech qanday foydasi yo'q, faqat qo'shimcha oshkoralik.
            // Parol kerak bo'lsa foydalanuvchi kartochkasidan olinadi.
            rows: [],
          },
        });

        return result;
      } catch (err) {
        await ImportJob.findByIdAndUpdate(claimed._id, {
          $set: {
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

  // NAVBAT O'CHIQ EKANI JIMGINA O'TMASLIGI KERAK.
  //
  // Bu holatda import baribir ishlaydi, lekin qator soni qattiq
  // cheklanadi. Log bo'lmasa, egasi 300 qatorli fayl rad etilganda
  // sababini tushunmasdi va uni "xato" deb qabul qilardi.
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
      // 1 - ataylab (env bilan oshirish mumkin). Parallel importlar
      // bir xil login generatsiyasiga va bir xil guruhga bir vaqtda
      // yozishga urinardi; ketma-ketlik bu sinfdagi poygalarni
      // butunlay yo'q qiladi.
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
