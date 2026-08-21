import asyncHandler from "../../../middleware/asyncHandler.js";
import * as discountService from "../services/discount.service.js";
import * as approvalService from "../../expenseApprovals/services/expenseApproval.service.js";
import { discountMetrics } from "../../../helpers/configMetrics.helper.js";

// CHEGIRMA TASDIG'I: filialning delegatsiya matritsasi hal qiladi
// (Branch.delegation.discount_set). `threshold` rejimida chegirma owner
// qo'ygan chegaradan oshmasa darhol yoziladi, oshsa - tasdiqqa yuboriladi.
// 202 = "qabul qilindi, lekin hali bajarilmadi".
const create = asyncHandler(async (req, res) => {
  const { needsApproval } = await approvalService.checkConfigApproval({
    permissions: req.permissions,
    kind: approvalService.APPROVAL_KINDS.DISCOUNT_SET,
    metrics: discountMetrics(req.body),
  });

  if (needsApproval) {
    const approval = await discountService.requestDiscount(
      { op: "create", body: req.body },
      req.user,
    );
    return res.status(202).json({
      success: true,
      data: approval,
      message: "Tasdiqlash uchun yuborildi. Owner tasdiqlagach qo'llanadi.",
    });
  }

  const data = await discountService.create(req.body, req.user);
  res.status(201).json({ success: true, data, message: "Chegirma qo'shildi" });
});

export default create;
