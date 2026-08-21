import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/branches.service.js";

const stats = asyncHandler(async (req, res) => {
  // KO'LAM so'rovdan uzatiladi: filial direktori BOSHQA filialning
  // ko'rsatkichlarini va rahbariyatini o'qiy olmasligi kerak.
  const data = await service.stats(req.params.id, {
    allowedBranchIds: req.allowedBranchIds,
    canSeeAllBranches: req.canSeeAllBranches,
  });
  res.json({ success: true, data });
});

export default stats;
