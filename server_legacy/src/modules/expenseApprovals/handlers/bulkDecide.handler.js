import asyncHandler from "../../../middleware/asyncHandler.js";
import * as service from "../services/expenseApproval.service.js";

// Bitta handler ikkala amalga xizmat qiladi - farq faqat `action` da.
// Router uni bog'lab beradi: bulkDecide("approve") / bulkDecide("reject").
const bulkDecide = (action) =>
  asyncHandler(async (req, res) => {
    const result = await service.bulkDecide(
      req.body.ids,
      { action, note: req.body.note },
      req.user,
      req.permissions,
    );

    // 207 EMAS, 200: qisman muvaffaqiyat bu yerda NORMAL holat, xato emas.
    // Frontend natijani `failed` massivi bo'yicha ko'rsatadi.
    const message = result.failed.length
      ? `${result.succeeded.length} ta bajarildi, ${result.failed.length} ta o'tmadi`
      : `${result.succeeded.length} ta so'rov bajarildi`;

    res.json({ success: true, data: result, message });
  });

export default bulkDecide;
