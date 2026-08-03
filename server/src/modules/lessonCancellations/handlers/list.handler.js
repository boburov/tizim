import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/lessonCancellation.service.js";

const list = asyncHandler(async (req, res) => {
  const data = await service.list(req.query);
  res.json({ success: true, data });
});

export default list;
