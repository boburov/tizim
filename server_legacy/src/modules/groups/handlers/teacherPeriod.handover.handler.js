import asyncHandler from "../../../middleware/asyncHandler.js";
import * as teacherGroupPeriodService from "../services/teacherGroupPeriod.service.js";

// OMMAVIY TOPSHIRISH: ketayotgan o'qituvchining guruhlarini bir amalda bir
// nechta o'qituvchiga taqsimlaydi. Maosh kunlar bo'yicha o'zi bo'linadi.
//
// TASDIQ GATE'i ATAYLAB YO'Q (teacherPeriod.create'dan farqli): u yerdagi
// tasdiq MAOSH STAVKASI o'zgarishi uchun edi. Bu yerda esa stavka
// belgilanmaydi - qabul qiluvchi O'Z shartnomasi bo'yicha oladi.
const handover = asyncHandler(async (req, res) => {
  const data = await teacherGroupPeriodService.handover(
    { teacher: req.params.teacherId, ...req.body },
    req.user,
  );
  res.status(200).json({
    success: true,
    data,
    message: `${data.opened} ta guruh topshirildi`,
  });
});

export default handover;
