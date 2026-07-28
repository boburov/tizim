import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/expenseApproval.service.js";

const pendingCount = asyncHandler(async (req, res) => {
  const count = await service.pendingCount();
  res.json({ success: true, data: { count } });
});

export default pendingCount;
