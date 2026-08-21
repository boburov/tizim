import asyncHandler from "../../../middleware/asyncHandler.js";
import * as ledgerService from "../services/ledger.service.js";

// O'z balansi. req.user._id dan boshqa hech qanday kirish qabul
// qilinmaydi - shuning uchun bu yerda ruxsat tekshiruvi kerak emas.
const myStatement = asyncHandler(async (req, res) => {
  const data = await ledgerService.statementFor(req.user._id, {
    from: req.query.from || null,
    to: req.query.to || null,
    ownProfile: true,
  });
  res.json({ success: true, data });
});

export default myStatement;
