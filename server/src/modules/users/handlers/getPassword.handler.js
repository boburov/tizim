import asyncHandler from "../../../middleware/asyncHandler.js";
import * as usersService from "../services/users.service.js";

const getPassword = asyncHandler(async (req, res) => {
  // Filial ko'lami req'da (requireAuth o'rnatadi) - servisga uzatamiz,
  // aks holda boshqa filial xodimining paroli ochilib qolardi.
  const data = await usersService.getPassword(req.params.id, {
    allowedBranchIds: req.allowedBranchIds,
    canSeeAllBranches: req.canSeeAllBranches,
  });
  res.json({ success: true, data });
});

export default getPassword;
