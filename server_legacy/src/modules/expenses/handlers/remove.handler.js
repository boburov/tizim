import asyncHandler from "../../../middleware/asyncHandler.js";
import * as expenseService from "../services/expense.service.js";

const remove = asyncHandler(async (req, res) => {
  await expenseService.remove(req.params.id, req.user);
  res.json({ success: true, message: "Chiqim o'chirildi" });
});

export default remove;
