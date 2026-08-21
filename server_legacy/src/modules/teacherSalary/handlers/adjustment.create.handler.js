import asyncHandler from "../../../middleware/asyncHandler.js";
import * as adjustmentService from "../services/salaryAdjustment.service.js";

// KPI mukofoti yoki jarima qatori.
const create = asyncHandler(async (req, res) => {
  const data = await adjustmentService.create(req.body, req.user);
  res.status(201).json({
    success: true,
    data,
    message: req.body.kind === "deduction" ? "Jarima qo'shildi" : "Mukofot qo'shildi",
  });
});

export default create;
