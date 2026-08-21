import asyncHandler from "../../../middleware/asyncHandler.js";
import * as leadsService from "../services/leads.service.js";

// Lidga biriktirish mumkin bo'lgan xodimlar (ism + rol yorlig'i).
// Sahifalash YO'Q: xodimlar soni o'nlab, yuzlab emas - tanlagich
// ro'yxati bir so'rovda to'liq keladi.
const assignees = asyncHandler(async (_req, res) => {
  const data = await leadsService.assignableStaff();
  res.json({ success: true, data });
});

export default assignees;
