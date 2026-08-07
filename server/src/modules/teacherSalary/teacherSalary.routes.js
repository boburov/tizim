import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requirePermission from "../../middleware/requirePermission.js";
import validate from "../../middleware/validate.js";
import { PERMISSIONS } from "../../constants/permissions.js";

import {
  listSchema as salaryListSchema,
  idParamSchema as salaryIdSchema,
  obligationsSchema,
  teacherIdParamSchema as salaryTeacherIdSchema,
} from "./validators/teacherSalary.validator.js";
import {
  createSchema as transactionCreateSchema,
  idParamSchema as transactionIdSchema,
} from "./validators/salaryTransaction.validator.js";

import {
  setSchema as compensationSetSchema,
  amendSchema as compensationAmendSchema,
  idParamSchema as compensationIdSchema,
  teacherIdParamSchema as compensationTeacherIdSchema,
  adjustmentCreateSchema,
  adjustmentSettleSchema,
} from "./validators/teacherCompensation.validator.js";

import compensationList from "./handlers/compensation.list.handler.js";
import compensationSet from "./handlers/compensation.set.handler.js";
import compensationAmend from "./handlers/compensation.amend.handler.js";
import compensationRemove from "./handlers/compensation.remove.handler.js";
import adjustmentCreate from "./handlers/adjustment.create.handler.js";
import adjustmentSettle from "./handlers/adjustment.settle.handler.js";
import adjustmentRemove from "./handlers/adjustment.remove.handler.js";
import salaryList from "./handlers/salary.list.handler.js";
import salaryGetById from "./handlers/salary.getById.handler.js";
import salaryHistoryByTeacher from "./handlers/salary.historyByTeacher.handler.js";
import salaryMyFinance from "./handlers/salary.myFinance.handler.js";
import obligations from "./handlers/obligations.handler.js";
import transactionCreate from "./handlers/transaction.create.handler.js";
import transactionRemove from "./handlers/transaction.remove.handler.js";

const router = Router();

// ── O'qituvchining o'z moliyasi (teacher panel) ──
// Faqat requireAuth: o'qituvchi faqat O'Z ma'lumotini ko'radi (handler ichida
// teacher rolligi tekshiriladi, ID doimo req.user._id). "/salaries/:id" dan
// OLDIN turishi shart - aks holda "me" param sifatida ushlanib qolardi.
router.get("/me/finance", requireAuth, salaryMyFinance);

// ── O'qituvchi maoshlari (stavka/ish-oynasi davrlardan derived - read-only) ──
router.get(
  "/salaries",
  requireAuth,
  requirePermission(PERMISSIONS.SALARY_READ),
  validate(salaryListSchema),
  salaryList,
);
router.get(
  "/salaries/by-teacher/:teacherId",
  requireAuth,
  requirePermission(PERMISSIONS.SALARY_READ),
  validate(salaryTeacherIdSchema),
  salaryHistoryByTeacher,
);
router.get(
  "/salaries/:id",
  requireAuth,
  requirePermission(PERMISSIONS.SALARY_READ),
  validate(salaryIdSchema),
  salaryGetById,
);
router.get(
  "/obligations",
  requireAuth,
  requirePermission(PERMISSIONS.SALARY_READ),
  validate(obligationsSchema),
  obligations,
);

// ── O'QITUVCHI STANDART MAOSH STAVKASI (markaz darajasida) ──
// Bu yerda o'qituvchi profilida/ishga olishda BIR MARTA belgilanadi va barcha
// guruhlariga meros bo'ladi. Guruhga xos kelishuv bo'lsa - guruh davri
// (teacher-periods) uni bekor qiladi.
//
// RUXSAT: SALARY_PAY ATAYLAB ishlatilmadi - "maosh to'lash" va "maosh
// STAVKASINI belgilash" boshqa-boshqa vakolat (kassir to'laydi, stavkani
// rahbariyat belgilaydi). approvals.decide_config yo'q bo'lsa tasdiqqa ketadi.
router.get(
  "/compensations/by-teacher/:teacherId",
  requireAuth,
  requirePermission(PERMISSIONS.SALARY_READ),
  validate(compensationTeacherIdSchema),
  compensationList,
);
router.post(
  "/compensations",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_MANAGE),
  validate(compensationSetSchema),
  compensationSet,
);
router.patch(
  "/compensations/:id",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_MANAGE),
  validate(compensationAmendSchema),
  compensationAmend,
);
router.delete(
  "/compensations/:id",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_MANAGE),
  validate(compensationIdSchema),
  compensationRemove,
);

// ── KPI MUKOFOTI / JARIMA (alohida maosh qatori) ──
router.post(
  "/adjustments",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_MANAGE),
  validate(adjustmentCreateSchema),
  adjustmentCreate,
);
// HISOB-KITOBNI YOPISH (ishdan bo'shatish). Qolgan qoldiqni bitta jarima
// qatori bilan nolga tushiradi. FINANCE_MANAGE - bu stavka emas, chiqimni
// bekor qilish qarori (jarima bilan bir xil vakolat).
router.post(
  "/adjustments/settle/:teacherId",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_MANAGE),
  validate(adjustmentSettleSchema),
  adjustmentSettle,
);
router.delete(
  "/adjustments/:id",
  requireAuth,
  requirePermission(PERMISSIONS.FINANCE_MANAGE),
  validate(compensationIdSchema),
  adjustmentRemove,
);

// ── Maosh to'lovlari (chiqim) ──
router.post(
  "/transactions",
  requireAuth,
  requirePermission(PERMISSIONS.SALARY_PAY),
  validate(transactionCreateSchema),
  transactionCreate,
);
router.delete(
  "/transactions/:id",
  requireAuth,
  requirePermission(PERMISSIONS.SALARY_PAY),
  validate(transactionIdSchema),
  transactionRemove,
);

export default router;
