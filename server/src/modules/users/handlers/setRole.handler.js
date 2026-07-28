import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/users.service.js";

const setRole = asyncHandler(async (req, res) => {
  // permissions va filial ko'lami req'da (requireAuth o'rnatadi), req.user'da
  // emas - imtiyoz oshirish tekshiruvi uchun ikkalasi ham kerak.
  const data = await service.setRole(req.params.id, req.body.role, {
    _id: req.user._id,
    permissions: req.permissions,
    allowedBranchIds: req.allowedBranchIds,
    canSeeAllBranches: req.canSeeAllBranches,
  });
  res.json({ success: true, data, message: "Foydalanuvchi roli o'zgartirildi" });
});

export default setRole;
