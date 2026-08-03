import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/assignments.service.js";

const preview = asyncHandler(async (req, res) => {
  const data = await service.preview(req.body, req.user);
  res.json({ success: true, data });
});

export default preview;
