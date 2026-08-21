import asyncHandler from "../../../middleware/asyncHandler.js";
import * as shiftService from "../services/shift.service.js";

const shiftList = asyncHandler(async (req, res) => {
  const { items, total, page, limit } = await shiftService.list({
    status: req.query.status,
    cashierId: req.query.cashierId,
    page: Number(req.query.page) || 1,
    limit: Number(req.query.limit) || 50,
  });
  res.json({ success: true, data: items, meta: { page, limit, total } });
});

export default shiftList;
