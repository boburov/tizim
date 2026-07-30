import asyncHandler from "../../../middleware/asyncHandler.js";
import { listReports } from "../services/report.service.js";

const list = asyncHandler(async (req, res) => {
  const { items, meta } = await listReports(req.query);
  res.json({ success: true, data: items, meta });
});

export default list;
