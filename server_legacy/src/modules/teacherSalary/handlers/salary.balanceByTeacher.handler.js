import asyncHandler from "../../../middleware/asyncHandler.js";
import * as teacherSalaryService from "../services/teacherSalary.service.js";

// O'qituvchining JORIY maosh holati (fiksa, jami daromad, qoldiqlar).
// Oylik qatorlar ro'yxatisiz - profil kartochkasi uchun yengil so'rov.
const balanceByTeacher = asyncHandler(async (req, res) => {
  const data = await teacherSalaryService.balanceByTeacher(req.params.teacherId);
  res.json({ success: true, data });
});

export default balanceByTeacher;
