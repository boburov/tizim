import asyncHandler from "../../../middleware/asyncHandler.js";
import { actorOf } from "../../../helpers/actor.helper.js";
import * as service from "../services/assignments.service.js";

const remove = asyncHandler(async (req, res) => {
  const data = await service.remove(req.params.id, actorOf(req));
  res.json({ success: true, data, message: "Vazifa o'chirildi, joy bo'shatildi" });
});

export default remove;
