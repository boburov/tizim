import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requirePermission from "../../middleware/requirePermission.js";
import validate from "../../middleware/validate.js";
import { PERMISSIONS } from "../../constants/permissions.js";

import {
  refundSchema, transferSchema, ownerCapitalSchema,
  budgetCreateSchema, budgetUpdateSchema, budgetIdSchema, budgetListSchema,
} from "./validators/financeOps.validator.js";
import refund from "./handlers/refund.handler.js";
import transfer from "./handlers/transfer.handler.js";
import ownerCapital from "./handlers/ownerCapital.handler.js";
import * as budget from "./handlers/budget.handler.js";

/**
 * MOLIYAVIY AMALLAR — yozish endpoint'lari.
 *
 * STEP 5.1 da yaratilgan ruxsatlar shu yerda ISHGA TUSHADI: ilgari ular
 * hech narsani qo'riqlamasdi, chunki bu amallarning HTTP yuzasi yo'q edi.
 *
 * ── NEGA `finance-analytics` GA QO'SHILMADI ──
 * U ATAYLAB faqat o'qish moduli. Yozishni o'sha yerga qo'shish "o'qish
 * qatlami" chegarasini yemirardi va vaqt o'tib u yana ikkinchi
 * buxgalteriya nuqtasiga aylanardi.
 */
const router = Router();

router.post(
  "/refunds",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_MANAGE_REFUNDS),
  validate(refundSchema),
  refund,
);

router.post(
  "/transfers",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_MANAGE_TRANSFERS),
  validate(transferSchema),
  transfer,
);

// EGASINING PULI — ALOHIDA ruxsat.
//
// Ilgari bu `finance.manage_accounts` bilan qo'riqlanardi va bu juda
// keng edi: hisob ochish huquqi bor xodim markazdan pul yechib olish
// huquqini ham olardi. Endi kalit alohida va `manage_accounts` uni
// QAMRAMAYDI.
router.post(
  "/owner-capital",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_MANAGE_OWNER_CAPITAL),
  validate(ownerCapitalSchema),
  ownerCapital,
);

// ══════════════════════════════════════════════════════════════════
// BYUDJET — REJA MA'LUMOTI
//
// ── JURNALGA YOZILMAYDI ──
// Byudjet niyat, pul harakati emas. Shuning uchun bu marshrutlar
// `financialTransaction.service.js` ni umuman chaqirmaydi.
//
// ── KO'RISH va BOSHQARISH AJRATILGAN ──
// Ro'yxat/tafsilot `finance.read` bilan ochiladi (byudjet/fakt
// taqqoslash umumiy manzaraning qismi), o'zgartirish esa
// `finance.manage_budgets` talab qiladi: byudjetdan oshib ketganini
// ko'rgan odam rejani ko'tarib qo'ymasligi kerak.
// ══════════════════════════════════════════════════════════════════
router.get(
  "/budgets",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_READ),
  validate(budgetListSchema),
  budget.list,
);
router.get(
  "/budgets/:id",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_READ),
  validate(budgetIdSchema),
  budget.getOne,
);
router.post(
  "/budgets",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_MANAGE_BUDGETS),
  validate(budgetCreateSchema),
  budget.create,
);
router.patch(
  "/budgets/:id",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_MANAGE_BUDGETS),
  validate(budgetUpdateSchema),
  budget.update,
);
router.delete(
  "/budgets/:id",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_MANAGE_BUDGETS),
  validate(budgetIdSchema),
  budget.remove,
);

export default router;
