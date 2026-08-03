import asyncHandler from "../../../middleware/asyncHandler.js";
import * as compensationService from "../services/teacherCompensation.service.js";

// O'qituvchining maosh stavkasi TARIXI (yangisidan eskisiga) + hozir amaldagisi.
const list = asyncHandler(async (req, res) => {
  const { teacherId } = req.params;
  const [items, active] = await Promise.all([
    compensationService.listByTeacher(teacherId),
    compensationService.getActive(teacherId),
  ]);
  res.json({ success: true, data: { items, active } });
});

export default list;
