import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requirePermission from "../../middleware/requirePermission.js";
import validate from "../../middleware/validate.js";
import { PERMISSIONS } from "../../constants/permissions.js";

import {
  pnlSchema,
  rangeSchema,
  transferPreviewSchema,
  transferSchema,
} from "./validators/analytics.validator.js";

import pnl from "./handlers/pnl.handler.js";
import elimination from "./handlers/elimination.handler.js";
import utilization from "./handlers/utilization.handler.js";
import churn from "./handlers/churn.handler.js";
import normalized from "./handlers/normalized.handler.js";
import transferPreview from "./handlers/transferPreview.handler.js";
import transfer from "./handlers/transfer.handler.js";
import alerts from "./handlers/alerts.handler.js";

const router = Router();

// FILIAL TAHLILI - P&L, normalizatsiya, bandlik, churn, ko'chirish.
//
// KO'LAM: barcha o'qish endpoint'lari branchFilter() ostida ishlaydi -
// filial direktori faqat o'z raqamlarini ko'radi. Owner esa
// "barcha filiallar" rejimida hammasini yonma-yon oladi.
//
// ISTISNO: `/elimination` - u ATAYLAB butun tarmoq bo'yicha va
// owner-only. Ichki aylanma faqat konsolidatsiyada ma'noga ega.

router.get(
  "/pnl",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_READ),
  validate(pnlSchema),
  pnl,
);

router.get(
  "/elimination",
  requireAuth,
  requirePermission(PERMISSIONS.SYSTEM_ADMIN_ACCESS),
  validate(rangeSchema),
  elimination,
);

router.get(
  "/utilization",
  requireAuth,
  requirePermission(PERMISSIONS.BRANCHES_READ),
  utilization,
);

router.get(
  "/churn",
  requireAuth,
  requirePermission(PERMISSIONS.BRANCHES_READ),
  validate(rangeSchema),
  churn,
);

router.get(
  "/normalized",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_READ),
  validate(rangeSchema),
  normalized,
);

// ANOMALIYALAR. `branches.read` yetarli - filial rahbari o'z
// filialidagi muammolarni ko'rishi kerak. Tarmoq darajasidagi
// alertlar (jurnal nomuvozanati) faqat owner ko'lamida chiqadi.
router.get(
  "/alerts",
  requireAuth,
  requirePermission(PERMISSIONS.BRANCHES_READ),
  alerts,
);

// ── O'QUVCHINI KO'CHIRISH ──
//
// `students.update` YETARLI EMAS: ko'chirish IKKI filialga tegadi va
// pul harakatlanadi. Shuning uchun moliyaviy ruxsat ham talab qilinadi.
// Servis qatlamida ikkala filial ham chaqiruvchining ko'lamida ekani
// tekshiriladi (studentTransfer.service.js).
router.get(
  "/students/:studentId/transfer-preview",
  requireAuth,
  requirePermission(PERMISSIONS.STUDENTS_UPDATE),
  validate(transferPreviewSchema),
  transferPreview,
);
router.post(
  "/students/:studentId/transfer",
  requireAuth,
  requirePermission(PERMISSIONS.STUDENTS_UPDATE),
  requirePermission(PERMISSIONS.FINANCE_MANAGE),
  validate(transferSchema),
  transfer,
);

export default router;
