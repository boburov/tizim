import asyncHandler from "../../../middleware/asyncHandler.js";
import * as compensationService from "../services/teacherCompensation.service.js";
import * as approvalService from "../../expenseApprovals/services/expenseApproval.service.js";
import { compensationMetrics } from "../../../helpers/configMetrics.helper.js";

// MAOSH STAVKASINI BELGILASH.
//
// Filialning delegatsiya matritsasi hal qiladi
// (Branch.delegation.teacher_compensation_set). SALARY_TERMS kabi bu turda
// ham `auto` YO'Q - eng ko'pi `threshold`.
//
// Gate handler qatlamida (servisda emas): servisning setCompensation() funksiyasi
// ishga olish oqimidan (createStaff) ham chaqiriladi - u yerda ishga olish
// so'rovining O'ZI allaqachon tasdiqdan o'tgan bo'ladi va ikkinchi tasdiq
// so'rash foydalanuvchini ikki marta kutishga majburlardi.
const set = asyncHandler(async (req, res) => {
  const { needsApproval } = await approvalService.checkConfigApproval({
    permissions: req.permissions,
    kind: approvalService.APPROVAL_KINDS.TEACHER_COMPENSATION_SET,
    metrics: compensationMetrics(req.body),
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
