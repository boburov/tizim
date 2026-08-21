import asyncHandler from "../../../middleware/asyncHandler.js";
import * as authService from "../services/auth.service.js";

const me = asyncHandler(async (req, res) => {
  // requireAuth filialga xos rolni allaqachon hisoblagan - qayta
  // hisoblamaymiz va client SERVERDAGI aynan shu ruxsatlarni oladi.
  const data = await authService.me(req.user, {
    effectiveRole: req.role,
    branchId: req.branchId,
  });
  res.json({ success: true, data });
});

export default me;
