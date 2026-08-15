import StaffPayroll from "../../../models/staffPayroll.model.js";
import StaffSalaryTransaction from "../../../models/staffSalaryTransaction.model.js";
import ApiError from "../../../utils/ApiError.js";
import { APPROVAL_KINDS } from "../../../models/approval.model.js";
import { parseLocalDay, isFutureLocalDay } from "../../../helpers/attendance.helper.js";
import { isBranchAllowed } from "../../../helpers/branchContext.helper.js";
import {
  checkExpenseLimit,
  createRequest,
} from "../../expenseApprovals/services/expenseApproval.service.js";
import * as payrollService from "./staffPayroll.service.js";
import * as auditService from "./payrollAudit.service.js";
import * as journalPosting from "../../../helpers/journalPosting.helper.js";
import * as journal from "../../journal/services/journal.service.js";

/**
 * XODIMGA MAOSH TO'LASH.
 *
 * O'qituvchi to'lovi bilan BIR XIL yo'ldan yuradi: filial chegarasidan
 * oshsa tasdiqqa tushadi (202), tasdiqlangach bir marta yoziladi.
 *
 * O'QITUVCHI MODULIDAGI XATO BU YERDA TAKRORLANMAYDI:
 * salaryTransaction.service.js:32-36 filialni GURUHDAN oladi va guruhsiz
 * qatorlar (markaz oyligi, bonus) uchun 404 "Guruh topilmadi" qaytaradi -
 * ya'ni ular umuman to'lanmaydi. Bu yerda filial maosh QATORIDAN olinadi.
 */
const validatePayment = async ({ payrollId, paidAt }) => {
  const payroll = await StaffPayroll.findById(payrollId);
  if (!payroll) throw new ApiError(404, "Maosh qatori topilmadi");
  if (!payroll.branchId) {
    throw new ApiError(400, "Maosh qatorida filial yo'q - shartnomani tekshiring");
  }

  const day = parseLocalDay(paidAt) || new Date();
  if (isFutureLocalDay(day)) {
    throw new ApiError(400, "Kelajakdagi sana bilan to'lov yozib bo'lmaydi");
  }

  return { payroll, day };
};

/**
 * To'lovni yozish: AVVAL balansni atomar band qilamiz, keyin qatorni
 * yozamiz. Tartib ataylab shunday - ikki marta bosilgan tugma qoldiqdan
 * oshib keta olmaydi (capToRemaining).
 */
const writeTransaction = async ({
  payroll,
  day,
  amount,
  method,
  note,
  createdBy,
  expenseApprovalId = null,
}) => {
  const updated = await payrollService.applyPaidDelta(payroll._id, amount, {
    capToRemaining: true,
  });
  if (!updated) {
    const remaining = Math.max(
      0,
      (payroll.finalAmount || 0) - (payroll.paidAmount || 0),
    );
    throw new ApiError(
      400,
      `To'lov qoldiqdan oshib ketadi (qoldiq: ${remaining} so'm)`,
    );
  }

  try {
    const created = await StaffSalaryTransaction.create({
      branchId: payroll.branchId,
      payroll: payroll._id,
      employee: payroll.employee,
      year: payroll.year,
      month: payroll.month,
      amount,
      method,
      paidAt: day,
      note: note || "",
      createdBy: createdBy || null,
      expenseApprovalId,
    });

    // JURNAL: xodim maoshi ham xarajat (o'qituvchinikidan farqi -
    // boshqa modelda saqlanadi, shuning uchun refModel boshqa).
    await journalPosting.postSalary(created, journal, "StaffSalaryTransaction");

    await auditService.record({
      employee: payroll.employee,
      year: payroll.year,
      month: payroll.month,
      action: auditService.PAYROLL_AUDIT_ACTIONS.PAID,
      targetType: "staffSalaryTransaction",
      targetId: created._id,
      oldValue: { paidAmount: payroll.paidAmount || 0 },
      newValue: { paidAmount: (payroll.paidAmount || 0) + amount, amount, method },
      reason: note || "",
      actor: createdBy ? { _id: createdBy } : null,
    });

    return created;
  } catch (err) {
    // Yozuv o'tmadi - band qilingan balansni qaytaramiz.
    await payrollService.applyPaidDelta(payroll._id, -amount);
    throw err;
  }
};

export const create = async (body, currentUser) => {
  const { payroll, day } = await validatePayment({
    payrollId: body.payrollId,
    paidAt: body.paidAt,
  });

  if (!isBranchAllowed(payroll.branchId)) {
    throw new ApiError(403, "Bu filial bo'yicha amal bajarib bo'lmaydi");
  }

  const amount = Number(body.amount);
  const { needsApproval, threshold } = await checkExpenseLimit({
    branchId: payroll.branchId,
    amount,
    permissions: currentUser?.permissions,
  });

  if (needsApproval) {
    const approval = await createRequest({
      branchId: payroll.branchId,
      kind: APPROVAL_KINDS.STAFF_SALARY_PAYMENT,
      amount,
      threshold,
      payload: {
        payrollId: String(payroll._id),
        method: body.method,
        paidAt: day,
        note: body.note || "",
      },
      subjectName: body.employeeName || "Xodim maoshi",
      contextName: `${payroll.month}/${payroll.year} maosh`,
      requestNote: body.requestNote,
      currentUser,
    });
    return { pendingApproval: true, approval };
  }

  return writeTransaction({
    payroll,
    day,
    amount,
    method: body.method,
    note: body.note,
    createdBy: currentUser?._id,
  });
};

/**
 * Tasdiqlangan to'lovni bajarish.
 *
 * IDEMPOTENT (uch qatlam): (1) mavjud qatorni qaytarish, (2) partial
 * unique indeks expenseApprovalId bo'yicha, (3) capToRemaining.
 * Payload ISHONCHSIZ deb qaraladi - hamma tekshiruv qaytadan yuriladi,
 * chunki so'rov va tasdiq orasida holat o'zgargan bo'lishi mumkin.
 */
export const executeApproved = async (approval) => {
  const existing = await StaffSalaryTransaction.findOne({
    expenseApprovalId: approval._id,
  });
  if (existing) return existing;

  const { payroll, day } = await validatePayment({
    payrollId: approval.payload?.payrollId,
    paidAt: approval.payload?.paidAt,
  });

  if (String(payroll.branchId) !== String(approval.branchId)) {
    throw new ApiError(400, "Maosh qatorining filiali o'zgargan");
  }

  return writeTransaction({
    payroll,
    day,
    amount: approval.amount,
    method: approval.payload?.method || "cash",
    note: approval.payload?.note || "",
    createdBy: approval.requestedBy,
    expenseApprovalId: approval._id,
  });
};

export const remove = async (id, currentUser) => {
  const doc = await StaffSalaryTransaction.findOne({
    _id: id,
    isDeleted: { $ne: true },
  });
  if (!doc) throw new ApiError(404, "To'lov topilmadi");
  if (!isBranchAllowed(doc.branchId)) {
    throw new ApiError(403, "Bu filial bo'yicha amal bajarib bo'lmaydi");
  }

  await doc.softDelete(currentUser?._id);
  await payrollService.applyPaidDelta(doc.payroll, -doc.amount);

  await auditService.record({
    employee: doc.employee,
    year: doc.year,
    month: doc.month,
    action: auditService.PAYROLL_AUDIT_ACTIONS.PAYMENT_REVERSED,
    targetType: "staffSalaryTransaction",
    targetId: doc._id,
    oldValue: { amount: doc.amount, method: doc.method, paidAt: doc.paidAt },
    actor: currentUser,
  });

  return { id };
};

export const listByPayroll = async (payrollId) =>
  StaffSalaryTransaction.find({ payroll: payrollId, isDeleted: { $ne: true } })
    .sort({ paidAt: -1 })
    .populate("createdBy", { firstName: 1, lastName: 1 })
    .lean();
