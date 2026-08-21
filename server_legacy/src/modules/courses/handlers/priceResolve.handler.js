import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/coursePrice.service.js";

// Guruh uchun AMALDAGI narx va u QAYERDAN kelgani.
// Manbani ham qaytaramiz - owner "nega bu narx" savoliga javob topsin.
const priceResolve = asyncHandler(async (req, res) => {
  const data = await service.resolveGroupPrice(req.params.groupId, {
    year: req.query.year,
    month: req.query.month,
  });
  res.json({ success: true, data });
});

export default priceResolve;
