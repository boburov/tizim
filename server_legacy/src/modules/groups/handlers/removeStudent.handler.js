import asyncHandler from "../../../middleware/asyncHandler.js";
import * as groupsService from "../services/groups.service.js";

const removeStudent = asyncHandler(async (req, res) => {
  const result = await groupsService.removeStudent(
    req.params.id,
    req.params.studentId,
    { reasonId: req.body?.reasonId, writeOff: Boolean(req.body?.writeOff) },
    req.user,
  );
  const message = result?.writeOff
    ? `O'quvchi chiqarildi. ${result.writeOff.amount.toLocaleString("uz-UZ")} so'm undirilmagan to'lov sifatida hisobdan chiqarildi.`
    : "O'quvchi guruhdan chiqarildi";
  res.json({ success: true, data: { writeOff: result?.writeOff || null }, message });
});

export default removeStudent;
