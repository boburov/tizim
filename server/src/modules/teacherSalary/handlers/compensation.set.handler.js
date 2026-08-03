import asyncHandler from "../../../middleware/asyncHandler.js";
import * as compensationService from "../services/teacherCompensation.service.js";
import * as approvalService from "../../expenseApprovals/services/expenseApproval.service.js";

// MAOSH STAVKASINI BELGILASH.
//
// Gate handler qatlamida (servisda emas): servisning setCompensation() funksiyasi
// ishga olish oqimidan (createStaff) ham chaqiriladi - u yerda ishga olish
// so'rovining O'ZI allaqachon tasdiqdan o'tgan bo'ladi va ikkinchi tasdiq
// so'rash foydalanuvchini ikki marta kutishga majburlardi.
const set = asyncHandler(async (req, res) => {
  const { needsApproval } = approvalService.checkConfigApproval({
    permissions: req.permissions,
  });

  if (needsApproval) {
    const approval = await compensationService.requestSet(req.body, req.user);
    return res.status(202).json({
      success: true,
      data: approval,
      message: "Tasdiqlash uchun yuborildi. Owner tasdiqlagach qo'llanadi.",
    });
  }

  const data = await compensationService.setCompensation(req.body, req.user);
  res.status(201).json({ success: true, data, message: "Maosh stavkasi belgilandi" });
});

export default set;
