import asyncHandler from "../../../middleware/asyncHandler.js";
import * as usersService from "../services/users.service.js";

const update = asyncHandler(async (req, res) => {
  // currentUser - HR sanasi o'zgarganda audit yozuvida "kim" bo'lishi uchun.
  //
  // scope - FILIAL CHEGARASI. Bu route endi owner-only emas
  // (`users.update` ruxsati), shuning uchun servis boshqa filial
  // xodimini tahrirlashni rad etishi kerak.
  const user = await usersService.update(req.params.id, req.body, req.user, {
    allowedBranchIds: req.allowedBranchIds,
    canSeeAllBranches: req.canSeeAllBranches,
  });
  res.json({ success: true, data: user, message: "Saqlandi" });
});

export default update;
