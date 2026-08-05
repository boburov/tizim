import asyncHandler from "../../../middleware/asyncHandler.js";
import { actorOf } from "../../../helpers/actor.helper.js";
import * as service from "../services/assignments.service.js";
import * as storageService from "../../storage/services/storage.service.js";
import { canonicalMimeOf } from "../../../middleware/uploadAttachment.js";

// Fayl nomi sarlavhada ikki xil ko'rinishda ketadi: ASCII (eski
// brauzerlar) va UTF-8 (kirill/o'zbek harflari saqlanib qolishi uchun).
// Bu naqsh eksport modulida ham ishlatilgan - bir xil bo'lgani ma'qul.
const contentDisposition = (name) => {
  const ascii = String(name).replace(/[^\x20-\x7E]/g, "_").replace(/"/g, "");
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
};

const download = asyncHandler(async (req, res) => {
  const file = await service.getDownloadable(
    req.params.id,
    actorOf(req),
    req.permissions,
  );
  const buffer = await storageService.readFile(file);

  // Content-Type SAQLANGAN qiymatdan emas, KENGAYTMADAN olinadi.
  //
  // `file.mimeType` - yuklovchi bergan satr. Bu tekshiruvlar joriy
  // qilinishidan oldin yuklangan fayllarda u istalgan narsa bo'lishi
  // mumkin (masalan "text/html"), va uni qaytarish brauzerga faylni
  // SAHIFA sifatida talqin qilish uchun sabab berardi.
  res.setHeader("Content-Type", canonicalMimeOf(file.originalName));
  res.setHeader("Content-Length", buffer.length);
  // Fayl HAR DOIM yuklab olinadi, hech qachon brauzerda ochilmaydi.
  res.setHeader("Content-Disposition", contentDisposition(file.originalName));
  // helmet buni global qo'yadi; bu yerda ATAYLAB takrorlanadi - fayl
  // qaytaradigan yagona yo'l shu va u helmet sozlamasiga bog'liq
  // bo'lib qolmasligi kerak.
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.send(buffer);
});

export default download;
