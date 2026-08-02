import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requireImporterPermission from "../../middleware/requireImporterPermission.js";
import uploadSheet from "../../middleware/uploadSheet.js";
import validate from "../../middleware/validate.js";
import {
  importerKeySchema,
  errorReportSchema,
  historySchema,
} from "./validators/imports.validator.js";
import importersList from "./handlers/importers.list.handler.js";
import historyList from "./handlers/history.list.handler.js";
import templateHandler from "./handlers/template.handler.js";
import previewHandler from "./handlers/preview.handler.js";
import commitHandler from "./handlers/commit.handler.js";
import errorReportHandler from "./handlers/errorReport.handler.js";

const router = Router();

// Mavjud import turlari (foydalanuvchi ruxsati bo'yicha).
router.get("/importers", requireAuth, importersList);

// Import tarixi. "/:importerKey" naqshidan OLDIN turishi shart, aks holda
// "history" import kaliti deb qabul qilinardi.
router.get("/history", requireAuth, validate(historySchema), historyList);

// Bo'sh shablonni yuklab olish.
router.get(
  "/:importerKey/template",
  requireAuth,
  requireImporterPermission(),
  validate(importerKeySchema),
  templateHandler,
);

// KO'RIB CHIQISH - hech narsa yozilmaydi.
router.post(
  "/:importerKey/preview",
  requireAuth,
  requireImporterPermission(),
  validate(importerKeySchema),
  uploadSheet,
  previewHandler,
);

// TASDIQLASH - ma'lumot yoziladi.
//
// DIQQAT (tartib): requireAuth BIRINCHI - u filial kontekstini (ALS)
// ochadi. uploadSheet ruxsat tekshiruvidan KEYIN turadi: ruxsati yo'q
// foydalanuvchining 10 MB fayli umuman o'qilmasin.
router.post(
  "/:importerKey/commit",
  requireAuth,
  requireImporterPermission(),
  validate(importerKeySchema),
  uploadSheet,
  commitHandler,
);

// O'tmagan qatorlarni Excel qilib qaytaradi (tuzatib qayta yuklash uchun).
router.post(
  "/:importerKey/error-report",
  requireAuth,
  requireImporterPermission(),
  validate(errorReportSchema),
  errorReportHandler,
);

export default router;
