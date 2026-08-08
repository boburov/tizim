import asyncHandler from "../../../middleware/asyncHandler.js";
import ApiError from "../../../utils/ApiError.js";
import ImportJob from "../../../models/importJob.model.js";
import { hasPermission } from "../../../helpers/permission.helper.js";
import { PERMISSIONS } from "../../../constants/permissions.js";

/**
 * IMPORT JARAYONI (progress). Client shu yo'lni so'rab turadi.
 *
 * `rows` QAYTARILMAYDI - unda ochiq parollar bo'lishi mumkin va ular
 * bu yerda kerak emas (client o'z nusxasini saqlab turibdi).
 */
const jobStatusHandler = asyncHandler(async (req, res) => {
  const job = await ImportJob.findById(req.params.jobId, { rows: 0 }).lean();
  if (!job) throw new ApiError(404, "Import topilmadi");

  // KO'RISH HUQUQI: o'z importini har kim ko'radi, birovnikini faqat
  // moliya/foydalanuvchi boshqaruvi huquqi borlar. Aks holda bir xodim
  // boshqasining import natijalarini (kim qo'shilgani, xatolar) o'qib
  // olardi.
  const isOwnJob = String(job.user) === String(req.user._id);
  if (!isOwnJob && !hasPermission(req.permissions, PERMISSIONS.FINANCE_MANAGE)) {
    throw new ApiError(403, "Ruxsat etilmagan");
  }

  res.json({
    success: true,
    data: {
      jobId: String(job._id),
      importerKey: job.importerKey,
      status: job.status,
      processed: job.processed || 0,
      total: job.total || 0,
      imported: job.imported || 0,
      failed: job.failed || 0,
      duplicate: job.duplicate || 0,
      error: job.error || "",
      results: job.results || [],
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      durationMs: job.durationMs || 0,
    },
  });
});

export default jobStatusHandler;
