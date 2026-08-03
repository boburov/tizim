import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/assignments.service.js";
import * as storageService from "../../storage/services/storage.service.js";

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
    req.user,
    req.permissions,
  );
  const buffer = await storageService.readFile(file);

  res.setHeader("Content-Type", file.mimeType || "application/octet-stream");
  res.setHeader("Content-Length", buffer.length);
  res.setHeader("Content-Disposition", contentDisposition(file.originalName));
  res.send(buffer);
});

export default download;
