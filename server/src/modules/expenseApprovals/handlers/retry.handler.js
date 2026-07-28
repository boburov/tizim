import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/expenseApproval.service.js";

const retry = asyncHandler(async (req, res) => {
  const data = await service.retry(req.params.id, req.permissions);
  res.json({ success: true, data, message: "Qayta tasdiqlash uchun yuborildi" });
});

export default retry;
