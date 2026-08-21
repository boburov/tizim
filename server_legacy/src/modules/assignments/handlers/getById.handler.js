import asyncHandler from "../../../middleware/asyncHandler.js";
import { actorOf } from "../../../helpers/actor.helper.js";
import * as service from "../services/assignments.service.js";

const getById = asyncHandler(async (req, res) => {
  const data = await service.getById(req.params.id, actorOf(req));
  res.json({ success: true, data });
});

export default getById;
