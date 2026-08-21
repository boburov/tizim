import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/roles.service.js";

const create = asyncHandler(async (req, res) => {
  const data = await service.create(req.body, req.user, req.permissions);
  res.status(201).json({ success: true, data, message: "Rol yaratildi" });
});

export default create;
