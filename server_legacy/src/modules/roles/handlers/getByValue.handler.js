import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/roles.service.js";

const getByValue = asyncHandler(async (req, res) => {
  const data = await service.getByValue(req.params.value);
  res.json({ success: true, data });
});

export default getByValue;
