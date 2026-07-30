import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/insight.service.js";

const acknowledge = asyncHandler(async (req, res) => {
  const data = await service.acknowledge(req.params.id, req.user);
  res.json({ success: true, data, message: "Belgilandi" });
});

export default acknowledge;
