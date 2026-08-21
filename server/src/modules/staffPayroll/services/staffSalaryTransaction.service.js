import prisma from "../../../config/prisma.js";
import ApiError from "../../../utils/ApiError.js";
import { withLegacyId, withLegacyIds } from "../../../utils/serialize.js";
import { APPROVAL_KINDS } from "../../../constants/approvals.js";
import { parseLocalDay, isFutureLocalDay } from "../../../helpers/attendance.helper.js";
import { isBranchAllowed } from "../../../helpers/branchContext.helper.js";
import {
  checkExpenseLimit,
  createRequest,
} from "../../expenseApprovals/services/expenseApproval.service.js";
import * as payrollService from "./staffPayroll.service.js";
import * as auditService from "./payrollAudit.service.js";
import * as financialTx from "../../finance/services/financialTransaction.service.js";
import { runFinanceTxn } from "../../finance/services/financeTxn.helper.js";

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
 *
 * MONGO → PRISMA: { payroll } → { payrollId }, { employee } → { employeeId };
 * doc.softDelete(by) → update(...); err.code 11000 → "P2002".
 */
const actorId = (u) => u?.id || u?._id || null;

const validatePayment = async ({ payrollId, paidAt }) => {
  const payroll = await prisma.staffPayroll.findUnique({
    where: { id: String(payrollId) },
  });
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
  // ── ATOMIK (o'qituvchi maoshi bilan bir xil sabab) ──
  // Balans, tranzaksiya, jurnal, moliyaviy audit va payroll auditi —
  // hammasi bitta tranzaksiyada. Ilgari rollback qo'lda edi.
  const created = await runFinanceTxn(async (tx) => {
    const updated = await payrollService.applyPaidDelta(payroll.id, amount, {
      capToRemaining: true,
      tx,
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

    const row = await tx.staffSalaryTransaction.create({
      data: {
        branchId: payroll.branchId,
        payrollId: payroll.id,
        employeeId: payroll.employeeId,
        year: payroll.year,
        month: payroll.month,
        amount,
        method,
        paidAt: day,
        note: note || "",
        createdById: createdBy ? String(createdBy) : null,
        expenseApprovalId: expenseApprovalId ? String(expenseApprovalId) : null,
      },
    });

    await financialTx.postStaffPayroll(
      { staffSalaryTransactionId: row.id },
      createdBy ? { id: createdBy } : null,
      { tx },
    );

    // PAYROLL AUDITI HAM SHU TRANZAKSIYADA.
    //
    // Ilgari u jurnal yozuvidan keyin, lekin `catch` ichida edi — ya'ni
    // audit yiqilsa balans qaytarilardi. Endi u tranzaksiyaning bir
    // qismi: maosh to'lovi AUDIT IZISIZ qolishi mumkin emas.
    await auditService.record({
      employee: payroll.employeeId,
      year: payroll.year,
      month: payroll.month,
      action: auditService.PAYROLL_AUDIT_ACTIONS.PAID,
      targetType: "staffSalaryTransaction",
      targetId: row.id,
      oldValue: { paidAmount: payroll.paidAmount || 0 },
      newValue: { paidAmount: (payroll.paidAmount || 0) + amount, amount, method },
      reason: note || "",
      actor: createdBy ? { id: createdBy, _id: createdBy } : null,
      tx,
    });

    return row;
  });

  return withLegacyId(created);
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
        payrollId: String(payroll.id),
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
    createdBy: actorId(currentUser),
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
  const approvalId = String(approval.id ?? approval._id);
  const existing = await prisma.staffSalaryTransaction.findFirst({
    where: { expenseApprovalId: approvalId },
  });
  if (existing) return withLegacyId(existing);

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
    createdBy: approval.requestedById || approval.requestedBy,
    expenseApprovalId: approvalId,
  });
};

export const remove = async (id, currentUser) => {
  const doc = await prisma.staffSalaryTransaction.findFirst({
    where: { id: String(id), isDeleted: false },
  });
  if (!doc) throw new ApiError(404, "To'lov topilmadi");
  if (!isBranchAllowed(doc.branchId)) {
    throw new ApiError(403, "Bu filial bo'yicha amal bajarib bo'lmaydi");
  }

  // ── ⚠ ATOMAR (B21 bilan o'zgardi) ──
  // Soft-delete, `paidAmount` kamayishi va JURNAL STORNOSI BITTA
  // tranzaksiyada.
  //
  // ⚠ AUDIT YOZUVI TRANZAKSIYADAN TASHQARIDA qoldi — u kuzatuv izi,
  // pul harakati emas. Uni ichkariga kiritish audit yozuvidagi xatoni
  // PUL amalini bekor qiladigan darajaga ko'tarardi.
  await runFinanceTxn(async (tx) => {
    await tx.staffSalaryTransaction.update({
      where: { id: doc.id },
      data: { isDeleted: true, deletedAt: new Date(), deletedBy: actorId(currentUser) },
    });
    await payrollService.applyPaidDelta(doc.payrollId, -doc.amount, { tx });
    await financialTx.reverseByRef(
      { refModel: "StaffSalaryTransaction", refId: doc.id },
      currentUser,
      { tx, memo: "Storno: xodim maoshi bekor qilindi" },
    );
  });

  await auditService.record({
    employee: doc.employeeId,
    year: doc.year,
    month: doc.month,
    action: auditService.PAYROLL_AUDIT_ACTIONS.PAYMENT_REVERSED,
    targetType: "staffSalaryTransaction",
    targetId: doc.id,
    oldValue: { amount: doc.amount, method: doc.method, paidAt: doc.paidAt },
    actor: currentUser,
  });

  return { id: doc.id };
};

export const listByPayroll = async (payrollId) =>
  withLegacyIds(
    await prisma.staffSalaryTransaction.findMany({
      where: { payrollId: String(payrollId), isDeleted: false },
      orderBy: { paidAt: "desc" },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
  );
