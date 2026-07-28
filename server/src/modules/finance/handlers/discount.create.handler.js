import asyncHandler from "../../../middleware/asyncHandler.js";
import * as discountService from "../services/discount.service.js";
import * as approvalService from "../../expenseApprovals/services/expenseApproval.service.js";

// CHEGIRMA TASDIG'I: approvals.decide_config ruxsati yo'q bo'lsa (odatda
// filial direktori), chegirma DARHOL yozilmaydi - owner tasdig'iga yuboriladi.
// 202 = "qabul qilindi, lekin hali bajarilmadi".
const create = asyncHandler(async (req, res) => {
  const { needsApproval } = approvalService.checkConfigApproval({
    permissions: req.permissions,
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
