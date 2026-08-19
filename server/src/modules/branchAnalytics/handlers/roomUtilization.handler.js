import asyncHandler from "../../../middleware/asyncHandler.js";
import { getRoomUtilization } from "../services/roomUtilization.service.js";

const roomUtilization = asyncHandler(async (req, res) => {
  const data = await getRoomUtilization({
    branchId: req.query.branchId,
    dayStart: req.query.dayStart === undefined ? undefined : Number(req.query.dayStart),
    dayEnd: req.query.dayEnd === undefined ? undefined : Number(req.query.dayEnd),
  });
  res.json({ success: true, data });
});

export default roomUtilization;
