import asyncHandler from "../../../middleware/asyncHandler.js";
import * as usersService from "../services/users.service.js";

// XODIMLAR statistikasi - rol kesimida (kartochkalar uchun).
// Sahifalangan ro'yxat bu raqamlarni bera olmaydi: u faqat 20 qatorni
// biladi, kartochkalarda esa JAMI kerak.
const staffStats = asyncHandler(async (_req, res) => {
  const data = await usersService.staffStats();
  res.json({ success: true, data });
});

export default staffStats;
