import asyncHandler from "../../../middleware/asyncHandler.js";
import * as transferService from "../services/cashTransfer.service.js";

const transferReceive = asyncHandler(async (req, res) => {
  const data = await transferService.receive(req.params.id, req.body, req.user);
  res.json({
    success: true,
    data,
    message: data.discrepancy
      ? `Qabul qilindi, FARQ: ${data.discrepancy}`
      : "Qabul qilindi",
  });
});

export default transferReceive;
