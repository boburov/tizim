import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requireImporterPermission from "../../middleware/requireImporterPermission.js";
import uploadSheet from "../../middleware/uploadSheet.js";
import validate from "../../middleware/validate.js";
import {
  importerKeySchema,
  errorReportSchema,
  historySchema,
  validateRowsSchema,
  createRowsSchema,
  jobIdSchema,
} from "./validators/imports.validator.js";
import importersList from "./handlers/importers.list.handler.js";
import historyList from "./handlers/history.list.handler.js";
import templateHandler from "./handlers/template.handler.js";
import optionsHandler from "./handlers/options.handler.js";
import previewHandler from "./handlers/preview.handler.js";
import commitHandler from "./handlers/commit.handler.js";
import errorReportHandler from "./handlers/errorReport.handler.js";
import draftHandler from "./handlers/draft.handler.js";
import validateRowsHandler from "./handlers/validateRows.handler.js";
import createRowsHandler from "./handlers/createRows.handler.js";
import jobStatusHandler from "./handlers/jobStatus.handler.js";

const router = Router();

// Mavjud import turlari (foydalanuvchi ruxsati bo'yicha).
router.get("/importers", requireAuth, importersList);

// Import tarixi. "/:importerKey" naqshidan OLDIN turishi shart, aks holda
// "history" import kaliti deb qabul qilinardi.
router.get("/history", requireAuth, validate(historySchema), historyList);

// Fondagi importning holati (progress). "/:importerKey" dan OLDIN -
// yuqoridagi bilan bir xil sabab.
router.get("/jobs/:jobId", requireAuth, validate(jobIdSchema), jobStatusHandler);

// Bo'sh shablonni yuklab olish.
router.get(
  "/:importerKey/template",
  requireAuth,
  requireImporterPermission(),
  validate(importerKeySchema),
  templateHandler,
);

// Tanlov (select) ustunlari uchun variantlar: guruhlar, filiallar, rollar.
router.get(
  "/:importerKey/options",
  requireAuth,
  requireImporterPermission(),
  validate(importerKeySchema),
  optionsHandler,
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

// ─────────────── JADVAL OQIMI (draft → tahrirlash → yaratish) ───────────────
//
// Eski preview/commit oqimidan farqi: TASDIQ BOSQICHIDA FAYL EMAS,
// foydalanuvchi TAHRIRLAGAN QATORLAR yuboriladi. Server ularni yozishdan
// oldin to'liq qayta tekshiradi - client yuborgan holatga ishonilmaydi.

// 1) Fayldan tahrirlanadigan qoralama (autofill + login/parol).
router.post(
  "/:importerKey/draft",
  requireAuth,
  requireImporterPermission(),
  validate(importerKeySchema),
  uploadSheet,
  draftHandler,
);

// 2) Tahrirlangan qatorlarni tekshirish (jonli). Hech narsa yozilmaydi.
router.post(
  "/:importerKey/validate-rows",
  requireAuth,
  requireImporterPermission(),
  validate(validateRowsSchema),
  validateRowsHandler,
);

// 3) YARATISH. Redis bo'lsa navbatga qo'yiladi (202 + jobId), aks holda
//    sinxron bajariladi va qator soni cheklanadi.
router.post(
  "/:importerKey/create",
  requireAuth,
  requireImporterPermission(),
  validate(createRowsSchema),
  createRowsHandler,
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
