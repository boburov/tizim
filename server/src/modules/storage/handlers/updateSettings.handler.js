import asyncHandler from "../../../middleware/asyncHandler.js";
import * as admin from "../services/storageAdmin.service.js";

const updateSettings = asyncHandler(async (req, res) => {
  const settings = await admin.updateSettings(req.body);
  res.json({
    success: true,
    data: { ...settings.toJSON(), nextRunAt: admin.nextRunAt(settings) },
    message: "Tozalash sozlamalari saqlandi",
  });
});

export default updateSettings;
