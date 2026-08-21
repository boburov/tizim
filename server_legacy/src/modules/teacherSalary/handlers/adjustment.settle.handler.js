import asyncHandler from "../../../middleware/asyncHandler.js";
import * as adjustmentService from "../services/salaryAdjustment.service.js";

// HISOB-KITOBNI YOPISH: qolgan to'lanmagan maoshni bitta jarima qatori bilan
// nolga tushiradi (ishdan bo'shatish oqimining birinchi qadami).
const settle = asyncHandler(async (req, res) => {
  const data = await adjustmentService.settleBalance(
    req.params.teacherId,
    req.body,
    req.user,
  );
  res.status(201).json({
    success: true,
    data,
    message: `Hisob yopildi: ${data.settled.toLocaleString("ru-RU")} so'm hisobdan chiqarildi`,
  });
});

export default settle;
