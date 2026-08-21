import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/branchPnl.service.js";

// "Ichki o'tkazmalar hisobotni qancha shishirgan" - owner uchun
// ishonch vositasi: farq AYNAN qancha ekani ko'rinadi.
const elimination = asyncHandler(async (req, res) => {
  const data = await service.eliminationImpact({
    from: req.query.from || null,
    to: req.query.to || null,
  });
  res.json({ success: true, data });
});

export default elimination;
