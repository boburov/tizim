import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/users.service.js";
import * as approvalService from "../../expenseApprovals/services/expenseApproval.service.js";

// ISHGA OLISH TASDIG'I: approvals.decide_config ruxsati yo'q bo'lsa (odatda
// filial direktori), User DARHOL yaratilmaydi - owner tasdig'iga yuboriladi.
// 202 = "qabul qilindi, lekin hali bajarilmadi".
const createStaff = asyncHandler(async (req, res) => {
  const { needsApproval } = approvalService.checkConfigApproval({
    permissions: req.permissions,
  });

  if (needsApproval) {
    const approval = await service.requestHire(req.body, { _id: req.user._id });
    return res.status(202).json({
      success: true,
      data: approval,
      message: "Tasdiqlash uchun yuborildi. Owner tasdiqlagach xodim yaratiladi.",
    });
  }

  // permissions + filial ko'lami req'da (requireAuth), req.user'da emas.
  const data = await service.createStaff(req.body, {
    _id: req.user._id,
    permissions: req.permissions,
    allowedBranchIds: req.allowedBranchIds,
    canSeeAllBranches: req.canSeeAllBranches,
  });
  res.status(201).json({ success: true, data, message: "Xodim qo'shildi" });
});

export default createStaff;
