import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/roles.service.js";

// Tizimda MAVJUD ruxsatlardan qurilgan module x action jadvali.
const matrix = asyncHandler(async (_req, res) => {
  const data = await service.getMatrix();
  res.json({ success: true, data });
});

export default matrix;
