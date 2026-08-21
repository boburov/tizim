import asyncHandler from "../../../middleware/asyncHandler.js";
import * as salaryTransactionService from "../services/salaryTransaction.service.js";

const create = asyncHandler(async (req, res) => {
  // permissions req'da (requireAuth o'rnatadi), req.user'da emas - chiqim
  // limiti tekshiruvi uchun uzatamiz.
  const data = await salaryTransactionService.create(req.body, {
    _id: req.user._id,
    permissions: req.permissions,
  });

  // LIMITDAN OSHDI: pul chiqmadi, tasdiq kutilmoqda.
  // 202 Accepted - "qabul qilindi, lekin hali bajarilmadi".
  if (data?.pendingApproval) {
    return res.status(202).json({
      success: true,
      data: data.approval,
      pendingApproval: true,
      message: "Summa limitdan oshdi - tasdiqlash uchun yuborildi",
    });
  }

  res.status(201).json({ success: true, data, message: "To'lov amalga oshirildi" });
});

export default create;
