import asyncHandler from "../../../middleware/asyncHandler.js";
import * as usersService from "../services/users.service.js";
import { parsePagination, buildMeta } from "../../../utils/pagination.js";

const list = asyncHandler(async (req, res) => {
  const { page, limit } = parsePagination(req.query);
  // Holat: yangi `status` (active|archived|all) ustun; eski `archived` bilan ham mos.
  const status =
    req.query.status ||
    (req.query.archived === "1" || req.query.archived === "true"
      ? "archived"
      : "active");
  const { items, total } = await usersService.list({
    role: req.query.role,
    search: req.query.search,
    status,
    sort: req.query.sort,
    order: req.query.order,
    page,
    limit,
  });
  res.json({
    success: true,
    data: items,
    meta: buildMeta({ page, limit, total }),
  });
});

export default list;
