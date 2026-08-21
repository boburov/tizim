import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/lessonCancellation.service.js";

const remove = asyncHandler(async (req, res) => {
  await service.remove(req.params.id, req.user);
  res.json({ success: true, message: "Bekor qilish olib tashlandi" });
});

export default remove;
