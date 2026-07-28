import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/expenseApproval.service.js";

const getById = asyncHandler(async (req, res) => {
  const data = await service.getById(req.params.id, {
    permissions: req.permissions,
    currentUser: req.user,
  });
  res.json({ success: true, data });
});

export default getById;
