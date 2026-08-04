import { Router } from "express";
import requireAuth from "../../middleware/auth.js";
import requirePermission from "../../middleware/requirePermission.js";
import validate from "../../middleware/validate.js";
import { PERMISSIONS } from "../../constants/permissions.js";

import {
  updateSettingsSchema,
  cleanupSchema,
  listFilesSchema,
  fileIdSchema,
} from "./validators/storage.validator.js";

import usage from "./handlers/usage.handler.js";
import getSettings from "./handlers/getSettings.handler.js";
import updateSettings from "./handlers/updateSettings.handler.js";
import cleanupPreview from "./handlers/cleanupPreview.handler.js";
import cleanup from "./handlers/cleanup.handler.js";
import listFiles from "./handlers/listFiles.handler.js";
import removeFile from "./handlers/removeFile.handler.js";

const router = Router();

// Kvota holati. requirePermission ATAYLAB yo'q: bu raqamni sidebar
// ko'rsatadi va u markazning umumiy holati (kimningdir shaxsiy ma'lumoti
// emas). Ruxsat qo'yilsa, o'qituvchi joy tugaganini faqat fayl yuklab
// ko'rgandan keyin bilib olardi.
router.get("/usage", requireAuth, usage);

// --- BOSHQARUV ---
// Hammasi STORAGE_MANAGE talab qiladi: bu yerdagi amallar butun
// markazning fayllarini o'chiradi va ularni qaytarib bo'lmaydi.
const manage = [requireAuth, requirePermission(PERMISSIONS.STORAGE_MANAGE)];

router.get("/settings", ...manage, getSettings);
router.patch("/settings", ...manage, validate(updateSettingsSchema), updateSettings);

// Tozalash: avval "nima o'chadi" (preview), keyin bajarish.
// Ikki qadam ATAYLAB: "hammasini o'chirish" bir bosishda bo'lmasligi kerak.
router.post("/cleanup/preview", ...manage, validate(cleanupSchema), cleanupPreview);
router.post("/cleanup", ...manage, validate(cleanupSchema), cleanup);

// Fayllar ro'yxati (nima joy egallayapti) + bittalab o'chirish.
router.get("/files", ...manage, validate(listFilesSchema), listFiles);
router.delete("/files/:id", ...manage, validate(fileIdSchema), removeFile);

export default router;
