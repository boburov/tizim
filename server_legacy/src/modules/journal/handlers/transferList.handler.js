import asyncHandler from "../../../middleware/asyncHandler.js";
import * as transferService from "../services/cashTransfer.service.js";

const transferList = asyncHandler(async (req, res) => {
  const { items, total, page, limit } = await transferService.list({
    status: req.query.status,
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 50,
  });
  res.json({ success: true, data: items, meta: { page, limit, total } });
});

export default transferList;
