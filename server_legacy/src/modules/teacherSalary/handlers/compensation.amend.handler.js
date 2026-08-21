import asyncHandler from "../../../middleware/asyncHandler.js";
import * as compensationService from "../services/teacherCompensation.service.js";
import * as approvalService from "../../expenseApprovals/services/expenseApproval.service.js";
import { compensationMetrics } from "../../../helpers/configMetrics.helper.js";

// AMALDAGI stavkani TUZATISH (xato kiritish uchun) - yangi davr ochmaydi.
// Qarang: compensation.set.handler.js - bir xil tasdiq qoidasi.
const amend = asyncHandler(async (req, res) => {
  const { needsApproval } = await approvalService.checkConfigApproval({
    permissions: req.permissions,
    kind: approvalService.APPROVAL_KINDS.TEACHER_COMPENSATION_SET,
    metrics: compensationMetrics(req.body),
  });

  if (needsApproval) {
    const approval = await compensationService.requestSet(
      { ...req.body, op: "amend", compensationId: req.params.id },
      req.user,
    );
    return res.status(202).json({
      success: true,
      data: approval,
      message: "Tasdiqlash uchun yuborildi. Owner tasdiqlagach qo'llanadi.",
    });
  }

  const data = await compensationService.amendCompensation(
    req.params.id,
    req.body,
    req.user,
  );
  res.json({ success: true, data, message: "Maosh stavkasi tuzatildi" });
});

export default amend;
