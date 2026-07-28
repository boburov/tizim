import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/branches.service.js";

const stats = asyncHandler(async (req, res) => {
  const data = await service.stats(req.params.id);
  res.json({ success: true, data });
});

export default stats;
