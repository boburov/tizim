import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/leadConversion.service.js";

// KONVERSIYA TAQQOSLASH - filial va xodim kesimida.
//
// Manba `statusHistory`, joriy status EMAS: o'quvchiga aylangan lid
// keyin arxivlansa ham konversiya hisobidan tushib qolmasligi kerak.
const conversion = asyncHandler(async (req, res) => {
  const data = await service.conversion({
    from: req.query.from || null,
    to: req.query.to || null,
  });
  res.json({ success: true, data });
});

export default conversion;
