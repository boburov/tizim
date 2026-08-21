import asyncHandler from "../../../middleware/asyncHandler.js";
import * as groupsService from "../services/groups.service.js";

const addStudentsBulk = asyncHandler(async (req, res) => {
  const data = await groupsService.addStudentsBulk(req.params.id, req.body.studentIds, {
    joinedAt: req.body.joinedAt,
    leftAt: req.body.leftAt,
    force: req.body.force,
  });

  // Dars to'qnashuvi topilib, hali tasdiqlanmagan - HECH KIM qo'shilmadi.
  if (data.requiresConfirmation) {
    return res.status(200).json({
      success: true,
      data,
      message: "Ba'zi o'quvchilarning bu vaqtda darsi bor",
    });
  }

  const addedCount = data.added.length;
  const failedCount = data.failed.length;
  const message = failedCount
    ? `${addedCount} ta o'quvchi qo'shildi, ${failedCount} tasi qo'shilmadi`
    : `${addedCount} ta o'quvchi qo'shildi`;

  res.status(201).json({ success: true, data, message });
});

export default addStudentsBulk;
