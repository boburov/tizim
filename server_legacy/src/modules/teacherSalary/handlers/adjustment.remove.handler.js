import asyncHandler from "../../../middleware/asyncHandler.js";
import * as adjustmentService from "../services/salaryAdjustment.service.js";

const remove = asyncHandler(async (req, res) => {
  await adjustmentService.remove(req.params.id, req.user);
  res.json({ success: true, message: "O'chirildi" });
});

export default remove;
