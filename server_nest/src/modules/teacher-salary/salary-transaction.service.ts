import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { withLegacyId } from '../../common/utils/serialize.js';
import { EXPENSE_KINDS } from '../../common/constants/approvals.js';
import { branchFilter, isBranchAllowed } from '../../common/als/branch-context.js';
import { assertGroupActive } from '../../common/helpers/group-state.js';
import { parseLocalDay, localTodayMidnight } from '../../common/utils/date.js';
import { FINANCE_TXN_OPTIONS } from '../../common/utils/finance-txn.js';
import { ExpenseApprovalsService } from '../expense-approvals/expense-approvals.service.js';
import { FinancialTransactionService } from '../finance/financial-transaction.service.js';
import { TeacherSalaryService } from './teacher-salary.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O'QITUVCHIGA MAOSH TO'LOVI (chiqim) —
 * `salaryTransaction.service.js` KO'CHIRMASI.
 *
 * ⚠ QOLDIQDAN (`expected - paid`) ORTIQ to'lashga YO'L QO'YILMAYDI —
 * cheklov SHARTLI-ATOMIK update bilan tekshiriladi, shuning uchun
 * parallel double-click ham capdan o'tib keta OLMAYDI (C3).
 *
 * ⚠ UMUMIY TEKSHIRUVLAR: to'g'ridan-to'g'ri to'lovda ham, TASDIQLANGAN
 * so'rovni bajarishda ham AYNAN SHU qoidalar qo'llanadi. Tasdiq paytida
 * QAYTA chaqiriladi — so'rov berilgandan keyin guruh arxivlangan yoki
 * qoldiq o'zgargan bo'lishi mumkin.
 *
 * ⚠ `TeacherSalary` da `isDeleted` USTUNI YO'Q, `SalaryTransaction` da
 * esa BOR — shuning uchun filtrlar ASSIMETRIK.
 * ═══════════════════════════════════════════════════════════════════════════
 */
const actorId = (u: any) => u?.id || u?._id || null;

@Injectable()
export class SalaryTransactionService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly approvals: ExpenseApprovalsService,
    private readonly financialTx: FinancialTransactionService,
    private readonly salaries: TeacherSalaryService,
  ) {}

  private async validateSalaryPayment({
    salaryId, paidAt,
  }: { salaryId: string; paidAt?: unknown }) {
    const salary = await this.prisma.teacherSalary.findUnique({
      where: { id: String(salaryId) },
    });
    if (!salary) throw new ApiError(404, 'Maosh topilmadi');

    /**
     * ⚠ GURUHSIZ QATORLAR (markaz darajasi): fiksa oylik
     * (`kind:"base"`), KPI mukofoti, ushlanma va boshlang'ich qoldiq
     * guruhga BOG'LANMAYDI.
     *
     * Ilgari bu yerda guruh SHARTSIZ talab qilinardi va natijada markaz
     * darajasidagi HAR QANDAY qatorga to'lov "Guruh topilmadi" (404)
     * bilan rad etilardi — ya'ni fiksa oylikni tizim orqali TO'LAB
     * BO'LMASDI.
     */
    let group: Record<string, any> | null = null;
    if (salary.groupId) {
      group = await this.prisma.group.findUnique({
        where: { id: salary.groupId },
        select: {
          id: true, isActive: true, isDeleted: true, branchId: true, endDate: true,
        },
      });
      assertGroupActive(group as never);
    }

    /**
     * ⚠ FILIAL: guruh bo'lsa undan MEROS, bo'lmasa maosh qatorining
     * O'ZIDAN. Foydalanuvchi kontekstidan OLINMAYDI — owner "barcha
     * filiallar" rejimida to'lasa NOTO'G'RI filial yozilardi.
     */
    const branchId = group ? group.branchId : salary.branchId;
    if (!branchId) throw new ApiError(400, 'Maoshning filiali aniqlanmadi');

    const day = paidAt ? parseLocalDay(paidAt) : localTodayMidnight();
    if (!day) throw new ApiError(400, "Noto'g'ri to'lov sanasi");
    // Kelajak sanaga chiqim yozib bo'lmaydi (kassa kunlik hisobi
    // buzilmasin).
    if (day.getTime() > localTodayMidnight().getTime()) {
      throw new ApiError(400, "To'lov sanasi kelajakda bo'lishi mumkin emas");
    }

    return { salary, group, branchId, day };
  }

  /**
   * Balansni oshirib, tranzaksiyani yozadi. IKKALA yo'l ham shuni
   * ishlatadi.
   *
   * ⚠ TRANZAKSIYA CHEGARASI — B20 TUZATILDI (ikkala stekda BIR VAQTDA).
   *
   * ── QANDAY EDI ──
   *
   * Quyida `applyPaidDelta` ga `tx` UZATILARDI, lekin u ISHLATILMASDI:
   * imzo faqat `capToRemaining` ni olardi va xom SQL GLOBAL klientda
   * bajarilardi. Ya'ni BALANS YANGILANISHI SHU TRANZAKSIYADAN
   * TASHQARIDA qolardi va yuqoridagi "atomik: balans + tranzaksiya +
   * jurnal + audit BITTA amalda" degan da'vo AMALDA NOTO'G'RI edi.
   *
   * O'LCHANDI: tranzaksiya ataylab bekor qilinganda `paidAmount`
   * 0 → 50000 bo'lib QOLDI (rollback unga ta'sir qilmadi).
   *
   * OQIBATI: pastdagi `create`/`postTeacherPayroll` yiqilsa to'lov
   * qatori va jurnal ROLLBACK bo'lardi, `paidAmount` esa o'sganicha
   * qolardi — maosh "to'langan" ko'rinib, PUL YOZUVI bo'lmasdi.
   *
   * ── ENDI ──
   *
   * `applyPaidDelta` `tx` ni HURMAT QILADI, ya'ni yuqoridagi atomiklik
   * da'vosi HAQIQATAN bajariladi. `test/money-atomicity.test.mjs`
   * buni IKKALA stekda o'lchaydi.
   */
  private async writeSalaryTransaction({
    salary, branchId, day, amount, method, note, createdBy,
    expenseApprovalId = null,
  }: {
    salary: Record<string, any>;
    branchId: string;
    day: Date;
    amount: number;
    method: string;
    note?: string;
    createdBy?: string | null;
    expenseApprovalId?: string | null;
  }) {
    const created = await this.prisma.$transaction(async (tx) => {
      const updated = await this.salaries.applyPaidDelta(salary.id, amount, {
        capToRemaining: true,
        tx,
      });
      if (!updated) {
        const remaining = Math.max(
          0,
          (Number(salary.expectedAmount) || 0) - (Number(salary.paidAmount) || 0),
        );
        throw new ApiError(
          400, `To'lov qoldiqdan oshib ketadi (qoldiq: ${remaining} so'm)`,
        );
      }

      const row = await tx.salaryTransaction.create({
        data: {
          branchId,
          salaryId: salary.id,
          teacherId: salary.teacherId,
          groupId: salary.groupId,
          year: salary.year,
          month: salary.month,
          amount,
          // ⚠ `PaymentMethod` enumi — validator faqat cash|card ga
          // ruxsat beradi, lekin ustun kengroq (click/payme/uzcard).
          method: method as never,
          paidAt: day,
          note: note || '',
          createdById: createdBy ? String(createdBy) : null,
          expenseApprovalId: expenseApprovalId ? String(expenseApprovalId) : null,
        },
      });

      // ⚠ JURNAL — `financialTransaction` YAGONA nuqtasi orqali. Ilgari
      // u nomsiz `expense` edi va chiqim kategoriyalari hisobotida
      // markazning eng katta xarajati KO'RINMASDI.
      await this.financialTx.postTeacherPayroll(
        { salaryTransactionId: row.id },
        createdBy ? { id: createdBy } : null,
        { tx },
      );
      return row;
    }, FINANCE_TXN_OPTIONS);

    return withLegacyId(created);
  }

  async create(
    { salaryId, amount, method, paidAt, note }: Record<string, any>,
    currentUser: any,
  ) {
    const { salary, branchId, day } = await this.validateSalaryPayment({
      salaryId, paidAt,
    });

    /**
     * ⚠ FILIAL: boshqa filial o'qituvchisiga to'lab bo'lmaydi.
     *
     * Bu tekshiruv `validateSalaryPayment` ICHIDA emas, ATAYLAB shu
     * yerda: `executeApproved` ham o'sha funksiyani chaqiradi, lekin
     * tasdiqlash OWNER kontekstida bo'ladi va u yerda ko'lam boshqacha —
     * o'sha yo'l `approval.branchId` bilan ALOHIDA tekshiriladi.
     *
     * ⚠ Ahamiyati faqat KO'RINISH emas: har filialning O'Z chiqim limiti
     * bor, shuning uchun begona filialga to'lash o'sha filial limitini
     * ham AYLANIB O'TARDI.
     *
     * ⚠ 404 (403 EMAS) — mavjudligini oshkor qilmaymiz.
     */
    if (!isBranchAllowed(branchId)) {
      throw new ApiError(404, 'Maosh topilmadi');
    }

    // ⚠ CHIQIM LIMITI: summa filial limitidan oshsa — pul HOZIR
    // CHIQMAYDI, "tasdiq kutilmoqda" so'rovi yaratiladi. Balansga
    // TEGILMAYDI.
    const { needsApproval, threshold } = await this.approvals.checkExpenseLimit({
      branchId,
      amount,
      permissions: currentUser?.permissions,
    });

    if (needsApproval) {
      const teacher = await this.prisma.user.findUnique({
        where: { id: salary.teacherId },
        select: { firstName: true, lastName: true },
      });
      const approval = await this.approvals.createRequest({
        branchId,
        kind: EXPENSE_KINDS.SALARY_PAYMENT,
        amount,
        threshold,
        payload: {
          salaryId: String(salary.id), method, paidAt: day, note: note || '',
        },
        subjectName: teacher
          ? `${teacher.firstName} ${teacher.lastName || ''}`.trim()
          : "O'qituvchi",
        contextName: `${salary.month}/${salary.year} maosh`,
        currentUser,
      });
      // Chaqiruvchi (kontroller) buni ko'rib 202 qaytaradi.
      return { pendingApproval: true, approval };
    }

    return this.writeSalaryTransaction({
      salary, branchId, day, amount, method, note,
      createdBy: actorId(currentUser),
    });
  }

  /**
   * TASDIQLANGAN so'rovni bajaradi.
   *
   * ⚠ AYNAN BIR MARTA: avval shu so'rov bo'yicha tranzaksiya
   * bor-yo'qligi tekshiriladi. Bor bo'lsa — jarayon o'tgan safar
   * tranzaksiyani yozib, holatni yangilashga ULGURMAGAN. Qayta
   * to'lamaymiz, mavjudini qaytaramiz. Ikkinchi himoya —
   * `expenseApprovalId` qisman unique indeksi.
   *
   * ⚠ HALI HTTP ORQALI CHAQIRILMAYDI: `expense-approvals` `approve`
   * marshruti 501 bilan yopiq (bajaruvchilar to'liq ko'chmaguncha).
   */
  async executeApproved(approval: Record<string, any>) {
    const approvalId = String(approval.id ?? approval._id);
    const existing = await this.prisma.salaryTransaction.findFirst({
      where: { expenseApprovalId: approvalId },
    });
    if (existing) return withLegacyId(existing);

    const { salaryId, method, paidAt, note } = approval.payload || {};

    // ⚠ QAYTA VALIDATSIYA: so'rov va tasdiq orasida holat o'zgargan
    // bo'lishi mumkin (guruh arxivlangan, qoldiq kamaygan).
    // Payload'ga ISHONMAYMIZ.
    const { salary, branchId, day } = await this.validateSalaryPayment({
      salaryId, paidAt,
    });

    if (String(branchId) !== String(approval.branchId)) {
      throw new ApiError(400, "Maoshning filiali o'zgargan");
    }

    return this.writeSalaryTransaction({
      salary, branchId, day,
      amount: approval.amount,
      method, note,
      createdBy: approval.requestedById || approval.requestedBy,
      expenseApprovalId: approvalId,
    });
  }

  /**
   * To'lovni bekor qiladi (soft-delete), balansni ATOMIK kamaytiradi.
   *
   * ⚠ FILIAL: boshqa filial to'lovini bekor qilib bo'lmaydi
   * (`SalaryTransaction` da `branchId` bor → to'g'ridan-to'g'ri filtr).
   *
   * ── ⚠ ATOMAR (B21 bilan o'zgardi) ──
   * Soft-delete, `paidAmount` kamayishi va JURNAL STORNOSI BITTA
   * tranzaksiyada. Oradagi uzilish "pul qaytdi, lekin jurnal eski"
   * holatini qoldirardi.
   *
   * ── ⚠ JURNAL STORNO QILINADI ──
   * Ilgari jurnal TEGILMAY qolardi va bekor qilingan to'lov P&L da
   * ABADIY chiqim bo'lib turardi (kassa qoldig'i esa o'sha summa
   * qadar kam ko'rsatardi). Endi `reverseByRef` teskari yozuv
   * qo'shadi — asl yozuv O'ZGARMAS qoladi (`JOURNAL_IMMUTABLE`).
   */
  async remove(id: string, currentUser: any) {
    const trx = await this.prisma.salaryTransaction.findFirst({
      where: { id: String(id), ...branchFilter(), isDeleted: false },
    });
    if (!trx) throw new ApiError(404, 'Tranzaksiya topilmadi');

    await this.prisma.$transaction(async (tx) => {
      await tx.salaryTransaction.update({
        where: { id: trx.id },
        data: {
          isDeleted: true, deletedAt: new Date(), deletedBy: actorId(currentUser),
        },
      });
      await this.salaries.applyPaidDelta(trx.salaryId, -Number(trx.amount), {
        tx: tx as never,
      });
      await this.financialTx.reverseByRef(
        { refModel: 'SalaryTransaction', refId: trx.id },
        currentUser,
        { tx: tx as never, memo: "Storno: o'qituvchi maoshi bekor qilindi" },
      );
    }, FINANCE_TXN_OPTIONS);

    return { id: trx.id, _id: trx.id };
  }
}
