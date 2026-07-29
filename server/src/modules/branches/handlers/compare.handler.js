import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/branches.service.js";

// Barcha ko'rinadigan filiallarni yonma-yon taqqoslash.
// Ko'lam `list` bilan bir xil: allowedBranchIds / canSeeAllBranches.
const compare = asyncHandler(async (req, res) => {
  const data = await service.compare({
    allowedBranchIds: req.allowedBranchIds,
    canSeeAllBranches: req.canSeeAllBranches,
  });
  res.json({ success: true, data });
});

export default compare;
