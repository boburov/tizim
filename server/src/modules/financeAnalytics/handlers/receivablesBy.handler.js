import asyncHandler from "../../../middleware/asyncHandler.js";
import * as svc from "../services/receivables.service.js";

const handler = asyncHandler(async (req, res) => {
  const data = await svc.getReceivablesBy(req.params.by, req.query);
  res.json({ success: true, data });
});

export default handler;
