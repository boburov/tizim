import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/users.service.js";

const setBranches = asyncHandler(async (req, res) => {
  const data = await service.setBranches(req.params.id, req.body, {
    _id: req.user._id,
    permissions: req.permissions,
    allowedBranchIds: req.allowedBranchIds,
    canSeeAllBranches: req.canSeeAllBranches,
  });
  res.json({ success: true, data, message: "Filial biriktiruvi yangilandi" });
});

export default setBranches;
