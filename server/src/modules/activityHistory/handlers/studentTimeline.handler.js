import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/activityHistory.service.js";

const studentTimeline = asyncHandler(async (req, res) => {
  const { items, total, page, limit } = await service.getStudentTimeline(
    req.params.studentId,
    { page: Number(req.query.page) || 1, limit: Number(req.query.limit) || 30 },
  );
  res.json({ success: true, data: items, meta: { page, limit, total } });
});

export default studentTimeline;
