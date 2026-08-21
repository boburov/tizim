import asyncHandler from "../../../middleware/asyncHandler.js";
import { getReport } from "../services/report.service.js";

const get = asyncHandler(async (req, res) => {
  const data = await getReport(req.params.id);
  res.json({ success: true, data });
});

export default get;
