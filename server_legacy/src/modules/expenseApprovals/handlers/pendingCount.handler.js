import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/expenseApproval.service.js";

const pendingCount = asyncHandler(async (req, res) => {
  const count = await service.pendingCount({
    permissions: req.permissions,
    currentUser: req.user,
  });
  res.json({ success: true, data: { count } });
});

export default pendingCount;
