import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/roles.service.js";

const remove = asyncHandler(async (req, res) => {
  const data = await service.remove(req.params.value, {
    migrateTo: req.query.migrateTo,
  });
  res.json({ success: true, data, message: "Rol o'chirildi" });
});

export default remove;
