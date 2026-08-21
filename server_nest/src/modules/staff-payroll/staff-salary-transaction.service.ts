import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { withLegacyId, withLegacyIds } from '../../common/utils/serialize.js';
import { APPROVAL_KINDS } from '../../common/constants/approvals.js';
import { parseLocalDay, isFutureLocalDay } from '../../common/utils/date.js';
import { isBranchAllowed } from '../../common/als/branch-context.js';
import { FINANCE_TXN_OPTIONS } from '../../common/utils/finance-txn.js';
import { ExpenseApprovalsService } from '../expense-approvals/expense-approvals.service.js';
import { FinancialTransactionService } from '../finance/financial-transaction.service.js';
import { StaffPayrollService } from './staff-payroll.service.js';
import { PayrollAuditService, PAYROLL_AUDIT_ACTIONS } from './payroll-audit.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * XODIMGA MAOSH TO'LASH.
 *
 * O'qituvchi to'lovi bilan BIR XIL yo'ldan yuradi: filial chegarasidan
 * oshsa tasdiqqa tushadi (202), tasdiqlangach bir marta yoziladi.
 *
 * ⚠ O'QITUVCHI MODULIDAGI XATO BU YERDA TAKRORLANMAYDI:
 * `salaryTransaction.service` filialni GURUHDAN oladi va guruhsiz
 * qatorlar (markaz oyligi, bonus) uchun 404 qaytaradi — ya'ni ular
 * umuman to'lanmaydi. Bu yerda filial maosh QATORIDAN olinadi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

interface Actor {
  id?: string | null; _id?: string | null;
  permissions?: string[];
  firstName?: string; lastName?: string;
}
const actorId = (u?: Actor | null): string | null => u?.id || u?._id || null;

@Injectable()
export class StaffSalaryTransactionService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly payroll: StaffPayrollService,
    private readonly audit: PayrollAuditService,
    private readonly approvals: ExpenseApprovalsService,
    private readonly financialTx: FinancialTransactionService,
  ) {}

  private async validatePayment({ payrollId, paidAt }: {
    payrollId: unknown; paidAt?: unknown;
  }) {
    const payroll = await this.prisma.staffPayroll.findUnique({
      where: { id: String(payrollId) },
    });
    if (!payroll) throw new ApiError(404, 'Maosh qatori topilmadi');
    if (!payroll.branchId) {
      throw new ApiError(400, "Maosh qatorida filial yo'q - shartnomani tekshiring");
    }

    const day = parseLocalDay(paidAt as string) || new Date();
    if (isFutureLocalDay(day)) {
      throw new ApiError(400, "Kelajakdagi sana bilan to'lov yozib bo'lmaydi");
    }

    return { payroll, day };
  }

  /**
   * To'lovni yozish: AVVAL balansni atomar band qilamiz, keyin qatorni
   * yozamiz. Tartib ATAYLAB shunday — ikki marta bosilgan tugma
   * qoldiqdan oshib keta olmaydi (`capToRemaining`).
   *
   * ⚠⚠ B20 — TUZATILDI (ikkala stekda bir vaqtda). `applyPaidDelta`
   * ilgari `tx` ni QABUL QILMASDI: chaqiruv `{ capToRemaining: true,
   * tx }` shaklida edi-yu, argument jimgina tashlab yuborilardi va
   * `paidAmount` o'zgarishi tranzaksiyadan TASHQARIDA sodir bo'lardi.
   * Keyingi bosqich (`postStaffPayroll`, audit) yiqilsa qator va jurnal
   * qaytarilardi, `paidAmount` esa o'sganicha qolardi.
   *
   * Endi `tx` UZATILADI va xom `UPDATE` ayni shu tranzaksiyada
   * bajariladi — rollback `paidAmount` ni ham qaytaradi.
   * `test/staff-payroll-atomicity.test.mjs` da o'lchangan.
   */
  private async writeTransaction({
    payroll, day, amount, method, note, createdBy, expenseApprovalId = null,
  }: {
    payroll: { id: string; branchId: string | null; employeeId: string;
      year: number; month: number; finalAmount?: unknown; paidAmount?: unknown };
    day: Date;
    amount: number;
    method: string;
    note?: string;
    createdBy: string | null;
    expenseApprovalId?: string | null;
  }) {
    // ── ATOMIK (o'qituvchi maoshi bilan bir xil sabab) ──
    // Tranzaksiya, jurnal, moliyaviy audit va payroll auditi — hammasi
    // bitta tranzaksiyada.
    const created = await this.prisma.$transaction(async (tx) => {
      const updated = await this.payroll.applyPaidDelta(payroll.id, amount, {
        capToRemaining: true,
        tx: tx as never,
      });
      if (!updated) {
        const remaining = Math.max(
          0,
          ((payroll.finalAmount as unknown as number) || 0) -
            ((payroll.paidAmount as unknown as number) || 0),
        );
        throw new ApiError(
          400,
          `To'lov qoldiqdan oshib ketadi (qoldiq: ${remaining} so'm)`,
        );
      }

      const row = await tx.staffSalaryTransaction.create({
        data: {
          branchId: payroll.branchId as string,
          payrollId: payroll.id,
          employeeId: payroll.employeeId,
          year: payroll.year,
          month: payroll.month,
          amount: amount as never,
          method: method as never,
          paidAt: day,
          note: note || '',
          createdById: createdBy ? String(createdBy) : null,
          expenseApprovalId: expenseApprovalId ? String(expenseApprovalId) : null,
        } as never,
      });

      await this.financialTx.postStaffPayroll(
        { staffSalaryTransactionId: row.id },
        createdBy ? { id: createdBy } : null,
        { tx: tx as never },
      );

      // ⚠ PAYROLL AUDITI HAM SHU TRANZAKSIYADA. Ilgari u jurnal
      // yozuvidan keyin, lekin `catch` ichida edi — ya'ni audit yiqilsa
      // balans qaytarilardi. Endi u tranzaksiyaning bir qismi: maosh
      // to'lovi AUDIT IZISIZ qolishi mumkin emas.
      await this.audit.record({
        employee: payroll.employeeId,
        year: payroll.year,
        month: payroll.month,
        action: PAYROLL_AUDIT_ACTIONS.PAID,
        targetType: 'staffSalaryTransaction',
        targetId: row.id,
        oldValue: { paidAmount: (payroll.paidAmount as unknown as number) || 0 },
        newValue: {
          paidAmount: ((payroll.paidAmount as unknown as number) || 0) + amount,
          amount,
          method,
        },
        reason: note || '',
        actor: createdBy ? { id: createdBy, _id: createdBy } : null,
        tx,
      });

      return row;
    }, FINANCE_TXN_OPTIONS);

    return withLegacyId(created);
  }

  async create(
    body: {
      payrollId: string; amount: number; method: string;
      paidAt?: string; note?: string; employeeName?: string; requestNote?: string;
    },
    currentUser: Actor | null,
  ): Promise<unknown> {
    const { payroll, day } = await this.validatePayment({
      payrollId: body.payrollId,
      paidAt: body.paidAt,
    });

    if (!isBranchAllowed(payroll.branchId)) {
      throw new ApiError(403, "Bu filial bo'yicha amal bajarib bo'lmaydi");
    }

    const amount = Number(body.amount);
    const { needsApproval, threshold } = await this.approvals.checkExpenseLimit({
      branchId: payroll.branchId as string,
      amount,
      permissions: currentUser?.permissions,
    });

    if (needsApproval) {
      const approval = await this.approvals.createRequest({
        branchId: payroll.branchId as string,
        kind: APPROVAL_KINDS.STAFF_SALARY_PAYMENT,
        amount,
        threshold,
        payload: {
          payrollId: String(payroll.id),
          method: body.method,
          paidAt: day,
          note: body.note || '',
        } as never,
        subjectName: body.employeeName || 'Xodim maoshi',
        contextName: `${payroll.month}/${payroll.year} maosh`,
        requestNote: body.requestNote,
        currentUser: currentUser as never,
      });
      return { pendingApproval: true, approval };
    }

    return this.writeTransaction({
      payroll: payroll as never,
      day,
      amount,
      method: body.method,
      note: body.note,
      createdBy: actorId(currentUser),
    });
  }

  /**
   * Tasdiqlangan to'lovni bajarish.
   *
   * ⚠ IDEMPOTENT (uch qatlam): (1) mavjud qatorni qaytarish, (2) qisman
   * unique indeks `expenseApprovalId` bo'yicha, (3) `capToRemaining`.
   * Payload ISHONCHSIZ deb qaraladi — hamma tekshiruv qaytadan
   * yuriladi, chunki so'rov va tasdiq orasida holat o'zgargan bo'lishi
   * mumkin.
   */
  async executeApproved(approval: {
    id?: string; _id?: string; branchId?: string;
    amount?: unknown; payload?: Record<string, unknown>;
    requestedById?: string | null; requestedBy?: string | null;
  }) {
    const approvalId = String(approval.id ?? approval._id);
    const existing = await this.prisma.staffSalaryTransaction.findFirst({
      where: { expenseApprovalId: approvalId },
    });
    if (existing) return withLegacyId(existing);

    const { payroll, day } = await this.validatePayment({
      payrollId: approval.payload?.payrollId,
      paidAt: approval.payload?.paidAt,
    });

    if (String(payroll.branchId) !== String(approval.branchId)) {
      throw new ApiError(400, "Maosh qatorining filiali o'zgargan");
    }

    return this.writeTransaction({
      payroll: payroll as never,
      day,
      amount: approval.amount as unknown as number,
      method: (approval.payload?.method as string) || 'cash',
      note: (approval.payload?.note as string) || '',
      createdBy: (approval.requestedById || approval.requestedBy) as string | null,
      expenseApprovalId: approvalId,
    });
  }

  async remove(id: string, currentUser: Actor | null) {
    const doc = await this.prisma.staffSalaryTransaction.findFirst({
      where: { id: String(id), isDeleted: false },
    });
    if (!doc) throw new ApiError(404, "To'lov topilmadi");
    if (!isBranchAllowed(doc.branchId)) {
      throw new ApiError(403, "Bu filial bo'yicha amal bajarib bo'lmaydi");
    }

    await this.prisma.staffSalaryTransaction.update({
      where: { id: doc.id },
      data: { isDeleted: true, deletedAt: new Date(), deletedBy: actorId(currentUser) },
    });
    await this.payroll.applyPaidDelta(
      doc.payrollId, -(doc.amount as unknown as number));

    await this.audit.record({
      employee: doc.employeeId,
      year: doc.year,
      month: doc.month,
      action: PAYROLL_AUDIT_ACTIONS.PAYMENT_REVERSED,
      targetType: 'staffSalaryTransaction',
      targetId: doc.id,
      oldValue: { amount: doc.amount, method: doc.method, paidAt: doc.paidAt },
      actor: currentUser,
    });

    return { id: doc.id };
  }

  async listByPayroll(payrollId: string) {
    return withLegacyIds(
      await this.prisma.staffSalaryTransaction.findMany({
        where: { payrollId: String(payrollId), isDeleted: false },
        orderBy: { paidAt: 'desc' },
        include: {
          createdBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
    );
  }
}
