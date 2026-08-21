import asyncHandler from "../../../middleware/asyncHandler.js";
import { buildTemplate } from "../services/template.service.js";
import { sendXlsx } from "../../../utils/sendXlsx.js";

// Shablon: sarlavhalar + namuna qator + yo'riqnoma varag'i.
const templateHandler = asyncHandler(async (req, res) => {
  const buffer = await buildTemplate(req.importer);
  sendXlsx(res, buffer, `${req.importer.fileBase}-shablon.xlsx`);
});

export default templateHandler;
