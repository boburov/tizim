import asyncHandler from "../../../middleware/asyncHandler.js";
import * as admin from "../services/storageAdmin.service.js";
import * as storage from "../services/storage.service.js";

// Sozlama + kvota holati BITTA javobda: sahifa ochilishida ikki so'rov
// o'rniga bitta (va ikkalasi bir-biriga mos lahzadan olinadi).
const getSettings = asyncHandler(async (_req, res) => {
  const [settings, usage] = await Promise.all([
    admin.getSettings(),
    storage.getUsage(),
  ]);
  res.json({
    success: true,
    data: {
      settings: { ...settings.toJSON(), nextRunAt: admin.nextRunAt(settings) },
      usage,
    },
  });
});

export default getSettings;
