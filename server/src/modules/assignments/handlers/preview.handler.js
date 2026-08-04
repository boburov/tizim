import asyncHandler from "../../../middleware/asyncHandler.js";
import { actorOf } from "../../../helpers/actor.helper.js";
import * as service from "../services/assignments.service.js";

const preview = asyncHandler(async (req, res) => {
  const data = await service.preview(req.body, actorOf(req));
  res.json({ success: true, data });
});

export default preview;
