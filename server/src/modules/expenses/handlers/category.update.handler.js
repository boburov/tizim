import asyncHandler from "../../../middleware/asyncHandler.js";
import * as categoryService from "../services/expenseCategory.service.js";

const update = asyncHandler(async (req, res) => {
  const data = await categoryService.update(req.params.id, req.body, req.user);
  res.json({ success: true, data, message: "Kategoriya yangilandi" });
});

export default update;
