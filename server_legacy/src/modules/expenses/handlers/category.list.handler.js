import asyncHandler from "../../../middleware/asyncHandler.js";
import * as categoryService from "../services/expenseCategory.service.js";

const list = asyncHandler(async (req, res) => {
  const data = await categoryService.list(req.query);
  res.json({ success: true, data });
});

export default list;
