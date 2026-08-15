import asyncHandler from "../../../middleware/asyncHandler.js";
import * as usersService from "../services/users.service.js";

const remove = asyncHandler(async (req, res) => {
  await usersService.softRemove(req.params.id, {
    reasonId: req.body?.reasonId,
    archiveDate: req.body?.archiveDate,
    by: req.user,
    // FILIAL CHEGARASI - qarang update.handler.js.
    scope: {
      allowedBranchIds: req.allowedBranchIds,
      canSeeAllBranches: req.canSeeAllBranches,
    },
  });
  res.json({ success: true, message: "O'chirildi" });
});

export default remove;
