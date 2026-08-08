import asyncHandler from "../../../middleware/asyncHandler.js";
import ApiError from "../../../utils/ApiError.js";
import env from "../../../config/env.js";
import logger from "../../../config/logger.js";
import ImportJob from "../../../models/importJob.model.js";
import { isRedisEnabled } from "../../../config/redis.js";
import { enqueueImport, runImportJob } from "../../../queues/importQueue.js";
import { MAX_GRID_ROWS } from "../services/importEngine.service.js";

/**
 * JADVAL OQIMI, 3-BOSQICH: tahrirlangan qatorlarni YOZADI.
 *
 * ─── NEGA NAVBAT ORQALI ───
 * 300 qatorli o'quvchi importi har qator uchun foydalanuvchi yaratadi,
 * guruhga qo'shadi (bu esa a'zolik sanasidan bugungacha HAR OY uchun
 * to'lov qatorini quradi) va boshlang'ich qoldiqni materializatsiya
 * qiladi - o'n minglab DB amali.
 *
 * Bitta HTTP so'rovda bajarilsa proxy 30-60 soniyada ulanishni uzadi,
 * server esa ishlashda DAVOM etadi. Foydalanuvchi "xato" ko'rib faylni
 * QAYTA yuboradi va ikkita import parallel ketadi. Aynan shu - pulni
 * ikki marta yozishning eng qisqa yo'li edi.
 *
 * Shuning uchun so'rov DARHOL javob qaytaradi, ish esa fonda bajariladi.
 * Client jarayonni /imports/jobs/:id orqali kuzatadi.
 *
 * ─── REDIS BO'LMASA ───
 * Sinxron bajariladi, LEKIN qator soni qattiq cheklanadi
 * (IMPORT_SYNC_MAX_ROWS, standart 50). Cheklovsiz sinxron ishlash
 * yuqoridagi ssenariyni qaytarardi.
 */
const createRowsHandler = asyncHandler(async (req, res) => {
  const rows = req.body.rows || [];
  if (!rows.length) throw new ApiError(400, "Yozish uchun qator yuborilmadi");
  if (rows.length > MAX_GRID_ROWS) {
    throw new ApiError(413, `Bir martada ${MAX_GRID_ROWS} qatordan ko'p bo'lmasligi kerak`);
  }

  const queued = isRedisEnabled();

  if (!queued && rows.length > env.IMPORT_SYNC_MAX_ROWS) {
    throw new ApiError(
      400,
      `Navbat (Redis) sozlanmagani uchun bir martada ${env.IMPORT_SYNC_MAX_ROWS} qatorgacha ` +
        `yuborish mumkin. Faylni bo'laklarga bo'ling yoki REDIS_URL ni sozlang`,
      { code: "IMPORT_QUEUE_UNAVAILABLE" },
    );
  }

  // ISH HUJJATI - navbatga qo'yishdan OLDIN. Redis o'chib qolsa ham
  // "queued" yozuvi Mongo'da qoladi va yo'qolgan import ko'rinib turadi
  // (aks holda so'rov jimgina yo'q bo'lardi).
  const job = await ImportJob.create({
    branchId: req.branchId || null,
    importerKey: req.importer.key,
    fileName: req.body.fileName || "",
    user: req.user._id,
    userName: [req.user.firstName, req.user.lastName].filter(Boolean).join(" "),
    mode: "rows",
    status: "queued",
    total: rows.length,
    rows,
    scope: {
      branchId: req.branchId || null,
      allowedBranchIds: req.allowedBranchIds || [],
      canSeeAllBranches: Boolean(req.canSeeAllBranches),
      permissions: req.permissions || [],
    },
  });

  if (queued) {
    try {
      await enqueueImport(job._id);
    } catch (err) {
      // Navbatga qo'shib bo'lmadi - ish "queued" holatida osilib
      // qolmasligi kerak, aks holda foydalanuvchi kutib o'tirardi.
      await ImportJob.findByIdAndUpdate(job._id, {
        $set: {
          status: "failed",
          error: "Navbatga qo'shib bo'lmadi (Redis mavjud emas)",
          finishedAt: new Date(),
          rows: [],
        },
      }).catch(() => null);
      logger.error({ err, jobId: String(job._id) }, "Importni navbatga qo'shib bo'lmadi");
      throw new ApiError(503, "Navbat xizmati javob bermayapti. Birozdan keyin urinib ko'ring");
    }

    return res.status(202).json({
      success: true,
      data: { jobId: String(job._id), status: "queued", total: rows.length },
      message: "Import navbatga qo'yildi",
    });
  }

  // ── SINXRON YO'L (Redis yo'q, kichik fayl) ──
  const result = await runImportJob(job._id);

  return res.json({
    success: true,
    data: {
      jobId: String(job._id),
      status: "completed",
      summary: result?.summary || null,
      rows: result?.rows || [],
    },
  });
});

export default createRowsHandler;
