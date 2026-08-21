import asyncHandler from "../../../middleware/asyncHandler.js";
import * as journal from "../services/journal.service.js";

// KASSA QOLDIQLARI - "filialda qancha pul bor".
// Ko'lam servis ichida (branchMatchStage) - filial direktori faqat
// o'zinikini ko'radi.
const balances = asyncHandler(async (req, res) => {
  const opts = { until: req.query.until || null };
  const data = req.query.treasuryOnly
    ? await journal.treasuryBalances(opts)
    : await journal.balances(opts);
  res.json({ success: true, data });
});

export default balances;
