import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/insight.service.js";

// Modul paneli: "Moliya → AI Insights". Har bir modul sahifasi shu
// endpointdan o'z domenidagi ochiq insight'larni oladi.
const byDomain = asyncHandler(async (req, res) => {
  const data = await service.byDomain(req.params.domain, req.query);
  res.json({ success: true, data });
});

export default byDomain;
