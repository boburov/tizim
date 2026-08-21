import asyncHandler from "../../../middleware/asyncHandler.js";
import * as groupFeeService from "../services/groupFee.service.js";
import * as approvalService from "../../expenseApprovals/services/expenseApproval.service.js";
import { groupFeeMetrics } from "../../../helpers/configMetrics.helper.js";

// GURUH NARXI TASDIG'I: filialning delegatsiya matritsasi hal qiladi
// (Branch.delegation.group_fee_set). Chegirma bilan bir xil qoida:
// ikkalasi ham tushumni kamaytiradi.
//
// DIQQAT - CHEGARA YO'NALISHI TESKARI: bu yerda xavf katta raqam emas,
// KICHIK raqam (narxni tushirib yuborish). Shuning uchun chegara `minAmount`
// - "shu summadan pastga tushirsang, mendan so'ra".
const upsert = asyncHandler(async (req, res) => {
  const { needsApproval } = await approvalService.checkConfigApproval({
    permissions: req.permissions,
    kind: approvalService.APPROVAL_KINDS.GROUP_FEE_SET,
    metrics: groupFeeMetrics(req.body),
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
