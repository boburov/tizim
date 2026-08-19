import asyncHandler from "../../../middleware/asyncHandler.js";
import * as svc from "../services/alerts.service.js";

const handler = asyncHandler(async (req, res) => {
  const data = await svc.getFinancialAlerts(req.query);
  res.json({ success: true, data });
});

export default handler;
