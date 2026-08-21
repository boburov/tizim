import asyncHandler from "../../../middleware/asyncHandler.js";
import * as expenseService from "../services/expense.service.js";

const list = asyncHandler(async (req, res) => {
  const { items, total, page, limit, totalAmount } = await expenseService.list(req.query);
  res.json({
    success: true,
    data: items,
    meta: { page, limit, total, totalAmount },
  });
});

export default list;
