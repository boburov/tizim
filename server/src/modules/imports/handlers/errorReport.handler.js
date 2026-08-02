import asyncHandler from "../../../middleware/asyncHandler.js";
import { buildErrorReport } from "../services/template.service.js";
import { sendXlsx } from "../../../utils/sendXlsx.js";

// XATOLIK HISOBOTI: o'tmagan qatorlarni Excel qilib qaytaradi.
//
// NEGA client qatorlarni QAYTA yuboradi (server saqlab qo'ymaydi):
// bu faqat FORMATLASH amali - ma'lumot allaqachon client'da, u ko'rib
// chiqish/tasdiq javobidan olingan. Server tomonda saqlansa, muddati va
// tozalanishi bilan bog'liq holat paydo bo'lardi. Bu yerda hech qanday
// DB o'qish yo'q, shuning uchun ma'lumot sizishi ham mumkin emas -
// foydalanuvchi o'zi yuborgan narsani qaytarib oladi.
const errorReportHandler = asyncHandler(async (req, res) => {
  const rows = req.body.rows || [];
  const buffer = await buildErrorReport(req.importer, rows);
  sendXlsx(res, buffer, `${req.importer.fileBase}-xatolar.xlsx`);
});

export default errorReportHandler;
