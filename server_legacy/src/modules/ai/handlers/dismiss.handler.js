import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/insight.service.js";

const dismiss = asyncHandler(async (req, res) => {
  const data = await service.dismiss(req.params.id, req.body.reason, req.user);
  res.json({ success: true, data, message: "Rad etildi" });
});

export default dismiss;
