import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requireDatasetPermission from "../../middleware/requireDatasetPermission.js";
import validate from "../../middleware/validate.js";
import { downloadSchema } from "./validators/export.validator.js";
import datasetsList from "./handlers/datasets.list.handler.js";
import download from "./handlers/download.handler.js";

const router = Router();

// Mavjud hisobotlar + ularning ustunlari (foydalanuvchi ruxsati bo'yicha).
// Client eksport modalidagi checkbox'larni shundan quradi.
router.get("/datasets", requireAuth, datasetsList);

// XLSX yuklab olish.
//
// NEGA POST (GET emas): tanlangan ustunlar + filtrlar tanada yuboriladi,
// ular URL uzunligi chegarasidan oshib ketishi mumkin. Qo'shimcha foyda:
// POST auditLog.middleware tomonidan AVTOMATIK yoziladi - kim, qachon,
// qaysi hisobotni, qanday filtr bilan yuklab olgani ActivityLog'ga
// tushadi. Alohida audit kodi yozish shart emas.
//
// DIQQAT (tartib): requireAuth BIRINCHI - u filial kontekstini (ALS)
// ochadi. Usiz servislardagi branchFilter() bo'sh filtr qaytarib,
// eksportga barcha filiallar ma'lumoti tushardi.
router.post(
  "/:datasetKey",
  requireAuth,
  requireDatasetPermission(),
  validate(downloadSchema),
  download,
);

export default router;
