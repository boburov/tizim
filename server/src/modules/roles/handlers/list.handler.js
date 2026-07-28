import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/roles.service.js";

const list = asyncHandler(async (_req, res) => {
  const data = await service.list();
  res.json({ success: true, data });
});

export default list;
