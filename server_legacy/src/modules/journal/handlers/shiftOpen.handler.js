import asyncHandler from "../../../middleware/asyncHandler.js";
import * as shiftService from "../services/shift.service.js";

const shiftOpen = asyncHandler(async (req, res) => {
  const data = await shiftService.open(req.body, req.user);
  res.status(201).json({ success: true, data, message: "Smena ochildi" });
});

export default shiftOpen;
