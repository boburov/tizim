import asyncHandler from "../../../middleware/asyncHandler.js";
import * as discountService from "../services/discount.service.js";
import * as approvalService from "../../expenseApprovals/services/expenseApproval.service.js";
import { discountMetrics } from "../../../helpers/configMetrics.helper.js";

// Qarang: discount.create.handler.js - bir xil tasdiq qoidasi.
//
// TAHRIRLASHDA `type`/`value` body'da bo'lmasligi mumkin (masalan faqat
// izoh o'zgartirilsa). U holda o'lchov bo'sh qaytadi va `threshold`
// rejimida o'zgarish baribir tasdiqqa tushadi - ataylab fail-closed
// (qarang: withinLimit izohi).
const update = asyncHandler(async (req, res) => {
  const { needsApproval } = await approvalService.checkConfigApproval({
    permissions: req.permissions,
    kind: approvalService.APPROVAL_KINDS.DISCOUNT_SET,
    metrics: discountMetrics(req.body),
  });

  if (needsApproval) {
    const approval = await discountService.requestDiscount(
      { op: "update", discountId: req.params.id, body: req.body },
      req.user,
    );
    return res.status(202).json({
      success: true,
      data: approval,
      message: "Tasdiqlash uchun yuborildi. Owner tasdiqlagach qo'llanadi.",
    });
  }

  const data = await discountService.update(req.params.id, req.body);
  res.json({ success: true, data, message: "Chegirma yangilandi" });
});

export default update;
