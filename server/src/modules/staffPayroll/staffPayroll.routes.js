import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requirePermission from "../../middleware/requirePermission.js";
import validate from "../../middleware/validate.js";
import asyncHandler from "../../middleware/asyncHandler.js";
import { PERMISSIONS } from "../../constants/permissions.js";
import { parsePagination, buildMeta } from "../../utils/pagination.js";

import * as payrollService from "./services/staffPayroll.service.js";
import * as compensationService from "./services/staffCompensation.service.js";
import * as adjustmentService from "./services/staffAdjustment.service.js";
import * as ruleService from "./services/kpiRule.service.js";
import * as transactionService from "./services/staffSalaryTransaction.service.js";

import {
  listSchema,
  idParamSchema,
  employeeParamSchema,
  generateSchema,
  recomputeSchema,
  lifecycleSchema,
  compensationSetSchema,
  compensationPatchSchema,
  adjustmentCreateSchema,
  ruleCreateSchema,
  ruleUpdateSchema,
  ruleListSchema,
  assignmentSetSchema,
  transactionCreateSchema,
} from "./validators/staffPayroll.validator.js";

const router = Router();

// Uch daraja ATAYLAB ajratilgan:
//   read   - maoshni ko'rish (hisobotchi)
//   manage - shartnoma va KPI qoidalari ("shartlarni belgilash")
//   pay    - pul chiqishi
// Ko'rish huquqi bergan odam avtomatik ravishda to'lash huquqini OLMAYDI.
const read = [requireAuth, requirePermission(PERMISSIONS.PAYROLL_READ)];
const manage = [requireAuth, requirePermission(PERMISSIONS.PAYROLL_MANAGE)];
const pay = [requireAuth, requirePermission(PERMISSIONS.PAYROLL_PAY)];

// ─── KPI QOIDALARI ───
// "/rules" "/:id" dan OLDIN - aks holda "/:id" uni yutib yuboradi.
router.get(
  "/kpi/triggers",
  ...manage,
  asyncHandler(async (_req, res) => {
    res.json({ success: true, data: ruleService.triggers() });
  }),
);

router.get(
  "/kpi/rules",
  ...manage,
  validate(ruleListSchema),
  asyncHandler(async (req, res) => {
    const data = await ruleService.list({
      enabled:
        req.query.enabled === undefined ? undefined : req.query.enabled === "true",
      trigger: req.query.trigger,
    });
    res.json({ success: true, data });
  }),
);

router.post(
  "/kpi/rules",
  ...manage,
  validate(ruleCreateSchema),
  asyncHandler(async (req, res) => {
    const data = await ruleService.create(req.body, req.user);
    res.status(201).json({ success: true, data, message: "KPI qoidasi qo'shildi" });
  }),
);

router.patch(
  "/kpi/rules/:id",
  ...manage,
  validate(ruleUpdateSchema),
  asyncHandler(async (req, res) => {
    const data = await ruleService.update(req.params.id, req.body, req.user);
    res.json({ success: true, data, message: "KPI qoidasi yangilandi" });
  }),
);

router.delete(
  "/kpi/rules/:id",
  ...manage,
  validate(idParamSchema),
  asyncHandler(async (req, res) => {
    const data = await ruleService.remove(req.params.id, req.user);
    res.json({ success: true, data, message: "KPI qoidasi o'chirildi" });
  }),
);

// ─── BIRIKTIRUVLAR ───
router.get(
  "/kpi/assignments/:employeeId",
  ...manage,
  validate(employeeParamSchema),
  asyncHandler(async (req, res) => {
    const data = await ruleService.listAssignments(req.params.employeeId);
    res.json({ success: true, data });
  }),
);

router.post(
  "/kpi/assignments",
  ...manage,
  validate(assignmentSetSchema),
  asyncHandler(async (req, res) => {
    const data = await ruleService.setAssignment(req.body, req.user);
    res.json({ success: true, data, message: "Biriktiruv saqlandi" });
  }),
);

router.delete(
  "/kpi/assignments/:id",
  ...manage,
  validate(idParamSchema),
  asyncHandler(async (req, res) => {
    const data = await ruleService.removeAssignment(req.params.id, req.user);
    res.json({ success: true, data, message: "Biriktiruv o'chirildi" });
  }),
);

// ─── SHARTNOMALAR ───
router.get(
  "/compensations/by-employee/:employeeId",
  ...read,
  validate(employeeParamSchema),
  asyncHandler(async (req, res) => {
    const data = await compensationService.listByEmployee(req.params.employeeId);
    res.json({ success: true, data });
  }),
);

router.get(
  "/compensations/missing",
  ...manage,
  asyncHandler(async (_req, res) => {
    const data = await compensationService.employeesWithoutCompensation();
    res.json({ success: true, data });
  }),
);

router.post(
  "/compensations",
  ...manage,
  validate(compensationSetSchema),
  asyncHandler(async (req, res) => {
    const data = await compensationService.setCompensation(req.body, req.user);
    res.status(201).json({ success: true, data, message: "Maosh shartnomasi saqlandi" });
  }),
);

router.patch(
  "/compensations/:id",
  ...manage,
  validate(compensationPatchSchema),
  asyncHandler(async (req, res) => {
    const data = await compensationService.amendCompensation(
      req.params.id,
      req.body,
      req.user,
    );
    res.json({ success: true, data, message: "Shartnoma tuzatildi" });
  }),
);

router.delete(
  "/compensations/:id",
  ...manage,
  validate(idParamSchema),
  asyncHandler(async (req, res) => {
    const data = await compensationService.removeCompensation(req.params.id, req.user);
    res.json({ success: true, data, message: "Shartnoma o'chirildi" });
  }),
);

// ─── BONUS / JARIMA ───
router.post(
  "/adjustments",
  ...manage,
  validate(adjustmentCreateSchema),
  asyncHandler(async (req, res) => {
    const data = await adjustmentService.create(req.body, req.user);
    res.status(201).json({
      success: true,
      data,
      message: req.body.kind === "penalty" ? "Jarima qo'shildi" : "Bonus qo'shildi",
    });
  }),
);

router.delete(
  "/adjustments/:id",
  ...manage,
  validate(idParamSchema),
  asyncHandler(async (req, res) => {
    const data = await adjustmentService.remove(req.params.id, req.user);
    res.json({ success: true, data, message: "Yozuv o'chirildi" });
  }),
);

// ─── TO'LOVLAR ───
router.post(
  "/transactions",
  ...pay,
  validate(transactionCreateSchema),
  asyncHandler(async (req, res) => {
    // DIQQAT: permissions `req` da, `req.user` da EMAS - limitdan ozod
    // qilish (FINANCE_APPROVE) shu ro'yxatga qarab hal qilinadi.
    const result = await transactionService.create(req.body, {
      _id: req.user._id,
      permissions: req.permissions,
    });
    if (result?.pendingApproval) {
      return res.status(202).json({
        success: true,
        pendingApproval: true,
        data: result.approval,
        message: "Tasdiqlash uchun yuborildi. Owner tasdiqlagach to'lov yoziladi.",
      });
    }
    res.status(201).json({ success: true, data: result, message: "To'lov yozildi" });
  }),
);

router.delete(
  "/transactions/:id",
  ...pay,
  validate(idParamSchema),
  asyncHandler(async (req, res) => {
    const data = await transactionService.remove(req.params.id, req.user);
    res.json({ success: true, data, message: "To'lov bekor qilindi" });
  }),
);

// ─── MAOSH QATORLARI ───
router.post(
  "/generate",
  ...manage,
  validate(generateSchema),
  asyncHandler(async (req, res) => {
    const data = await payrollService.generateMonth(req.body.year, req.body.month);
    res.json({ success: true, data, message: "Maoshlar hisoblandi" });
  }),
);

router.get(
  "/by-employee/:employeeId",
  ...read,
  validate(employeeParamSchema),
  asyncHandler(async (req, res) => {
    const data = await payrollService.historyByEmployee(req.params.employeeId);
    res.json({ success: true, data });
  }),
);

router.get(
  "/",
  ...read,
  validate(listSchema),
  asyncHandler(async (req, res) => {
    const { page, limit } = parsePagination(req.query);
    const { items, total } = await payrollService.list({
      ...req.query,
      page,
      limit,
    });
    res.json({ success: true, data: items, meta: buildMeta({ page, limit, total }) });
  }),
);

router.post(
  "/:id/recompute",
  ...manage,
  validate(recomputeSchema),
  asyncHandler(async (req, res) => {
    const current = await payrollService.getById(req.params.id);
    const data = await payrollService.computePayroll(
      current.employee._id,
      current.year,
      current.month,
      { force: true },
    );
    res.json({ success: true, data, message: "Qayta hisoblandi" });
  }),
);

router.patch(
  "/:id/lifecycle",
  ...manage,
  validate(lifecycleSchema),
  asyncHandler(async (req, res) => {
    const data = await payrollService.setLifecycle(
      req.params.id,
      req.body.lifecycle,
      req.user,
    );
    res.json({
      success: true,
      data,
      message: req.body.lifecycle === "finalized" ? "Oy yopildi" : "Oy qayta ochildi",
    });
  }),
);

router.get(
  "/:id",
  ...read,
  validate(idParamSchema),
  asyncHandler(async (req, res) => {
    const [payroll, transactions] = await Promise.all([
      payrollService.getById(req.params.id),
      transactionService.listByPayroll(req.params.id),
    ]);
    res.json({ success: true, data: { ...payroll, transactions } });
  }),
);

export default router;
