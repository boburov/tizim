import asyncHandler from "../../../middleware/asyncHandler.js";
import * as admin from "../services/storageAdmin.service.js";
import { formatBytes } from "../services/storage.service.js";

const cleanup = asyncHandler(async (req, res) => {
  const data = await admin.runCleanup({ ...req.body, userId: req.user._id });
  res.json({
    success: true,
    data,
    message: data.deleted
      ? `${data.deleted} ta fayl o'chirildi, ${formatBytes(data.freedBytes)} bo'shadi`
      : "O'chiriladigan fayl topilmadi",
  });
});

export default cleanup;
