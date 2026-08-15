import asyncHandler from "../../../middleware/asyncHandler.js";
import * as usersService from "../services/users.service.js";

const restore = asyncHandler(async (req, res) => {
  const data = await usersService.restore(req.params.id, {
    reasonId: req.body?.reasonId,
    by: req.user,
    // FILIAL CHEGARASI - qarang update.handler.js.
    scope: {
      allowedBranchIds: req.allowedBranchIds,
      canSeeAllBranches: req.canSeeAllBranches,
    },
  });
  res.json({ success: true, data, message: "Tiklandi" });
});

export default restore;
