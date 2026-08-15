import asyncHandler from "../../../middleware/asyncHandler.js";
import * as shiftService from "../services/shift.service.js";

const shiftClose = asyncHandler(async (req, res) => {
  const data = await shiftService.close(req.params.id, req.body, req.user);
  const msg =
    data.variance === 0
      ? "Smena yopildi - farq yo'q"
      : data.variance < 0
        ? `Smena yopildi - KAMOMAD ${Math.abs(data.variance)}`
        : `Smena yopildi - ORTIQCHA ${data.variance}`;
  res.json({ success: true, data, message: msg });
});

export default shiftClose;
