import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/financeOps.service.js";

const handler = asyncHandler(async (req, res) => {
  const data = await service.createOwnerCapital(req.body, req.user);
  res.status(201).json({ success: true, data });
});

export default handler;
