import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/insight.service.js";

const actionCenter = asyncHandler(async (req, res) => {
  const data = await service.actionCenter(req.query);
  res.json({ success: true, data });
});

export default actionCenter;
