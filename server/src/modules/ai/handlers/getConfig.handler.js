import asyncHandler from "../../../middleware/asyncHandler.js";
import { resolveConfig, CODE_DEFAULTS } from "../services/aiConfig.service.js";
import { getActiveBranchId } from "../../../helpers/branchContext.helper.js";

const getConfig = asyncHandler(async (req, res) => {
  const branchId = req.query.branchId || getActiveBranchId();
  const data = await resolveConfig(branchId);
  // defaults ham qaytariladi - UI "standartga qaytarish" tugmasi uchun.
  res.json({ success: true, data: { config: data, defaults: CODE_DEFAULTS } });
});

export default getConfig;
