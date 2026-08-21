import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/branchMetrics.service.js";

const churn = asyncHandler(async (req, res) => {
  const data = await service.churn({
    from: req.query.from || null,
    to: req.query.to || null,
  });
  res.json({ success: true, data });
});

export default churn;
