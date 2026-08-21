import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/branchMetrics.service.js";

const utilization = asyncHandler(async (_req, res) => {
  const data = await service.utilization();
  res.json({ success: true, data });
});

export default utilization;
