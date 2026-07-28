import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/expenseApproval.service.js";

const approve = asyncHandler(async (req, res) => {
  const data = await service.approve(req.params.id, { note: req.body?.note }, req.user);
  res.json({ success: true, data, message: "Tasdiqlandi va to'lov amalga oshirildi" });
});

export default approve;
