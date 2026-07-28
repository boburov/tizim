import asyncHandler from "../../../middleware/asyncHandler.js";
import * as discountService from "../services/discount.service.js";
import * as approvalService from "../../expenseApprovals/services/expenseApproval.service.js";

// Qarang: discount.create.handler.js - bir xil tasdiq qoidasi.
const update = asyncHandler(async (req, res) => {
  const { needsApproval } = approvalService.checkConfigApproval({
    permissions: req.permissions,
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
