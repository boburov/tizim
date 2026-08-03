import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/lessonCancellation.service.js";

const create = asyncHandler(async (req, res) => {
  const data = await service.create(req.body, req.user);
  res.status(201).json({
    success: true,
    data,
    message: data.billable
      ? "Dars ko'chirildi (to'lov o'zgarmaydi)"
      : "Dars bekor qilindi - o'quvchilar bu dars uchun to'lamaydi",
  });
});

export default create;
