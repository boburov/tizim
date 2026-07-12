import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/studentFreeze.service.js";

const list = asyncHandler(async (req, res) => {
  const data = await service.listForStudent(req.params.studentId);
  res.json({ success: true, data });
});

export default list;
