import asyncHandler from "../../../middleware/asyncHandler.js";
import * as categoryService from "../services/expenseCategory.service.js";

const create = asyncHandler(async (req, res) => {
  const data = await categoryService.create(req.body, req.user);
  res.status(201).json({ success: true, data, message: "Kategoriya qo'shildi" });
});

export default create;
