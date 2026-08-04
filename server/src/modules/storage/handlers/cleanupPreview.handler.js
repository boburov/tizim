import asyncHandler from "../../../middleware/asyncHandler.js";
import * as admin from "../services/storageAdmin.service.js";

// Nechta fayl va qancha joy o'chishini OLDINDAN aytadi - hech narsa
// o'chirmaydi. Tasdiqlash oynasi shu raqamni ko'rsatadi.
const cleanupPreview = asyncHandler(async (req, res) => {
  const data = await admin.previewCleanup(req.body);
  res.json({ success: true, data });
});

export default cleanupPreview;
