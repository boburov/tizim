import asyncHandler from "../../../middleware/asyncHandler.js";
import * as svc from "../services/profitability.service.js";

const handler = asyncHandler(async (req, res) => {
  const data = await svc.getRoomRevenue(req.query);
  res.json({ success: true, data });
});

export default handler;
