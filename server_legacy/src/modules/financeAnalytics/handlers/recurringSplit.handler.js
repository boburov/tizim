import asyncHandler from "../../../middleware/asyncHandler.js";
import * as svc from "../services/expense.service.js";

const handler = asyncHandler(async (req, res) => {
  const data = await svc.getRecurringSplit(req.query);
  res.json({ success: true, data });
});

export default handler;
