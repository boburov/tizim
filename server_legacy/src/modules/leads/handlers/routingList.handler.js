import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/leadRouting.service.js";

const routingList = asyncHandler(async (_req, res) => {
  const data = await service.list();
  res.json({ success: true, data });
});

export default routingList;
