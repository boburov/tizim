import asyncHandler from "../../../middleware/asyncHandler.js";
import * as compensationService from "../services/teacherCompensation.service.js";

const remove = asyncHandler(async (req, res) => {
  await compensationService.removeCompensation(req.params.id, req.user);
  res.json({ success: true, message: "Maosh stavkasi o'chirildi" });
});

export default remove;
