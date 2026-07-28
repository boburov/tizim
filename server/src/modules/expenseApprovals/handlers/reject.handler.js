import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/expenseApproval.service.js";

const reject = asyncHandler(async (req, res) => {
  const data = await service.reject(req.params.id, { note: req.body?.note }, req.user);
  res.json({ success: true, data, message: "Rad etildi" });
});

export default reject;
