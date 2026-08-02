import asyncHandler from "../../../middleware/asyncHandler.js";
import { preview } from "../services/importEngine.service.js";

// KO'RIB CHIQISH: fayl tahlil qilinadi va tekshiriladi, LEKIN hech narsa
// yozilmaydi. Foydalanuvchi natijani ko'rib, xatolarni tuzatib qayta
// yuklaydi yoki tasdiqlaydi.
const previewHandler = asyncHandler(async (req, res) => {
  const result = await preview({
    importer: req.importer,
    buffer: req.file.buffer,
    fileName: req.file.originalname,
  });

  res.json({ success: true, data: result });
});

export default previewHandler;
