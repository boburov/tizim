import asyncHandler from "../../../middleware/asyncHandler.js";
import * as transferService from "../services/cashTransfer.service.js";

const transferSend = asyncHandler(async (req, res) => {
  const data = await transferService.send(req.body, req.user);
  res.status(201).json({
    success: true,
    data,
    message: "Inkassatsiya jo'natildi - pul «yo'lda» holatida",
  });
});

export default transferSend;
