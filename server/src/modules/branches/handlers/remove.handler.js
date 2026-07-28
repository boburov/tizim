import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/branches.service.js";

const remove = asyncHandler(async (req, res) => {
  await service.softRemove(req.params.id, req.user);
  res.json({ success: true, message: "Filial o'chirildi" });
});

export default remove;
