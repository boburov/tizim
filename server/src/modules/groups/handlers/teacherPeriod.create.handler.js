import asyncHandler from "../../../middleware/asyncHandler.js";
import * as teacherGroupPeriodService from "../services/teacherGroupPeriod.service.js";
import * as approvalService from "../../expenseApprovals/services/expenseApproval.service.js";

// MAOSH STAVKASI TASDIG'I: approvals.decide_config ruxsati yo'q bo'lsa
// (odatda filial direktori), davr DARHOL yaratilmaydi - owner tasdig'iga
// yuboriladi. 202 = "qabul qilindi, lekin hali bajarilmadi".
//
// Gate ATAYLAB handler qatlamida, servisda emas: servisning create() funksiyasi
// ichki oqimlardan ham chaqiriladi (guruh arxivdan chiqarish, assignTeacher,
// seed) - u yerda tasdiq so'rash noto'g'ri bo'lardi.
const create = asyncHandler(async (req, res) => {
  const group = req.params.id;
  const { needsApproval } = approvalService.checkConfigApproval({
    permissions: req.permissions,
  });

  if (needsApproval) {
    const approval = await teacherGroupPeriodService.requestSalaryTerms(
      { op: "create", group, body: req.body },
      req.user,
    );
    return res.status(202).json({
      success: true,
      data: approval,
      message: "Tasdiqlash uchun yuborildi. Owner tasdiqlagach qo'llanadi.",
    });
  }

  const data = await teacherGroupPeriodService.create(
    { ...req.body, group },
    req.user,
  );
  res.status(201).json({ success: true, data, message: "Dars berish davri qo'shildi" });
});

export default create;
