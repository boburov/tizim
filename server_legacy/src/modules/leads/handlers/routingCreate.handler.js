import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/leadRouting.service.js";

const routingCreate = asyncHandler(async (req, res) => {
  const data = await service.create(req.body);
  res.status(201).json({ success: true, data, message: "Qoida qo'shildi" });
});

export default routingCreate;
