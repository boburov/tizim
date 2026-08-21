import asyncHandler from "../../../middleware/asyncHandler.js";
import * as depositService from "../services/deposit.service.js";

const withdraw = asyncHandler(async (req, res) => {
  const { studentId, ...body } = req.body;
  // permissions req'da (requireAuth o'rnatadi) - chiqim limiti uchun kerak.
  const data = await depositService.withdraw(studentId, body, {
    _id: req.user._id,
    permissions: req.permissions,
  });

  // LIMITDAN OSHDI: pul chiqmadi, tasdiq kutilmoqda.
  if (data?.pendingApproval) {
    return res.status(202).json({
      success: true,
      data: data.approval,
      pendingApproval: true,
      message: "Summa limitdan oshdi - tasdiqlash uchun yuborildi",
    });
  }

  res.json({ success: true, data, message: "To'lovdan yechib olindi" });
});

export default withdraw;
