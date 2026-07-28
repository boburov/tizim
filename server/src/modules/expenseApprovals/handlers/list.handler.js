import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/expenseApproval.service.js";
import { parsePagination, buildMeta } from "../../../utils/pagination.js";

const list = asyncHandler(async (req, res) => {
  const { page, limit } = parsePagination(req.query);
  const { items, total } = await service.list({
    status: req.query.status,
    kind: req.query.kind,
    category: req.query.category,
    page,
    limit,
    permissions: req.permissions,
    currentUser: req.user,
  });
  res.json({ success: true, data: items, meta: buildMeta({ page, limit, total }) });
});

export default list;
