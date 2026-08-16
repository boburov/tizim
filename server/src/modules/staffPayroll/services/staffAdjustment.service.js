import prisma from "../../../config/prisma.js";
import ApiError from "../../../utils/ApiError.js";
import { ROLES } from "../../../constants/roles.js";
import { STAFF_OPENING_KINDS } from "../../../constants/staffPayroll.js";
import { withLegacyId, withLegacyIds } from "../../../utils/serialize.js";
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
 *
 * MONGO → PRISMA: { employee } → { employeeId }; doc.softDelete(by) →
 * update({ isDeleted, deletedAt, deletedBy }); (employeeId, year, month)
 * StaffPayroll'da HAQIQIY unique kalit, shuning uchun `findUnique`.
 */
const actorId = (u) => u?.id || u?._id || null;

const findPayroll = (employeeId, year, month) =>
  prisma.staffPayroll.findUnique({
    where: { employeeId_year_month: { employeeId: String(employeeId), year, month } },
  });

export const create = async (body, currentUser) => {
  const employee = await prisma.user.findUnique({
    where: { id: String(body.employee) },
    select: { id: true, role: true, homeBranchId: true },
  });
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
  const target = await findPayroll(employee.id, Number(body.year), Number(body.month));
  await auditService.assertMutable(target, {
    action: body.kind === "penalty" ? "penalty.add" : "bonus.add",
    actor: currentUser,
    reason: body.reason,
  });

  const doc = await prisma.staffPayrollAdjustment.create({
    data: {
      employeeId: employee.id,
      branchId: body.branchId || employee.homeBranchId || null,
      year: Number(body.year),
      month: Number(body.month),
      kind: body.kind === "penalty" ? "penalty" : "bonus",
      amount,
      reason,
      occurredAt: parseLocalDay(body.occurredAt) || null,
      createdById: actorId(currentUser),
    },
  });

  // Oy summasi darhol yangilansin - egasi natijani ko'radi. `force`
  // BERILMAYDI: yopilgan oy yuqorida allaqachon rad etilgan, bu yerda
  // uni chetlab o'tish uchun sabab yo'q.
  await payrollService.computePayroll(employee.id, doc.year, doc.month, {
    source: "manual",
    actor: currentUser,
  });

  await auditService.record({
    employee: employee.id,
    year: doc.year,
    month: doc.month,
    action:
      doc.kind === "penalty"
        ? auditService.PAYROLL_AUDIT_ACTIONS.PENALTY_ADDED
        : auditService.PAYROLL_AUDIT_ACTIONS.BONUS_ADDED,
    targetType: "adjustment",
    targetId: doc.id,
    newValue: { amount: doc.amount, kind: doc.kind },
    reason: doc.reason,
    actor: currentUser,
  });

  return withLegacyId(doc);
};

export const remove = async (id, currentUser) => {
  const doc = await prisma.staffPayrollAdjustment.findFirst({
    where: { id: String(id), isDeleted: false },
  });
  if (!doc) throw new ApiError(404, "Yozuv topilmadi");

  // BOSHLANG'ICH QOLDIQ O'CHIRILMAYDI - u bir marta kiritiladi va
  // o'zgartirilmaydi (qarang: models/openingBalance.model.js).
  //
  // Bu shunchaki qoida emas, IDEMPOTENTLIK sharti: o'chirish ruxsat
  // etilsa, "o'chirib qayta import qilish" yo'li ochilardi va o'sha
  // faylni ikkinchi marta yuklash pulni ikki baravar yozib qo'yardi.
  // Xato bo'lsa - tuzatuvchi bonus/jarima qatori yoziladi, izi qoladi.
  if (STAFF_OPENING_KINDS.includes(doc.kind)) {
    throw new ApiError(
      400,
      "Boshlang'ich qoldiqni o'chirib bo'lmaydi. Tuzatish uchun bonus yoki jarima qatori qo'shing",
    );
  }

  const target = await findPayroll(doc.employeeId, doc.year, doc.month);
  await auditService.assertMutable(target, {
    action: "adjustment.remove",
    actor: currentUser,
  });

  await prisma.staffPayrollAdjustment.update({
    where: { id: doc.id },
    data: { isDeleted: true, deletedAt: new Date(), deletedBy: actorId(currentUser) },
  });
  await payrollService.computePayroll(doc.employeeId, doc.year, doc.month, {
    source: "manual",
    actor: currentUser,
  });

  await auditService.record({
    employee: doc.employeeId,
    year: doc.year,
    month: doc.month,
    action:
      doc.kind === "penalty"
        ? auditService.PAYROLL_AUDIT_ACTIONS.PENALTY_REMOVED
        : auditService.PAYROLL_AUDIT_ACTIONS.BONUS_REMOVED,
    targetType: "adjustment",
    targetId: doc.id,
    oldValue: { amount: doc.amount, kind: doc.kind, reason: doc.reason },
    actor: currentUser,
  });

  return { id: doc.id };
};

export const listByEmployeeMonth = async (employeeId, year, month) =>
  withLegacyIds(
    await prisma.staffPayrollAdjustment.findMany({
      where: {
        employeeId: String(employeeId),
        year: Number(year),
        month: Number(month),
        isDeleted: false,
      },
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
  );
