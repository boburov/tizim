import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/expenseApproval.service.js";

const cancel = asyncHandler(async (req, res) => {
  const data = await service.cancel(req.params.id, req.user);
  res.json({ success: true, data, message: "So'rov bekor qilindi" });
});

export default cancel;
