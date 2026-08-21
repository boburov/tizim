import asyncHandler from "../../../middleware/asyncHandler.js";
import * as searchService from "../services/search.service.js";

const search = asyncHandler(async (req, res) => {
  // RUXSATLAR SERVISGA UZATILADI: to'lov bo'limi `finance.read` siz
  // umuman so'ralmaydi. Servis kontekstdan o'qimaydi — chunki u
  // testlardan ham chaqiriladi va u yerda kontekst boshqacha.
  const data = await searchService.globalSearch(req.query.q, {
    limit: req.query.limit ? Number(req.query.limit) : 5,
    permissions: req.permissions || [],
  });
  res.json({ success: true, data });
});

export default search;
