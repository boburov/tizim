import asyncHandler from "../../../middleware/asyncHandler.js";
import * as ledgerService from "../services/ledger.service.js";

const statement = asyncHandler(async (req, res) => {
  const data = await ledgerService.statementFor(req.params.userId, {
    from: req.query.from || null,
    to: req.query.to || null,
  });
  res.json({ success: true, data });
});

export default statement;
