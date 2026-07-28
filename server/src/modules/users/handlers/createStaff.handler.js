import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/users.service.js";

const createStaff = asyncHandler(async (req, res) => {
  // permissions + filial ko'lami req'da (requireAuth), req.user'da emas.
  const data = await service.createStaff(req.body, {
    _id: req.user._id,
    permissions: req.permissions,
    allowedBranchIds: req.allowedBranchIds,
    canSeeAllBranches: req.canSeeAllBranches,
  });
  res.status(201).json({ success: true, data, message: "Xodim qo'shildi" });
});

export default createStaff;
