import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/studentTransfer.service.js";

const transfer = asyncHandler(async (req, res) => {
  const data = await service.transfer(req.params.studentId, req.body, {
    _id: req.user._id,
    allowedBranchIds: req.allowedBranchIds,
    canSeeAllBranches: req.canSeeAllBranches,
  });
  res.json({
    success: true,
    data,
    message: `O'quvchi ${data.toBranchName} filialiga ko'chirildi`,
  });
});

export default transfer;
