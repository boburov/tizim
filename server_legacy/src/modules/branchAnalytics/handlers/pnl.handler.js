import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/branchPnl.service.js";

const pnl = asyncHandler(async (req, res) => {
  const data = await service.pnl({
    from: req.query.from || null,
    to: req.query.to || null,
    consolidated: Boolean(req.query.consolidated),
  });
  res.json({ success: true, data });
});

export default pnl;
