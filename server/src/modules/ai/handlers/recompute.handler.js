import asyncHandler from "../../../middleware/asyncHandler.js";
import { recomputeBranch, recomputeAll } from "../services/recompute.service.js";
import { getActiveBranchId } from "../../../helpers/branchContext.helper.js";

// Qo'lda qayta hisoblash. Tungi jobni kutmasdan natijani ko'rish uchun -
// vaznlarni sozlagandan keyin darhol tekshirish kerak bo'ladi.
const recompute = asyncHandler(async (req, res) => {
  const branchId = req.body.branchId || getActiveBranchId();
  const data = branchId ? [await recomputeBranch(branchId)] : await recomputeAll();
  res.json({ success: true, data, message: "Qayta hisoblandi" });
});

export default recompute;
