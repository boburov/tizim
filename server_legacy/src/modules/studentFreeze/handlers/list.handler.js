import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/studentFreeze.service.js";

const list = asyncHandler(async (req, res) => {
  // FILIAL CHEGARASI: boshqa filial o'quvchisining muzlatish tarixi
  // ham ko'rinmasligi kerak.
  const data = await service.listForStudent(req.params.studentId, {
    allowedBranchIds: req.allowedBranchIds,
    canSeeAllBranches: req.canSeeAllBranches,
  });
  res.json({ success: true, data });
});

export default list;
