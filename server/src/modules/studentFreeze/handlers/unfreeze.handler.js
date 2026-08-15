import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/studentFreeze.service.js";

const unfreeze = asyncHandler(async (req, res) => {
  const data = await service.unfreeze(req.params.studentId, {
    endDate: req.body.endDate,
    by: req.user,
    // FILIAL CHEGARASI: boshqa filial o'quvchisiga tegib bo'lmaydi.
    scope: {
      allowedBranchIds: req.allowedBranchIds,
      canSeeAllBranches: req.canSeeAllBranches,
    },
  });
  res.json({ success: true, data, message: "O'quvchi muzlatishdan chiqarildi" });
});

export default unfreeze;
