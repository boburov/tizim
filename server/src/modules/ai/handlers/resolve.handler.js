import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/insight.service.js";

const resolve = asyncHandler(async (req, res) => {
  const data = await service.resolve(req.params.id, req.user);
  res.json({ success: true, data, message: "Bajarildi deb belgilandi" });
});

export default resolve;
