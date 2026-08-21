import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/leads.service.js";

const convertBulk = asyncHandler(async (req, res) => {
  const data = await service.convertBulk(req.body, req.user);

  const ok = data.converted.length;
  const bad = data.failed.length;
  const message = bad
    ? `${ok} ta lid o'quvchiga aylantirildi, ${bad} tasi aylantirilmadi`
    : `${ok} ta lid o'quvchiga aylantirildi`;

  res.status(201).json({ success: true, data, message });
});

export default convertBulk;
