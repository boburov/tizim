import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/courses.service.js";

const list = asyncHandler(async (req, res) => {
  const { items, total, page, limit } = await service.list({
    search: req.query.search,
    includeInactive: req.query.includeInactive,
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 100,
  });
  res.json({ success: true, data: items, meta: { page, limit, total } });
});

export default list;
