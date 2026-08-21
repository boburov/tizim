import asyncHandler from "../../../middleware/asyncHandler.js";
import * as openingBalanceService from "../services/openingBalance.service.js";

// DIQQAT: bu amal PUL YOZADI. Ataylab avtomatik job'ga ulanmagan -
// qarang openingBalance.service.js -> repairPending izohi.
const repair = asyncHandler(async (req, res) => {
  const result = await openingBalanceService.repairPending({
    currentUser: req.user,
  });
  res.json({
    success: true,
    data: result,
    message: `${result.repaired} ta yozuv tuzatildi`,
  });
});

export default repair;
