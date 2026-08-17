import asyncHandler from "../../../middleware/asyncHandler.js";
import logger from "../../../config/logger.js";
import prisma from "../../../config/prisma.js";
import { commit } from "../services/importEngine.service.js";

// TASDIQLASH: fayl QAYTA tekshiriladi va to'g'ri qatorlar yoziladi.
const commitHandler = asyncHandler(async (req, res) => {
  const startedAt = Date.now();

  const result = await commit({
    importer: req.importer,
    buffer: req.file.buffer,
    fileName: req.file.originalname,
    currentUser: req.user,
    actor: { currentUser: req.user, permissions: req.permissions },
  });

  const durationMs = Date.now() - startedAt;

  // TARIX. Yozib bo'lmasa import BEKOR QILINMAYDI - pul allaqachon
  // kiritilgan, jurnal esa ikkilamchi. Lekin bu jimgina o'tmasligi kerak.
  try {
    await prisma.importJob.create({
      data: {
      branchId: req.branchId ? String(req.branchId) : null,
      importerKey: req.importer.key,
      fileName: req.file.originalname,
      // `user` -> `userId`: Prisma'da `user` RELATION.
      userId: String(req.user._id),
      userName: [req.user.firstName, req.user.lastName].filter(Boolean).join(" "),
      total: result.summary.total,
      imported: result.summary.imported,
      failed: result.summary.failed + result.summary.error,
      duplicate: result.summary.duplicate,
      pending: result.summary.pending,
      durationMs,
      },
    });
  } catch (err) {
    logger.error({ err, importerKey: req.importer.key }, "Import tarixini yozib bo'lmadi");
  }

  res.json({ success: true, data: { ...result, durationMs } });
});

export default commitHandler;
