import asyncHandler from "../../../middleware/asyncHandler.js";
import * as expenseService from "../services/expense.service.js";

const update = asyncHandler(async (req, res) => {
  const data = await expenseService.update(req.params.id, req.body, req.user);
  res.json({ success: true, data, message: "Chiqim yangilandi" });
});

export default update;
