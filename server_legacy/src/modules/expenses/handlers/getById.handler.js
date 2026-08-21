import asyncHandler from "../../../middleware/asyncHandler.js";
import * as expenseService from "../services/expense.service.js";

const getById = asyncHandler(async (req, res) => {
  const data = await expenseService.getById(req.params.id);
  res.json({ success: true, data });
});

export default getById;
