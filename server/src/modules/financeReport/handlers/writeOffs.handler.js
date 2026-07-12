import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/financeReport.service.js";

const writeOffs = asyncHandler(async (req, res) => {
  const data = await service.getWriteOffs(req.query);
  res.json({ success: true, data });
});

export default writeOffs;
