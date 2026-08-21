import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/branchMetrics.service.js";

// Filiallarni HAJMIDAN QAT'I NAZAR solishtirish: 1 kv.m ga tushum,
// 1 xonaga talaba, ARPU, CAC, bandlik.
const normalized = asyncHandler(async (req, res) => {
  const data = await service.normalized({
    from: req.query.from || null,
    to: req.query.to || null,
  });
  res.json({ success: true, data });
});

export default normalized;
