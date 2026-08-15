import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/studentTransfer.service.js";

// Ko'chirish QAYTARIB BO'LMAYDI - operator natijani oldin ko'rsin.
const transferPreview = asyncHandler(async (req, res) => {
  const data = await service.preview(req.params.studentId, req.query.toBranchId);
  res.json({ success: true, data });
});

export default transferPreview;
