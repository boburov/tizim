import asyncHandler from "../../../middleware/asyncHandler.js";
import { draftFromFile } from "../services/importEngine.service.js";

/**
 * JADVAL OQIMI, 1-BOSQICH: fayldan TAHRIRLANADIGAN qoralama.
 *
 * Hech narsa yozilmaydi. Javobdagi qatorlar brauzerda jadval bo'lib
 * chiziladi: bo'sh maydonlar to'ldirilgan (login, parol, sana, filial),
 * har qator tekshirilgan va hisoblangan ustunlar (necha oy, taxminiy
 * hisob, yakuniy balans) qo'shilgan.
 */
const draftHandler = asyncHandler(async (req, res) => {
  const data = await draftFromFile({
    importer: req.importer,
    buffer: req.file.buffer,
    fileName: req.file.originalname,
    actor: { currentUser: req.user, permissions: req.permissions },
  });

  res.json({ success: true, data });
});

export default draftHandler;
