import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { ROLES } from '../../common/constants/permissions.js';
import { APPROVAL_KINDS } from '../../common/constants/approvals.js';
import { parseLocalDay, localTodayMidnight } from '../../common/utils/date.js';
import { branchFilter } from '../../common/als/branch-context.js';
import { BranchAccessService } from '../../common/rbac/branch-access.service.js';
import { withLegacyId, withLegacyIds } from '../../common/utils/serialize.js';
import { FINANCE_TXN_OPTIONS } from '../../common/utils/finance-txn.js';
import { FinancialTransactionService } from '../finance/index.js';
import { StudentPaymentService } from '../finance/index.js';
import { ExpenseApprovalsService } from '../expense-approvals/index.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O'QUVCHI DEPOZITI (oldindan to'lov / garov) —
 * `deposits/services/deposit.service.js` NING KO'CHIRMASI.
 *
 * ── BALANS ATOMIKLIGI (eng muhim invariant) ──
 *
 * Yechishda `balance >= -delta` sharti YOZUV BILAN BIR AMALDA bajarilishi
 * SHART. Prisma'ning `update({ increment })` da `where` faqat unique
 * maydonlarni qabul qiladi, ya'ni shartni u yerga qo'yib bo'lmaydi;
 * `updateMany` esa yangilangan qatorni qaytarmaydi. Shuning uchun shartli
 * yo'l XOM SQL bilan yozilgan — `RETURNING` orqali yangi balans darhol
 * olinadi va "o'qi → tekshir → yoz" poygasi UMUMAN paydo bo'lmaydi.
 *
 * ⚠ BU YO'LNI PRISMA'GA "SODDALASHTIRISH" MUMKIN EMAS: o'sha poyga
 * o'quvchining balansini manfiyga tushirardi.
 *
 * ── PUL YOZISHNING YAGONA NUQTASI ──
 *
 * Har bir pul harakati `FinancialTransactionService` orqali jurnalga
 * tushadi (`postDepositTopup` / `postDepositWithdraw` / `postDepositApply`).
 * Buxgalteriya mantig'i BU YERDA QAYTA YOZILMAYDI.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const SAFE_STUDENT_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  username: true,
  phone: true,
} as const;

@Injectable()
export class DepositsService {
  private readonly logger = new Logger('Deposits');

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly branchAccess: BranchAccessService,
    private readonly financialTx: FinancialTransactionService,
    private readonly payments: StudentPaymentService,
    private readonly approvals: ExpenseApprovalsService,
  ) {}

  private db(tx?: any): any {
    return tx || (this.prisma as unknown as any);
  }

  /**
   * Chaqiruvchi ochiq tranzaksiya bersa — UNGA QO'SHILAMIZ, aks holda
   * o'zimiz ochamiz.
   *
   * ⚠ NEGA MUHIM: Prisma'da ICHMA-ICH interaktiv tranzaksiya YO'Q. Ochiq
   * tranzaksiya ichida `$transaction()` chaqirilsa u ALOHIDA ulanishda,
   * ALOHIDA tranzaksiya bo'lib ochiladi — tashqi amal qaytarilsa ichkisi
   * KOMMIT bo'lgancha qolardi (aynan biz yopmoqchi bo'lgan tuynuk),
   * ustiga ikkalasi bir xil qatorni qulflasa o'z-o'zini bloklab qo'yardi.
   */
  private withTxn<T>(tx: any, work: (t: any) => Promise<T>): Promise<T> {
    return tx
      ? work(tx)
      : (this.prisma as any).$transaction(work, FINANCE_TXN_OPTIONS);
  }

  private actorId(u: any): string | null {
    return u?.id || u?._id || null;
  }

  private async ensureStudent(studentId: string, { tx }: { tx?: any } = {}) {
    const student = await this.db(tx).user.findFirst({
      where: { id: String(studentId), role: ROLES.STUDENT, isDeleted: false },
      select: { id: true, firstName: true, lastName: true, homeBranchId: true },
    });
    if (!student) throw new ApiError(400, "O'quvchi topilmadi");
    return student;
  }

  /**
   * O'quvchining depozit hisobi (yo'q bo'lsa yaratiladi).
   *
   * ── ⚠ NEGA `upsert` EMAS, `ON CONFLICT DO NOTHING` ──
   *
   * PostgreSQL'da tranzaksiya ichidagi HAR QANDAY xato butun tranzaksiyani
   * ABORT holatiga o'tkazadi — undan keyingi har bir so'rov "current
   * transaction is aborted" bilan rad etiladi. Ya'ni `catch (P2002) →
   * qayta o'qish` naqshi tranzaksiya ICHIDA ISHLAMAYDI.
   *
   * Express'da bu aynan ko'rindi: to'lov bitta tranzaksiyaga ko'chgach,
   * 10 ta parallel to'lovdan bittasi `studentDeposit.findUnique()` bilan
   * rad etila boshladi. Pul yo'qolmasdi (tranzaksiya to'liq qaytardi),
   * lekin so'rov bekorga yiqilardi.
   *
   * TO'G'RI YECHIM — xatoni USHLASH emas, UMUMAN CHIQARMASLIK.
   *
   * ⚠ `updatedAt` OCHIQ berilishi shart: u Prisma tomonidagi `@updatedAt`
   * bo'lgani uchun bazada DEFAULT'i YO'Q (`createdAt` dan farqli).
   */
  async getOrCreate(student: string, { tx }: { tx?: any } = {}) {
    const studentId = String(student);
    const client = this.db(tx);

    await client.$executeRaw`
      INSERT INTO "student_deposits" ("studentId", "balance", "createdAt", "updatedAt")
      VALUES (${studentId}, 0, NOW(), NOW())
      ON CONFLICT ("studentId") DO NOTHING
    `;
    return client.studentDeposit.findUnique({ where: { studentId } });
  }

  async balanceFor(student: string): Promise<number> {
    const dep = await this.prisma.studentDeposit.findUnique({
      where: { studentId: String(student) },
      select: { balance: true },
    });
    return (dep?.balance as unknown as number) || 0;
  }

  /**
   * Balansni ATOMIK o'zgartiradi.
   *
   * `delta < 0` (yechish) bo'lsa balans yetarli bo'lishi SHART — aks holda
   * qator yangilanmaydi (`null`) va chaqiruvchi xato beradi.
   */
  private async applyBalanceDelta(
    depositId: string,
    delta: number,
    { tx }: { tx?: any } = {},
  ): Promise<any> {
    const client = this.db(tx);
    const id = String(depositId);
    const d = Number(delta) || 0;

    // Kamaytirish: shart va yozuv BITTA amalda. `RETURNING` yangi balansni
    // beradi, ya'ni qo'shimcha o'qish (va u bilan birga poyga) shart emas.
    if (d < 0) {
      const rows = await client.$queryRaw`
        UPDATE "student_deposits"
        SET "balance" = "balance" + ${d}::numeric,
            "updatedAt" = NOW()
        WHERE "id" = ${id}
          AND "balance" >= ${-d}::numeric
        RETURNING "id", "studentId", "balance"
      `;
      return rows.length ? rows[0] : null;
    }

    // Oshirish: shart yo'q, Prisma'ning atomik `increment` i yetarli.
    return client.studentDeposit.update({
      where: { id },
      data: { balance: { increment: d } },
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // DEPOZIT QO'SHISH / YECHISH
  // ══════════════════════════════════════════════════════════════════

  /**
   * `isOpening` — boshlang'ich qoldiq importi (`openingBalance` chaqiradi).
   *
   * ⚠ YOZISH YO'LI ATAYLAB SHU YAGONA FUNKSIYA: balansni oshirish, jurnal
   * yozuvi va `autoApply` bir joyda turibdi. Import uchun alohida nusxa
   * yozilsa, ertaga shu uch qadamdan biri o'zgarib, ikkinchi nusxa eskirib
   * qolardi.
   */
  async topup(
    studentId: string,
    {
      amount,
      method,
      paidAt,
      note,
      isOpening = false,
    }: {
      amount: number;
      method?: string;
      paidAt?: Date | string;
      note?: string;
      isOpening?: boolean;
    },
    currentUser: any,
    { tx: outerTx }: { tx?: any } = {},
  ) {
    // FILIAL: o'quvchining filiali (`ensureStudent` allaqachon yozuvni oladi).
    const student = await this.ensureStudent(studentId, { tx: outerTx });
    const amt = Number(amount);
    if (!amt || amt <= 0) throw new ApiError(400, "Summa noto'g'ri");
    const day = paidAt ? parseLocalDay(paidAt) : localTodayMidnight();
    if (!day) throw new ApiError(400, "Noto'g'ri sana");
    if (day.getTime() > localTodayMidnight().getTime()) {
      throw new ApiError(400, "Sana kelajakda bo'lishi mumkin emas");
    }

    const deposit = await this.getOrCreate(student.id, { tx: outerTx });

    // ── ATOMIK: balans + tranzaksiya + jurnal + audit ──
    // JURNAL: pul kassaga kirdi, lekin DAROMAD EMAS — o'quvchining
    // depoziti (majburiyat).
    const txn = await this.withTxn(outerTx, async (tx) => {
      const updated = await this.applyBalanceDelta(deposit.id, amt, { tx });
      const row = await tx.depositTransaction.create({
        data: {
          branchId: student.homeBranchId || null,
          studentId: deposit.studentId,
          depositId: deposit.id,
          type: 'topup',
          amount: amt,
          method: method || 'cash',
          balanceAfter: updated.balance,
          note: note || '',
          isOpening: Boolean(isOpening),
          paidAt: day,
          createdById: this.actorId(currentUser),
        },
      });
      await this.financialTx.postDepositTopup(
        { depositTransactionId: row.id },
        currentUser,
        { tx },
      );
      return row;
    });

    // Pul qo'yilishi bilan mavjud qarzlarni darhol qoplaymiz (eng eskisidan).
    // TASHQI TRANZAKSIYA bo'lsa — o'sha tranzaksiyada.
    await this.autoApply(student.id, currentUser, { tx: outerTx });

    // `txn` — chaqiruvchi audit izini yozishi uchun (`openingBalance`
    // `materializedRefs`). Depozit yozuvi esa avvalgidek qaytadi.
    const fresh = await this.getOrCreate(student.id, { tx: outerTx });
    const out: any = withLegacyId(fresh);
    out.$lastTransactionId = txn.id;
    return out;
  }

  /**
   * Yechish uchun umumiy tekshiruvlar.
   *
   * ⚠ To'g'ridan-to'g'ri yo'lda ham, TASDIQLANGAN so'rovni bajarishda ham
   * AYNAN SHU qoidalar qo'llanadi — aks holda tasdiq oqimi validatsiyani
   * aylanib o'tish yo'liga aylanardi.
   */
  private async validateWithdraw(
    studentId: string,
    { amount, paidAt }: { amount: number; paidAt?: Date | string },
  ) {
    const student = await this.ensureStudent(studentId);
    const amt = Number(amount);
    if (!amt || amt <= 0) throw new ApiError(400, "Summa noto'g'ri");
    const day = paidAt ? parseLocalDay(paidAt) : localTodayMidnight();
    if (!day) throw new ApiError(400, "Noto'g'ri sana");
    if (day.getTime() > localTodayMidnight().getTime()) {
      throw new ApiError(400, "Sana kelajakda bo'lishi mumkin emas");
    }
    return { student, amt, day };
  }

  /** Balansni kamaytirib, jurnal yozuvini yozadi. */
  private async writeWithdraw({
    studentId,
    student,
    amt,
    day,
    method,
    note,
    createdBy,
    expenseApprovalId = null,
  }: {
    studentId: string;
    student: any;
    amt: number;
    day: Date;
    method?: string;
    note?: string;
    createdBy?: string | null;
    expenseApprovalId?: string | null;
  }) {
    const deposit = await this.getOrCreate(studentId);

    // ── ATOMIK: qo'lda rollback O'RNIGA tranzaksiya ──
    // Express'da ilgari balans kamaytirilib, xato bo'lsa `catch` da
    // qaytarilardi; qaytarishning O'ZI yiqilsa o'quvchining puli
    // yo'qolgandek qolardi.
    await (this.prisma as any).$transaction(async (tx: any) => {
      const updated = await this.applyBalanceDelta(deposit.id, -amt, { tx });
      if (!updated) {
        throw new ApiError(
          400,
          `To'lovda yetarli mablag' yo'q (balans: ${deposit.balance} so'm)`,
        );
      }
      const row = await tx.depositTransaction.create({
        data: {
          branchId: student.homeBranchId || null,
          studentId: deposit.studentId,
          depositId: deposit.id,
          type: 'withdraw',
          amount: amt,
          method: method || 'cash',
          balanceAfter: updated.balance,
          note: note || '',
          paidAt: day,
          createdById: createdBy ? String(createdBy) : null,
          expenseApprovalId: expenseApprovalId ? String(expenseApprovalId) : null,
        },
      });

      // JURNAL: majburiyat kamaydi, pul kassadan chiqdi.
      await this.financialTx.postDepositWithdraw(
        { depositTransactionId: row.id },
        createdBy ? ({ id: createdBy } as any) : null,
        { tx },
      );
      return row;
    }, FINANCE_TXN_OPTIONS);

    return withLegacyId(await this.getOrCreate(studentId));
  }

  async withdraw(
    studentId: string,
    {
      amount,
      method,
      paidAt,
      note,
    }: { amount: number; method?: string; paidAt?: Date | string; note?: string },
    currentUser: any,
  ): Promise<any> {
    // ⚠ FILIAL QO'RIQCHISI — `studentId` MIJOZDAN keladi. Bu PUL
    // CHIQARADIGAN yo'l: qo'riqchisiz A filial direktori B filial
    // o'quvchisining depozitidan pul yechib olardi.
    await this.branchAccess.assertUserInBranchScope(studentId);
    const { student, amt, day } = await this.validateWithdraw(studentId, {
      amount,
      paidAt,
    });

    // CHIQIM LIMITI: limitdan oshsa pul HOZIR chiqmaydi — tasdiq so'raladi.
    const { needsApproval, threshold } = await this.approvals.checkExpenseLimit({
      branchId: student.homeBranchId,
      amount: amt,
      permissions: currentUser?.permissions,
    });

    if (needsApproval) {
      const approval = await this.approvals.createRequest({
        branchId: student.homeBranchId,
        kind: APPROVAL_KINDS.DEPOSIT_WITHDRAW,
        amount: amt,
        threshold,
        payload: {
          studentId: String(student.id),
          method: method || 'cash',
          paidAt: day,
          note: note || '',
        },
        subjectName: `${student.firstName} ${student.lastName || ''}`.trim(),
        contextName: 'Depozitdan yechish',
        currentUser,
      });
      return { pendingApproval: true, approval };
    }

    return this.writeWithdraw({
      studentId: student.id,
      student,
      amt,
      day,
      method,
      note,
      createdBy: this.actorId(currentUser),
    });
  }

  /**
   * TASDIQLANGAN yechishni bajaradi (`expense-approvals` dan chaqiriladi).
   *
   * ⚠ AYNAN BIR MARTA KAFOLATI: qisman unique indeks
   * `(expenseApprovalId) WHERE expenseApprovalId IS NOT NULL` — ya'ni bir
   * tasdiq bo'yicha ikkinchi yechish BAZADA ham to'siladi. Quyidagi
   * tekshiruv faqat TEZ YO'L, haqiqiy kafolat indeksda.
   */
  async executeApprovedWithdraw(approval: any) {
    const approvalId = String(approval.id ?? approval._id);
    const existing = await this.prisma.depositTransaction.findFirst({
      where: { expenseApprovalId: approvalId },
    });
    if (existing) return withLegacyId(existing);

    const { studentId, method, paidAt, note } = (approval.payload || {}) as any;

    // QAYTA VALIDATSIYA: so'rovdan keyin balans kamaygan bo'lishi mumkin.
    const { student, amt, day } = await this.validateWithdraw(studentId, {
      amount: approval.amount,
      paidAt,
    });

    await this.writeWithdraw({
      studentId: student.id,
      student,
      amt,
      day,
      method,
      note,
      createdBy: approval.requestedById || approval.requestedBy,
      expenseApprovalId: approvalId,
    });

    const created = await this.prisma.depositTransaction.findFirst({
      where: { expenseApprovalId: approvalId },
    });
    return created ? withLegacyId(created) : null;
  }
  // ══════════════════════════════════════════════════════════════════
  // QOPLAMA (depozit → oylik plan)
  // ══════════════════════════════════════════════════════════════════

  /**
   * Bitta planga depozitdan qoplaydi. Haqiqatda qo'llangan summani
   * qaytaradi (cap tufayli kamroq bo'lishi mumkin).
   *
   * ⚠ ATOMIK: depozit balansi + plan balansi + tranzaksiya + jurnal.
   * Express'da bu eng ko'p bosqichli amal edi va rollback IKKI POG'ONALI
   * edi (avval plan, keyin balans) — ikkalasidan biri yiqilsa pul yarim
   * holatda qolardi.
   */
  private async applyToPayment(
    deposit: any,
    payment: any,
    amount: number,
    currentUser: any,
    { tx: outerTx }: { tx?: any } = {},
  ): Promise<number> {
    const remaining = Math.max(
      0,
      (payment.expectedAmount || 0) - (payment.paidAmount || 0),
    );
    const amt = Math.min(amount, remaining);
    if (amt <= 0) return 0;

    const done = await this.withTxn(outerTx, async (tx) => {
      const balUpd = await this.applyBalanceDelta(deposit.id, -amt, { tx });
      if (!balUpd) return 0;

      const planUpd = await this.payments.applyPaidDelta(payment.id, amt, {
        capToRemaining: true,
        tx,
      });
      if (!planUpd) return 0;

      const applied = await tx.paymentTransaction.create({
        data: {
          // FILIAL: oylik plandan meros.
          branchId: payment.branchId,
          paymentId: payment.id,
          studentId: payment.studentId,
          groupId: payment.groupId,
          year: payment.year,
          month: payment.month,
          amount: amt,
          source: 'deposit',
          method: 'cash',
          paidAt: localTodayMidnight(),
          note: "To'lovdan qoplandi",
          createdById: this.actorId(currentUser),
        },
      });

      // JURNAL: PUL HARAKATI YO'Q — depozit majburiyati daromadga
      // aylanadi. Kassa qoldig'i o'zgarmaydi (pul to'ldirishda kirgan).
      await this.financialTx.postDepositApply(
        { paymentTransactionId: applied.id },
        currentUser,
        { tx },
      );
      return amt;
    });

    // 0 → parallel so'rov ulgurdi yoki mablag' yetmadi (tranzaksiya hech
    // narsa yozmadi, qaytarish shart emas).
    return done;
  }

  /** Qoldiq (`expected > paid`) planlar sharti — ustunni ustunga solishtirish. */
  private outstanding() {
    return {
      expectedAmount: { gt: (this.prisma as any).studentPayment.fields.paidAmount },
    };
  }

  /**
   * O'quvchi depozitidan barcha qoldiq planlarni ENG ESKISIDAN qoplaydi.
   *
   * ⚠ TARTIB QAT'IY (`year, month, createdAt`): qulflash tartibi barcha
   * parallel so'rovlarda BIR XIL bo'lishi kerak, aks holda ikki so'rov
   * bir-birining qatorini kutib qolishi (deadlock) mumkin edi.
   *
   * Yomon qarz (write-off) yopilgan — depozitdan qoplanmaydi.
   */
  async autoApply(
    studentId: string,
    currentUser: any,
    { tx }: { tx?: any } = {},
  ): Promise<{ applied: number }> {
    const client = this.db(tx);
    const deposit = await this.getOrCreate(studentId, { tx });
    if ((deposit.balance || 0) <= 0) return { applied: 0 };

    const plans = await client.studentPayment.findMany({
      where: {
        studentId: deposit.studentId,
        writtenOff: false,
        ...this.outstanding(),
      },
      orderBy: [{ year: 'asc' }, { month: 'asc' }, { createdAt: 'asc' }],
    });

    let applied = 0;
    for (const plan of plans) {
       
      const fresh = await client.studentDeposit.findUnique({
        where: { id: deposit.id },
      });
      if ((fresh?.balance || 0) <= 0) break;
       
      const used = await this.applyToPayment(
        fresh,
        plan,
        fresh.balance,
        currentUser,
        { tx },
      );
      applied += used;
    }
    return { applied };
  }

  /** Berilgan oyda plani + depoziti bor o'quvchilarga `autoApply` (oylik job hook). */
  async autoApplyForMonth(year: number, month: number) {
    const rows = await this.prisma.studentPayment.findMany({
      where: { year, month, writtenOff: false, ...(this.outstanding() as any) },
      select: { studentId: true },
      distinct: ['studentId'],
    });
    const studentIds = rows.map((r) => r.studentId);

    let applied = 0;
    for (const sid of studentIds) {
      try {
         
        const r = await this.autoApply(sid, null);
        applied += r.applied;
      } catch (err) {
        this.logger.warn(
          `Depozit avto-qoplash xatosi (student=${sid}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }
    return { students: studentIds.length, applied };
  }

  /** Bitta refund yozuvi: plan.paidAmount -= take, balans += take, jurnal. */
  private async refundOverpayChunk(
    deposit: any,
    planId: string,
    take: number,
    note: string,
  ) {
    await this.payments.applyPaidDelta(planId, -take);
    const balUpd = await this.applyBalanceDelta(deposit.id, take);
    if (!balUpd) throw new ApiError(500, "To'lovga qaytarib bo'lmadi");
    await this.prisma.depositTransaction.create({
      data: {
        // FILIAL: bu yerda o'quvchi yozuvi yuklanmagan — qidirib olamiz.
        branchId: await this.branchAccess.resolveBranchFromUser(deposit.studentId),
        studentId: deposit.studentId,
        depositId: deposit.id,
        type: 'refund',
        amount: take,
        balanceAfter: balUpd.balance,
        note,
        paidAt: localTodayMidnight(),
      } as any,
    });
  }

  /**
   * Plan kamayganda (`expected < paid`) ortiqcha to'lovni depozitga
   * qaytaradi. `recalc` dan KEYIN best-effort chaqiriladi.
   *
   * TARTIB MUHIM: avval DEPOZIT-qoplama tranzaksiyalari (faqat kerakli
   * ulush — QISMAN reverse, fantom pul YARATMAYMIZ), yetmasa qolgan
   * ortiqcha to'g'ridan-to'g'ri to'lov ham depozitga qaytadi.
   *
   * `capAmount` berilsa — ortiqcha to'lov shu chegaraga nisbatan
   * o'lchanadi (dars-asosli accrual'da TO'LIQ-OY obligatsiyasi), aks holda
   * `plan.expectedAmount` ga nisbatan. Bu AVANSNI (butun oy narxigacha
   * to'langan) depozitga qaytarmaslik uchun kerak.
   */
  async reconcileDepositOverpay(
    paymentId: string,
    { capAmount }: { capAmount?: number } = {},
  ): Promise<void> {
    const plan = await this.prisma.studentPayment.findUnique({
      where: { id: String(paymentId) },
    });
    if (!plan) return;
    const cap = capAmount != null ? capAmount : (plan.expectedAmount as any) || 0;
    const excess = ((plan.paidAmount as any) || 0) - cap;
    if (excess <= 0) return;

    const deposit = await this.getOrCreate(plan.studentId);
    let reversed = 0;

    // 1) Depozit-qoplama tranzaksiyalarini qisman reverse (eng yangidan).
    const depositTxns = await this.prisma.paymentTransaction.findMany({
      where: { paymentId: plan.id, source: 'deposit', isDeleted: false },
      orderBy: { createdAt: 'desc' },
    });

    for (const txn of depositTxns) {
      if (reversed >= excess) break;
      const take = Math.min(txn.amount as any, excess - reversed);
      if (take >= (txn.amount as any)) {
        // Butun tranzaksiya — o'chiramiz.
         
        await this.prisma.paymentTransaction.update({
          where: { id: txn.id },
          data: { isDeleted: true, deletedAt: new Date() },
        });
      } else {
        // Qisman — faqat ortiqcha ulushni yechamiz, qolgani qoplama bo'lib qoladi.
         
        await this.prisma.paymentTransaction.update({
          where: { id: txn.id },
          data: { amount: { decrement: take } },
        });
      }
       
      await this.refundOverpayChunk(
        deposit,
        plan.id,
        take,
        "Oylik to'lov kamayishi - to'lovga qaytarildi",
      );
      reversed += take;
    }

    // 2) Qolgan ortiqcha to'g'ridan-to'g'ri (cash) to'lov — u ham depozitga.
    const directExcess = excess - reversed;
    if (directExcess > 0) {
      await this.refundOverpayChunk(
        deposit,
        plan.id,
        directExcess,
        "Ortiqcha to'lov - to'lovga qaytarildi",
      );
    }
  }

  /**
   * Depozit-qoplama `PaymentTransaction` o'chirilganda pul NAQDGA emas,
   * DEPOZITGA qaytadi (`transaction.service.remove` chaqiradi).
   *
   * ⚠ `tx` berilsa qoplamani bekor qilgan tranzaksiya ichida atomik
   * bajariladi — aks holda tashqi abort/retry'da depozit IKKI MARTA
   * kreditlanardi.
   */
  async refundToDeposit(
    studentId: string,
    amount: number,
    { tx, note }: { tx?: any; note?: string } = {},
  ): Promise<void> {
    const client = this.db(tx);
    const deposit = await this.getOrCreate(studentId, { tx });
    const upd = await this.applyBalanceDelta(deposit.id, amount, { tx });
    if (!upd) throw new ApiError(500, "To'lovga qaytarib bo'lmadi");
    await client.depositTransaction.create({
      data: {
        branchId: await this.branchAccess.resolveBranchFromUser(deposit.studentId),
        studentId: deposit.studentId,
        depositId: deposit.id,
        type: 'refund',
        amount,
        balanceAfter: upd.balance,
        note: note || "To'lov bekor qilindi - to'lovga qaytarildi",
        paidAt: localTodayMidnight(),
      },
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // DEPOZIT TRANZAKSIYASINI BEKOR QILISH
  // ══════════════════════════════════════════════════════════════════

  /**
   * DEPOZIT TRANZAKSIYASINI BEKOR QILADI (topup/withdraw).
   *
   * ── ⚠ ATOMAR + JURNAL STORNOSI (B21 bilan o'zgardi) ──
   * Balans o'zgarishi, soft-delete va JURNAL STORNOSI BITTA
   * tranzaksiyada. Ilgari jurnal TEGILMAY qolardi — bekor qilingan
   * to'ldirish kassa qoldig'ida ABADIY qolardi.
   *
   * ⚠ `refund` turi BEKOR QILINMAYDI (yuqorida 400): qaytarim —
   * "pul HAQIQATAN qaytdi", storno esa "operatsiya BO'LMAGAN".
   */
  async removeDepositTxn(id: string, currentUser: any) {
    // FILIAL: boshqa filial depozit amalini bekor qilib bo'lmaydi.
    // `list()` AYNAN shu filtr bilan ko'rsatadi — o'chirish ham o'sha
    // ko'lamda bo'lishi shart, aks holda ID ni qo'lda kiritib begona
    // filialning to'ldirishi storno qilinardi.
    const txn = await this.prisma.depositTransaction.findFirst({
      where: { id: String(id), ...branchFilter(), isDeleted: false },
    });
    if (!txn) throw new ApiError(404, 'Tranzaksiya topilmadi');
    if (txn.type === 'refund') {
      throw new ApiError(400, "Qaytarim tranzaksiyasini o'chirib bo'lmaydi");
    }

    const deposit = await this.getOrCreate(txn.studentId);
    await this.prisma.$transaction(async (tx) => {
      // ⚠ SHARTLI-ATOMIK (B38): `findFirst` va yozuv ORASIDAGI poygada
      // balans BIR NECHA MARTA o'zgarardi. Bekor qilishni EN BOSHIDA
      // "band qilamiz"; yutmagan so'rov 404 oladi.
      const claimed = await tx.depositTransaction.updateMany({
        where: { id: txn.id, isDeleted: false },
        data: {
          isDeleted: true, deletedAt: new Date(), deletedBy: this.actorId(currentUser),
        },
      });
      if (claimed.count === 0) throw new ApiError(404, 'Tranzaksiya topilmadi');

      if (txn.type === 'topup') {
        // Pul kelmagan deb hisoblaymiz — balansdan ayiramiz (agar
        // qoplanmagan bo'lsa). Qoplangan bo'lsa balans yetmaydi va yozuv
        // o'zgarmaydi — bu ATAYLAB: qoplangan pulni "yo'q" qilib bo'lmaydi.
        const balUpd = await this.applyBalanceDelta(
          deposit.id, -(txn.amount as any), { tx: tx as never });
        if (!balUpd) {
          throw new ApiError(
            400,
            "Bu pul allaqachon qoplangan - tranzaksiyani o'chirib bo'lmaydi",
          );
        }
      } else {
        // withdraw bekor — pul qaytib keldi.
        await this.applyBalanceDelta(
          deposit.id, txn.amount as any, { tx: tx as never });
      }
      await this.financialTx.reverseByRef(
        { refModel: 'DepositTransaction', refId: txn.id },
        currentUser,
        { tx: tx as never, memo: 'Storno: depozit amali bekor qilindi' },
      );
    }, FINANCE_TXN_OPTIONS);
    return { id: txn.id, _id: txn.id };
  }

  // ══════════════════════════════════════════════════════════════════
  // O'QISH / HISOBOTLAR
  // ══════════════════════════════════════════════════════════════════

  /** O'quvchining depozit summary'si (balans + jami kirim/chiqim/qoplangan). */
  async summaryFor(studentId: string) {
    const sid = String(studentId);
    // ⚠ FILIAL QO'RIQCHISI — `studentId` MIJOZDAN keladi: `finance.read`
    // filial ICHIDAGI ruxsat, begona filial o'quvchisining balansi
    // ko'rinmasligi kerak.
    await this.branchAccess.assertUserInBranchScope(sid);
    const student = await this.prisma.user.findUnique({
      where: { id: sid },
      select: SAFE_STUDENT_SELECT,
    });
    if (!student) throw new ApiError(404, "O'quvchi topilmadi");
    const deposit = await this.getOrCreate(sid);

    const [ledgerRows, appliedAgg] = await Promise.all([
      this.prisma.depositTransaction.groupBy({
        by: ['type'],
        where: { studentId: sid, isDeleted: false },
        _sum: { amount: true },
      }),
      this.prisma.paymentTransaction.aggregate({
        where: { studentId: sid, source: 'deposit', isDeleted: false },
        _sum: { amount: true },
      }),
    ]);

    const ledger: Record<string, number> = Object.fromEntries(
      (ledgerRows as any[]).map((r) => [r.type, r._sum.amount ?? 0]),
    );

    return {
      student: withLegacyId(student),
      balance: deposit.balance || 0,
      totalTopup: ledger.topup || 0,
      totalWithdraw: ledger.withdraw || 0,
      totalRefund: ledger.refund || 0,
      totalApplied: (appliedAgg as any)._sum.amount ?? 0,
    };
  }

  /**
   * O'quvchi depozit tarixi: ledger (topup/withdraw/refund) + qoplamalar
   * (apply), sana bo'yicha birlashtirilgan (eng yangisi yuqorida).
   */
  async historyFor(studentId: string) {
    const sid = String(studentId);
    // ⚠ FILIAL QO'RIQCHISI — tarix summary bilan BIR XIL ko'lamda
    // bo'lishi shart, aks holda balans yopiq, pul harakatlari esa
    // ochiq qolardi.
    await this.branchAccess.assertUserInBranchScope(sid);
    const [ledger, applies] = await Promise.all([
      this.prisma.depositTransaction.findMany({
        where: { studentId: sid, isDeleted: false },
        orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
      }),
      this.prisma.paymentTransaction.findMany({
        where: { studentId: sid, source: 'deposit', isDeleted: false },
        include: { group: { select: { id: true, name: true } } },
        orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
      }),
    ]);

    const rows = [
      ...(ledger as any[]).map((t) => ({
        id: t.id,
        _id: t.id,
        kind: t.type, // topup | withdraw | refund
        amount: t.amount,
        method: t.method,
        paidAt: t.paidAt,
        note: t.note,
        balanceAfter: t.balanceAfter,
        removable: t.type !== 'refund',
      })),
      ...(applies as any[]).map((t) => ({
        id: t.id,
        _id: t.id,
        kind: 'apply', // depozit → oylik to'lov (daromad)
        amount: t.amount,
        paidAt: t.paidAt,
        group: t.group ? withLegacyId(t.group) : null,
        year: t.year,
        month: t.month,
        note: t.note,
        removable: false,
      })),
    ].sort(
      (a, b) => new Date(b.paidAt).getTime() - new Date(a.paidAt).getTime(),
    );

    return rows;
  }

  /**
   * Owner sahifa tab1: depozit tranzaksiyalari ro'yxati.
   *
   * ⚠ FILIAL KO'LAMI: `DepositTransaction` da `branchId` bor (o'quvchining
   * `homeBranchId` sidan yoziladi), shuning uchun to'g'ridan-to'g'ri filtr.
   * `branchId: null` yozuvlar (filialga biriktirilmagan o'quvchi) aniq
   * filial tanlanganda KO'RINMAYDI — fail-closed.
   */
  async list({
    studentId,
    from,
    to,
    type,
    page = 1,
    limit = 50,
  }: {
    studentId?: string;
    from?: Date | string;
    to?: Date | string;
    type?: string;
    page?: number;
    limit?: number;
  }) {
    const where: any = { ...branchFilter(), isDeleted: false };
    if (studentId) where.studentId = String(studentId);
    if (type) where.type = type;
    if (from || to) {
      where.paidAt = {};
      if (from) where.paidAt.gte = parseLocalDay(from);
      if (to) where.paidAt.lte = parseLocalDay(to);
    }
    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.depositTransaction.findMany({
        where,
        include: { student: { select: SAFE_STUDENT_SELECT } },
        orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.depositTransaction.count({ where }),
    ]);
    return { items: withLegacyIds(items), total, page, limit };
  }

  /**
   * Owner sahifa tab2: hisobotlar.
   *
   * ⚠ FILIAL KO'LAMI — uchala manba UCH XIL yo'l bilan filialga bog'langan:
   *   `DepositTransaction` → o'zida `branchId` bor            → branchFilter
   *   `PaymentTransaction` → o'zida `branchId` bor (required) → branchFilter
   *   `StudentDeposit`     → `branchId` YO'Q, o'quvchiga tegishli
   *                                                → branchUserFilter
   *
   * Express'da ilgari bu yerda filtr UMUMAN yo'q edi va hisobot butun
   * markazning pulini bitta filial soni sifatida ko'rsatardi.
   */
  async report({ from, to }: { from?: Date | string; to?: Date | string } = {}) {
    const range: any = {};
    if (from || to) {
      range.paidAt = {};
      if (from) range.paidAt.gte = parseLocalDay(from);
      if (to) range.paidAt.lte = parseLocalDay(to);
    }

    const studentScope = await this.branchAccess.branchUserFilter('studentId');

    const [ledgerRows, appliedAgg, balances] = await Promise.all([
      this.prisma.depositTransaction.groupBy({
        by: ['type'],
        where: { ...branchFilter(), isDeleted: false, ...range },
        _sum: { amount: true },
      }),
      this.prisma.paymentTransaction.aggregate({
        where: {
          ...branchFilter(),
          source: 'deposit',
          isDeleted: false,
          ...range,
        },
        _sum: { amount: true },
      }),
      this.prisma.studentDeposit.findMany({
        where: { ...studentScope, balance: { gt: 0 } } as any,
        include: { student: { select: SAFE_STUDENT_SELECT } },
        orderBy: { balance: 'desc' },
      }),
    ]);

    const ledger: Record<string, number> = Object.fromEntries(
      (ledgerRows as any[]).map((r) => [r.type, r._sum.amount ?? 0]),
    );
    const heldTotal = (balances as any[]).reduce(
      (s, d) => s + (d.balance || 0),
      0,
    );

    return {
      heldTotal,
      totalTopup: ledger.topup || 0,
      totalWithdraw: ledger.withdraw || 0,
      totalRefund: ledger.refund || 0,
      totalApplied: (appliedAgg as any)._sum.amount ?? 0,
      balances: (balances as any[]).map((d) => ({
        student: d.student ? withLegacyId(d.student) : null,
        balance: d.balance,
      })),
    };
  }
}
