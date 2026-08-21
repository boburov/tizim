import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/insight.service.js";

const list = asyncHandler(async (req, res) => {
  const { items, meta } = await service.list(req.query);
  res.json({ success: true, data: items, meta });
});

export default list;
