import asyncHandler from "../../../middleware/asyncHandler.js";
import { parsePagination, buildMeta } from "../../../utils/pagination.js";
import * as service from "../services/assignments.service.js";

const myList = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const { items, total } = await service.listForStudent(req.user._id, {
    page,
    limit,
    skip,
  });
  res.json({
    success: true,
    data: items,
    meta: buildMeta({ page, limit, total }),
  });
});

export default myList;
