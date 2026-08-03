import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/assignments.service.js";

const remove = asyncHandler(async (req, res) => {
  const data = await service.remove(req.params.id, req.user);
  res.json({ success: true, data, message: "Vazifa o'chirildi, joy bo'shatildi" });
});

export default remove;
