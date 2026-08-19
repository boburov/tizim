import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/entryDetail.service.js";

const handler = asyncHandler(async (req, res) => {
  // `req.permissions` — auth middleware to'ldiradi. Maosh yozuvlari
  // uchun qo'shimcha tekshiruv SERVISDA (yon eshik yopilishi kerak).
  const data = await service.getEntryDetail(req.params.id, req.user, req.permissions);
  res.json({ success: true, data });
});

export default handler;
