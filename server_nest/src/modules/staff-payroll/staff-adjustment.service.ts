import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { ROLES } from '../../common/constants/permissions.js';
import { STAFF_OPENING_KINDS } from '../../common/constants/staff-payroll.js';
import { withLegacyId, withLegacyIds } from '../../common/utils/serialize.js';
import { parseLocalDay } from '../../common/utils/date.js';
import { BranchAccessService } from '../../common/rbac/branch-access.service.js';
import { StaffPayrollService } from './staff-payroll.service.js';
import { PayrollAuditService, PAYROLL_AUDIT_ACTIONS } from './payroll-audit.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * QO'LDA KIRITILADIGAN BONUS va JARIMA.
 *
 * ⚠ Bu yozuvlarga qayta hisoblash HECH QACHON tegmaydi — ular alohida
 * jadvalda. O'qituvchi modulida ayni himoya `recalc()` ning bitta `if`
 * qatoriga tayanadi; bu yerda bunday xavf yo'q.
 * ═══════════════════════════════════════════════════════════════════════════
 */

interface Actor { id?: string | null; _id?: string | null; firstName?: string; lastName?: string }
const actorId = (u?: Actor | null): string | null => u?.id || u?._id || null;

@Injectable()
export class StaffAdjustmentService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly payroll: StaffPayrollService,
    private readonly audit: PayrollAuditService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  private findPayroll(employeeId: string, year: number, month: number) {
    return this.prisma.staffPayroll.findUnique({
      where: {
        employeeId_year_month: { employeeId: String(employeeId), year, month },
      },
    });
  }

  async create(
    body: {
      employee: string; branchId?: string | null;
      year: number; month: number; kind: string;
      amount: number; reason: string; occurredAt?: string;
    },
    currentUser: Actor | null,
  ) {
    const employee = await this.prisma.user.findUnique({
      where: { id: String(body.employee) },
      select: { id: true, role: true, homeBranchId: true },
    });
    if (!employee) throw new ApiError(404, 'Xodim topilmadi');
    // ⚠ FILIAL QO'RIQCHISI — `body.employee` MIJOZDAN keladi. Bu PUL
    // YOZADIGAN yo'l: qo'riqchisiz A filial direktori B filial xodimiga
    // bonus (yoki jarima) yozib qo'ya olardi.
    await this.branchAccess.assertUserInBranchScope(employee.id);
    if (employee.role === ROLES.STUDENT) {
      throw new ApiError(400, "O'quvchiga bonus/jarima yozilmaydi");
    }

    const amount = Number(body.amount);
    if (!Number.isInteger(amount) || amount < 1) {
      throw new ApiError(400, "Summa musbat butun son bo'lishi kerak");
    }
    const reason = String(body.reason || '').trim();
    if (!reason) throw new ApiError(400, "Sabab ko'rsatilishi shart");

    // ⚠ O'ZGARMAS DAVR: yopilgan yoki to'langan oyga yozib bo'lmaydi —
    // bonus ham oyning yakuniy summasini o'zgartiradi. Rad etilgan
    // urinish AUDITGA tushadi.
    const target = await this.findPayroll(
      employee.id, Number(body.year), Number(body.month));
    await this.audit.assertMutable(target as never, {
      action: body.kind === 'penalty' ? 'penalty.add' : 'bonus.add',
      actor: currentUser,
      reason: body.reason,
    });

    const doc = await this.prisma.staffPayrollAdjustment.create({
      data: {
        employeeId: employee.id,
        branchId: body.branchId || employee.homeBranchId || null,
        year: Number(body.year),
        month: Number(body.month),
        kind: body.kind === 'penalty' ? 'penalty' : 'bonus',
        amount: amount as never,
        reason,
        occurredAt: parseLocalDay(body.occurredAt as string) || null,
        createdById: actorId(currentUser),
      } as never,
    });

    // Oy summasi darhol yangilansin. ⚠ `force` BERILMAYDI: yopilgan oy
    // yuqorida allaqachon rad etilgan, bu yerda uni chetlab o'tish
    // uchun sabab yo'q.
    await this.payroll.computePayroll(employee.id, doc.year, doc.month, {
      source: 'manual',
      actor: currentUser,
    });

    await this.audit.record({
      employee: employee.id,
      year: doc.year,
      month: doc.month,
      action:
        doc.kind === 'penalty'
          ? PAYROLL_AUDIT_ACTIONS.PENALTY_ADDED
          : PAYROLL_AUDIT_ACTIONS.BONUS_ADDED,
      targetType: 'adjustment',
      targetId: doc.id,
      newValue: { amount: doc.amount, kind: doc.kind },
      reason: doc.reason,
      actor: currentUser,
    });

    return withLegacyId(doc);
  }

  async remove(id: string, currentUser: Actor | null) {
    const doc = await this.prisma.staffPayrollAdjustment.findFirst({
      where: { id: String(id), isDeleted: false },
    });
    if (!doc) throw new ApiError(404, 'Yozuv topilmadi');

    // ⚠ BOSHLANG'ICH QOLDIQ O'CHIRILMAYDI — u bir marta kiritiladi va
    // o'zgartirilmaydi.
    //
    // Bu shunchaki qoida emas, IDEMPOTENTLIK sharti: o'chirish ruxsat
    // etilsa, "o'chirib qayta import qilish" yo'li ochilardi va o'sha
    // faylni ikkinchi marta yuklash pulni IKKI BARAVAR yozib qo'yardi.
    if (STAFF_OPENING_KINDS.includes(doc.kind)) {
      throw new ApiError(
        400,
        "Boshlang'ich qoldiqni o'chirib bo'lmaydi. Tuzatish uchun bonus yoki jarima qatori qo'shing",
      );
    }

    const target = await this.findPayroll(doc.employeeId, doc.year, doc.month);
    await this.audit.assertMutable(target as never, {
      action: 'adjustment.remove',
      actor: currentUser,
    });

    await this.prisma.staffPayrollAdjustment.update({
      where: { id: doc.id },
      data: { isDeleted: true, deletedAt: new Date(), deletedBy: actorId(currentUser) },
    });
    await this.payroll.computePayroll(doc.employeeId, doc.year, doc.month, {
      source: 'manual',
      actor: currentUser,
    });

    await this.audit.record({
      employee: doc.employeeId,
      year: doc.year,
      month: doc.month,
      action:
        doc.kind === 'penalty'
          ? PAYROLL_AUDIT_ACTIONS.PENALTY_REMOVED
          : PAYROLL_AUDIT_ACTIONS.BONUS_REMOVED,
      targetType: 'adjustment',
      targetId: doc.id,
      oldValue: { amount: doc.amount, kind: doc.kind, reason: doc.reason },
      actor: currentUser,
    });

    return { id: doc.id };
  }

  async listByEmployeeMonth(employeeId: string, year: number, month: number) {
    return withLegacyIds(
      await this.prisma.staffPayrollAdjustment.findMany({
        where: {
          employeeId: String(employeeId),
          year: Number(year),
          month: Number(month),
          isDeleted: false,
        },
        orderBy: { createdAt: 'desc' },
        include: {
          createdBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
    );
  }
}
