import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/expenseApproval.service.js";
import { APPROVAL_CATEGORIES } from "../../../models/approval.model.js";

const approve = asyncHandler(async (req, res) => {
  const data = await service.approve(
    req.params.id,
    { note: req.body?.note },
    req.user,
    req.permissions,
  );
  const message =
    data?.category === APPROVAL_CATEGORIES.CONFIGURATION
      ? "Tasdiqlandi va o'zgarish qo'llandi"
      : "Tasdiqlandi va to'lov amalga oshirildi";
  res.json({ success: true, data, message });
});

export default approve;
