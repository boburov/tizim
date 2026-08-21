import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/branchSales.service.js";

// SOTUV VORONKASI filiallar kesimida: nechta lid keldi, nechtasi
// o'quvchiga aylandi, qaysi kanal orqali, o'rtacha necha kunda.
const sales = asyncHandler(async (req, res) => {
  const data = await service.sales({
    from: req.query.from || null,
    to: req.query.to || null,
  });
  res.json({ success: true, data });
});

export default sales;
