import asyncHandler from "../../../middleware/asyncHandler.js";
import * as journal from "../services/journal.service.js";
import * as verifyService from "../services/journalVerify.service.js";

// SOG'LIQ TEKSHIRUVI: muvozanat + filiallararo tenglik + jurnal
// operatsion modellar bilan mos keladimi.
//
// KO'LAMSIZ (butun tarmoq) - shuning uchun route owner-only.
const reconcile = asyncHandler(async (_req, res) => {
  const [ledger, wiring] = await Promise.all([
    journal.reconcile(),
    verifyService.verify(),
  ]);
  res.json({
    success: true,
    data: { ok: ledger.ok && wiring.ok, ledger, wiring },
  });
});

export default reconcile;
