import asyncHandler from "../../../middleware/asyncHandler.js";
import * as authService from "../services/auth.service.js";

const registerUser = asyncHandler(async (req, res) => {
  // KO'LAM: body.homeBranchId ("Barcha filiallar" rejimidan keladi) o'z
  // ko'lamida ekanini servis tekshiradi - aks holda direktor boshqa
  // filialga odam yozib yuborardi.
  const user = await authService.registerUser(req.body, {
    allowedBranchIds: req.allowedBranchIds,
    canSeeAllBranches: req.canSeeAllBranches,
  });
  res.status(201).json({
    success: true,
    data: user,
    message: "Foydalanuvchi yaratildi",
  });
});

export default registerUser;
