import asyncHandler from "../../../middleware/asyncHandler.js";
import * as expenseService from "../services/expense.service.js";

// Oylik chiqim - kategoriya bo'yicha (pie chart / jadval uchun).
const summary = asyncHandler(async (req, res) => {
  const data = await expenseService.summaryByCategory(req.query);
  res.json({ success: true, data });
});

export default summary;
