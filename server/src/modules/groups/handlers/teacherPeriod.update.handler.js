import asyncHandler from "../../../middleware/asyncHandler.js";
import * as teacherGroupPeriodService from "../services/teacherGroupPeriod.service.js";
import * as approvalService from "../../expenseApprovals/services/expenseApproval.service.js";
import { salaryTermsMetrics } from "../../../helpers/configMetrics.helper.js";

// Qarang: teacherPeriod.create.handler.js - bir xil tasdiq qoidasi.
const update = asyncHandler(async (req, res) => {
  const { periodId } = req.params;
  const { needsApproval } = await approvalService.checkConfigApproval({
    permissions: req.permissions,
    kind: approvalService.APPROVAL_KINDS.SALARY_TERMS,
    metrics: salaryTermsMetrics(req.body),
  });

  if (needsApproval) {
    const approval = await teacherGroupPeriodService.requestSalaryTerms(
      { op: "update", periodId, body: req.body },
      req.user,
    );
    return res.status(202).json({
      success: true,
      data: approval,
      message: "Tasdiqlash uchun yuborildi. Owner tasdiqlagach qo'llanadi.",
    });
  }

  const data = await teacherGroupPeriodService.update(periodId, req.body, req.user);
  res.json({ success: true, data, message: "Dars berish davri yangilandi" });
});

export default update;
