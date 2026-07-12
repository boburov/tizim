import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/activityHistory.service.js";

const groupTimeline = asyncHandler(async (req, res) => {
  const { items, total, page, limit } = await service.getGroupTimeline(
    req.params.groupId,
    { page: Number(req.query.page) || 1, limit: Number(req.query.limit) || 30 },
  );
  res.json({ success: true, data: items, meta: { page, limit, total } });
});

export default groupTimeline;
