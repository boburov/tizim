import asyncHandler from "../../../middleware/asyncHandler.js";
import * as teacherGroupPeriodService from "../services/teacherGroupPeriod.service.js";
import * as approvalService from "../../expenseApprovals/services/expenseApproval.service.js";
import { salaryTermsMetrics } from "../../../helpers/configMetrics.helper.js";

// MAOSH STAVKASI TASDIG'I: filialning delegatsiya matritsasi hal qiladi
// (Branch.delegation.salary_terms). 202 = "qabul qilindi, lekin hali
// bajarilmadi".
//
// BU TUR UCHUN `auto` REJIMI YO'Q - eng ko'pi `threshold`. Sabab
// constants/delegation.js da: direktor o'zini o'qituvchi sifatida ham
// yozdirib, cheksiz `auto` bilan o'z stavkasini o'zi belgilay olardi.
//
// Gate ATAYLAB handler qatlamida, servisda emas: servisning create() funksiyasi
// ichki oqimlardan ham chaqiriladi (guruh arxivdan chiqarish, assignTeacher,
// seed) - u yerda tasdiq so'rash noto'g'ri bo'lardi.
const create = asyncHandler(async (req, res) => {
  const group = req.params.id;
  const { needsApproval } = await approvalService.checkConfigApproval({
    permissions: req.permissions,
    kind: approvalService.APPROVAL_KINDS.SALARY_TERMS,
    metrics: salaryTermsMetrics(req.body),
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
