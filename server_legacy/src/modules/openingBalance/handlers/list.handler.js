import asyncHandler from "../../../middleware/asyncHandler.js";
import * as openingBalanceService from "../services/openingBalance.service.js";

const list = asyncHandler(async (req, res) => {
  const { rows, total, page, limit } = await openingBalanceService.list({
    page: req.query.page || 1,
    limit: req.query.limit || 50,
    pendingOnly: Boolean(req.query.pendingOnly),
  });
  res.json({ success: true, data: rows, meta: { page, limit, total } });
});

export default list;
