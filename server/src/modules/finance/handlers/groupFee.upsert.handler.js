import asyncHandler from "../../../middleware/asyncHandler.js";
import * as groupFeeService from "../services/groupFee.service.js";
import * as approvalService from "../../expenseApprovals/services/expenseApproval.service.js";

// GURUH NARXI TASDIG'I: approvals.decide_config ruxsati yo'q bo'lsa (odatda
// filial direktori), narx DARHOL o'zgarmaydi - owner tasdig'iga yuboriladi.
// Chegirma bilan bir xil qoida: ikkalasi ham tushumni kamaytiradi.
const upsert = asyncHandler(async (req, res) => {
  const { needsApproval } = approvalService.checkConfigApproval({
    permissions: req.permissions,
  });

  if (needsApproval) {
    const approval = await groupFeeService.requestGroupFee(req.body, req.user);
    return res.status(202).json({
      success: true,
      data: approval,
      message: "Tasdiqlash uchun yuborildi. Owner tasdiqlagach qo'llanadi.",
    });
  }

  const data = await groupFeeService.upsert(req.body, req.user);
  res.json({ success: true, data, message: "Guruh to'lovi saqlandi" });
});

export default upsert;
