import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/entryDetail.service.js";

const handler = asyncHandler(async (req, res) => {
  const data = await service.listEntries(req.query, req.permissions);
  res.json({ success: true, data });
});

export default handler;
