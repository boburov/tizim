import asyncHandler from "../../../middleware/asyncHandler.js";
import * as storageService from "../services/storage.service.js";

const usage = asyncHandler(async (_req, res) => {
  const data = await storageService.getUsage();
  res.json({ success: true, data });
});

export default usage;
