import User from "../../../models/user.model.js";
import StaffPayrollAdjustment from "../../../models/staffPayrollAdjustment.model.js";
import StaffPayroll from "../../../models/staffPayroll.model.js";
import ApiError from "../../../utils/ApiError.js";
import { ROLES } from "../../../constants/roles.js";
import { parseLocalDay } from "../../../helpers/attendance.helper.js";
import * as payrollService from "./staffPayroll.service.js";
import * as auditService from "./payrollAudit.service.js";

/**
 * QO'LDA KIRITILADIGAN BONUS va JARIMA.
 *
 * Bu yozuvlarga qayta hisoblash HECH QACHON tegmaydi - ular alohida
 * kolleksiyada. O'qituvchi modulida ayni himoya `recalc()` ning
 * "kind !== group bo'lsa darhol qaytish" qatoriga tayanadi
 * (teacherSalary.service.js:295) - ya'ni bitta `if` yo'qolsa qo'lda
 * kiritilgan bonuslar jimgina nolga aylanardi. Bu yerda bunday xavf yo'q.
 */
export const create = async (body, currentUser) => {
  const employee = await User.findById(body.employee).lean();
  if (!employee) throw new ApiError(404, "Xodim topilmadi");
  if (employee.role === ROLES.STUDENT) {
    throw new ApiError(400, "O'quvchiga bonus/jarima yozilmaydi");
  }

  const amount = Number(body.amount);
  if (!Number.isInteger(amount) || amount < 1) {
    throw new ApiError(400, "Summa musbat butun son bo'lishi kerak");
  }
  const reason = String(body.reason || "").trim();
  if (!reason) throw new ApiError(400, "Sabab ko'rsatilishi shart");

  // O'ZGARMAS DAVR: yopilgan yoki to'langan oyga yozib bo'lmaydi -
  // bonus ham oyning yakuniy summasini o'zgartiradi. Rad etilgan
  // urinish auditga tushadi.
  const target = await StaffPayroll.findOne({
    employee: employee._id,
    year: Number(body.year),
    month: Number(body.month),
  }).lean();
  await auditService.assertMutable(target, {
    action: body.kind === "penalty" ? "penalty.add" : "bonus.add",
    actor: currentUser,
    reason: body.reason,
  });

  const doc = await StaffPayrollAdjustment.create({
    employee: employee._id,
    branchId: body.branchId || employee.homeBranchId || null,
    year: Number(body.year),
    month: Number(body.month),
    kind: body.kind === "penalty" ? "penalty" : "bonus",
    amount,
    reason,
    occurredAt: parseLocalDay(body.occurredAt) || null,
    createdBy: currentUser?._id || null,
  });

  // Oy summasi darhol yangilansin - egasi natijani ko'radi. `force`
  // BERILMAYDI: yopilgan oy yuqorida allaqachon rad etilgan, bu yerda
  // uni chetlab o'tish uchun sabab yo'q.
  await payrollService.computePayroll(employee._id, doc.year, doc.month, {
    source: "manual",
    actor: currentUser,
  });

  await auditService.record({
    employee: employee._id,
    year: doc.year,
    month: doc.month,
    action:
      doc.kind === "penalty"
        ? auditService.PAYROLL_AUDIT_ACTIONS.PENALTY_ADDED
        : auditService.PAYROLL_AUDIT_ACTIONS.BONUS_ADDED,
    targetType: "adjustment",
    targetId: doc._id,
    newValue: { amount: doc.amount, kind: doc.kind },
    reason: doc.reason,
    actor: currentUser,
  });

  return doc;
};

export const remove = async (id, currentUser) => {
  const doc = await StaffPayrollAdjustment.findOne({
    _id: id,
    isDeleted: { $ne: true },
  });
  if (!doc) throw new ApiError(404, "Yozuv topilmadi");

  const target = await StaffPayroll.findOne({
    employee: doc.employee,
    year: doc.year,
    month: doc.month,
  }).lean();
  await auditService.assertMutable(target, {
    action: "adjustment.remove",
    actor: currentUser,
  });

  await doc.softDelete(currentUser?._id);
  await payrollService.computePayroll(doc.employee, doc.year, doc.month, {
    source: "manual",
    actor: currentUser,
  });

  await auditService.record({
    employee: doc.employee,
    year: doc.year,
    month: doc.month,
    action:
      doc.kind === "penalty"
        ? auditService.PAYROLL_AUDIT_ACTIONS.PENALTY_REMOVED
        : auditService.PAYROLL_AUDIT_ACTIONS.BONUS_REMOVED,
    targetType: "adjustment",
    targetId: doc._id,
    oldValue: { amount: doc.amount, kind: doc.kind, reason: doc.reason },
    actor: currentUser,
  });

  return { id };
};

export const listByEmployeeMonth = async (employeeId, year, month) =>
  StaffPayrollAdjustment.find({
    employee: employeeId,
    year: Number(year),
    month: Number(month),
    isDeleted: { $ne: true },
  })
    .sort({ createdAt: -1 })
    .populate("createdBy", { firstName: 1, lastName: 1 })
    .lean();
