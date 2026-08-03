import asyncHandler from "../../../middleware/asyncHandler.js";
import * as expenseService from "../services/expense.service.js";

// Chiqim yaratish. Summa filial limitidan oshsa (yoki markaz umumiy chiqimi
// bo'lsa) hujjat YARATILMAYDI - tasdiq so'rovi ochiladi va 202 qaytadi.
const create = asyncHandler(async (req, res) => {
  const result = await expenseService.create(req.body, req.user);

  if (result?.pendingApproval) {
    return res.status(202).json({
      success: true,
      data: result.approval,
      message: "Tasdiqlash uchun yuborildi. Owner tasdiqlagach chiqim yoziladi.",
    });
  }

  res.status(201).json({ success: true, data: result, message: "Chiqim qo'shildi" });
});

export default create;
