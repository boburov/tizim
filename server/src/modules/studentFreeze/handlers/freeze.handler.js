import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/studentFreeze.service.js";

const freeze = asyncHandler(async (req, res) => {
  const data = await service.freeze(req.params.studentId, {
    startDate: req.body.startDate,
    reason: req.body.reason,
    by: req.user,
  });
  res.status(201).json({ success: true, data, message: "O'quvchi muzlatildi" });
});

export default freeze;
