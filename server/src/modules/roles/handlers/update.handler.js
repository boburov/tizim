import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/roles.service.js";

const update = asyncHandler(async (req, res) => {
  const data = await service.update(
    req.params.value,
    req.body,
    req.user,
    req.permissions,
  );
  res.json({ success: true, data, message: "Rol yangilandi" });
});

export default update;
