import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/branches.service.js";

const create = asyncHandler(async (req, res) => {
  // Filial + uning direktori BIRGA yaratiladi.
  const data = await service.createWithDirector(req.body, {
    _id: req.user._id,
    permissions: req.permissions,
    allowedBranchIds: req.allowedBranchIds,
    canSeeAllBranches: req.canSeeAllBranches,
  });
  res.status(201).json({
    success: true,
    data,
    message: "Filial va direktor yaratildi",
  });
});

export default create;
