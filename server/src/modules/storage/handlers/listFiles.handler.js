import asyncHandler from "../../../middleware/asyncHandler.js";
import { parsePagination, buildMeta } from "../../../utils/pagination.js";
import * as admin from "../services/storageAdmin.service.js";

const listFiles = asyncHandler(async (req, res) => {
  const { page, limit, skip } = parsePagination(req.query);
  const { items, total } = await admin.listFiles({
    page,
    limit,
    skip,
    sort: req.query.sort,
  });
  res.json({
    success: true,
    data: items,
    meta: buildMeta({ page, limit, total }),
  });
});

export default listFiles;
