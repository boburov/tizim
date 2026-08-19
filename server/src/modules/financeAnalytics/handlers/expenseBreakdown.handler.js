import asyncHandler from "../../../middleware/asyncHandler.js";
import * as svc from "../services/expense.service.js";

const handler = asyncHandler(async (req, res) => {
  const data = await svc.getExpenseBreakdown(req.query);
  res.json({ success: true, data });
});

export default handler;
