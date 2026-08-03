import asyncHandler from "../../../middleware/asyncHandler.js";
import * as categoryService from "../services/expenseCategory.service.js";

const remove = asyncHandler(async (req, res) => {
  await categoryService.remove(req.params.id, req.user);
  res.json({ success: true, message: "Kategoriya o'chirildi" });
});

export default remove;
