import asyncHandler from "../../../middleware/asyncHandler.js";
import * as transferService from "../services/cashTransfer.service.js";

const transferCancel = asyncHandler(async (req, res) => {
  const data = await transferService.cancel(req.params.id, req.body || {}, req.user);
  res.json({ success: true, data, message: "Bekor qilindi - pul kassaga qaytdi" });
});

export default transferCancel;
