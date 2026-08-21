import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/leadRouting.service.js";

const routingRemove = asyncHandler(async (req, res) => {
  await service.remove(req.params.id);
  res.json({ success: true, message: "Qoida o'chirildi" });
});

export default routingRemove;
