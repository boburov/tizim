import asyncHandler from "../../../middleware/asyncHandler.js";
import { upsertConfig } from "../services/aiConfig.service.js";

const updateConfig = asyncHandler(async (req, res) => {
  const { branchId = null, ...patch } = req.body;
  const data = await upsertConfig(branchId, patch, req.user?._id);
  res.json({ success: true, data, message: "AI sozlamalari saqlandi" });
});

export default updateConfig;
