import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/rooms.service.js";

const remove = asyncHandler(async (req, res) => {
  await service.softRemove(req.params.id, req.user);
  res.json({ success: true, message: "Xona o'chirildi" });
});

export default remove;
