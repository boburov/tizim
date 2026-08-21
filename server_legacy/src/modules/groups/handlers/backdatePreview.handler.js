import asyncHandler from "../../../middleware/asyncHandler.js";
import * as groupsService from "../services/groups.service.js";

// ORQAGA SANA TA'SIRINI OLDINDAN KO'RSATADI - hech narsa saqlamaydi.
// UI "Qo'shish" tugmasidan OLDIN shuni chaqiradi va foydalanuvchiga
// "Bu amal 3 oy uchun 4 200 000 so'm qarz yaratadi. Davom etasizmi?"
// degan tasdiq oynasini ko'rsatadi.
const backdatePreview = asyncHandler(async (req, res) => {
  const data = await groupsService.previewBackdate(req.params.id, {
    joinedAt: req.query.joinedAt,
    leftAt: req.query.leftAt,
  });
  res.json({ success: true, data });
});

export default backdatePreview;
