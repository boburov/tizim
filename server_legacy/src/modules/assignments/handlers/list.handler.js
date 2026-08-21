import asyncHandler from "../../../middleware/asyncHandler.js";
import { parsePagination, buildMeta } from "../../../utils/pagination.js";
import { actorOf } from "../../../helpers/actor.helper.js";
import * as service from "../services/assignments.service.js";

const list = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const { items, total } = await service.list(
    { page, limit, skip, groupId: req.query.groupId },
    actorOf(req),
  );
  res.json({
    success: true,
    data: items,
    meta: buildMeta({ page, limit, total }),
  });
});

export default list;
