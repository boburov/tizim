import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { APPROVAL_KINDS } from '../../common/constants/approvals.js';
import { ApiError } from '../../common/errors/api-error.js';
import { withLegacyId, withLegacyIds } from '../../common/utils/serialize.js';
import { branchFilter, isBranchAllowed } from '../../common/als/branch-context.js';
import { parseLocalDay, localTodayMidnight } from '../../common/utils/date.js';
import { BranchAccessService } from '../../common/rbac/branch-access.service.js';
import { ExpenseApprovalsService } from '../expense-approvals/expense-approvals.service.js';
import { FinancialTransactionService } from '../finance/financial-transaction.service.js';
import { FINANCE_TXN_OPTIONS } from '../../common/utils/finance-txn.js';
import type { TxClient } from '../journal/journal.service.js';

/**
 * UMUMIY CHIQIMLAR - servis qatlami.
 *
 * Tasdiq oqimi maosh to'lovi bilan AYNAN BIR XIL: summa filial
 * limitidan oshsa hujjat YARATILMAYDI, faqat so'rov ochiladi. Aks
 * holda "tasdiq kutilmoqda" holatidagi chiqim hisobotlarga sizib
 * kirardi.
 */

interface Actor {
  id?: string | null;
  _id?: string | null;
  homeBranchId?: string | null;
  permissions?: string[];
  canSeeAllBranches?: boolean;
}
const actorId = (u?: Actor | null): string | null => u?.id || u?._id || null;

/** Ro'yxat va tafsilotda kategoriya/muallif nomi kerak. */
const LIST_INCLUDE = {
  category: { select: { id: true, name: true, kind: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
};

/**
 * Filial ko'lami + MARKAZ UMUMIY chiqimlari.
 *
 * NEGA `OR` KERAK: markaz umumiy chiqimlarida `branchId = null` va
 * ular filial filtriga TUSHMAYDI. Oddiy `AND` qilinsa ular hech
 * qayerda ko'rinmay qolardi - ijara va reklama kabi ENG KATTA
 * xarajatlar hisobotdan yo'qolardi va foyda yolg'on yuqori ko'rinardi.
 *
 * `branchScope === "branch-only"` bo'lsa umumiylar QO'SHILMAYDI -
 * "faqat shu filialning o'z xarajati" ko'rinishi uchun.
 */
const scopeClause = (branchScope?: string): Record<string, unknown>[] => {
  const bf = branchFilter();
  if (!Object.keys(bf).length) return [];
  if (branchScope === 'branch-only') return [bf];
  return [{ OR: [bf, { branchId: null }] }];
};

@Injectable()
export class ExpenseService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly branchAccess: BranchAccessService,
    private readonly approvals: ExpenseApprovalsService,
    private readonly financialTx: FinancialTransactionService,
  ) {}

  private async assertCategory(categoryId?: string | null) {
    if (!categoryId) {
      throw new ApiError(400, "Chiqim kategoriyasi ko'rsatilishi shart");
    }
    const cat = await this.prisma.expenseCategory.findFirst({
      where: { id: String(categoryId), isDeleted: false },
    });
    if (!cat) throw new ApiError(404, 'Chiqim kategoriyasi topilmadi');
    if (!cat.isActive) throw new ApiError(400, 'Bu kategoriya faol emas');
    return cat;
  }

  /**
   * VALYUTA VA KAPITAL INVARIANTLARI - avval Mongoose `pre("validate")`
   * da edi.
   *
   * Ikkalasi ham audit uchun hal qiluvchi:
   *   • Kurssiz valyutali chiqim: `amount` qanday chiqqani NOMA'LUM
   *     qoladi. Keyin "nega 12 mln?" degan savolga javob topilmaydi.
   *   • Muddatsiz kapital chiqim: amortizatsiya hisoblanmaydi va butun
   *     summa bitta oyga tushib, o'sha oy foydasini yolg'on
   *     kamaytiradi.
   *
   * SERVISDA, Zod'da emas: chiqim `executeApprovedExpense` orqali ham
   * yoziladi (tasdiq payload'idan) - u HTTP validatsiyasini chetlab
   * o'tadi. Aynan shu yo'l eng xavflisi: payload eski bo'lishi mumkin.
   */
  private assertExpenseShape<T extends Record<string, unknown>>(draft: T): T {
    if (draft.currency && draft.currency !== 'UZS') {
      if (!draft.exchangeRate || (draft.exchangeRate as number) <= 0) {
        throw new ApiError(
          400, "Chet el valyutasida chiqim uchun kurs ko'rsatilishi shart");
      }
      if (!draft.originalAmount || (draft.originalAmount as number) <= 0) {
        throw new ApiError(400, "Asl summa (valyutada) ko'rsatilishi shart");
      }
    }
    if (draft.isCapital && !draft.depreciationMonths) {
      throw new ApiError(
        400,
        "Kapital chiqim uchun amortizatsiya muddati (oy) ko'rsatilishi shart",
      );
    }
    return draft;
  }

  /**
   * Kiruvchi ma'lumotdan hujjat maydonlarini tayyorlaydi.
   * `create` va `execute` IKKALASI ham shu yerdan o'tadi — qoidalar
   * bir joyda.
   */
  private async buildDraft(
    body: Record<string, unknown>,
    currentUser?: Actor | null,
  ) {
    // `category` (eski nom) ham, `categoryId` (Prisma nomi) ham qabul
    // qilinadi: `update()` mavjud yozuvni tarqatib qayta yig'adi va
    // undagi maydon nomi `categoryId`.
    const cat = await this.assertCategory(
      (body.category ?? body.categoryId) as string);

    const spentAt = body.spentAt
      ? parseLocalDay(body.spentAt as string)
      : localTodayMidnight();
    if (!spentAt) throw new ApiError(400, "Sana noto'g'ri");

    // Davr berilmasa - sarflangan oyga tegishli deb hisoblaymiz.
    const accrualYear = Number(body.accrualYear) || spentAt.getUTCFullYear();
    const accrualMonth = Number(body.accrualMonth) || spentAt.getUTCMonth() + 1;

    const currency = (body.currency as string) || 'UZS';
    let amount = Math.round(Number(body.amount) || 0);
    let originalAmount: number | null = null;
    let exchangeRate: number | null = null;

    if (currency !== 'UZS') {
      // Chet el valyutasi: foydalanuvchi ASL summani va kursni
      // kiritadi, biz baza valyutasidagi summani SHU YERDA hisoblab
      // MUZLATAMIZ.
      originalAmount = Number(body.originalAmount ?? body.amount) || 0;
      exchangeRate = Number(body.exchangeRate) || 0;
      if (originalAmount <= 0 || exchangeRate <= 0) {
        throw new ApiError(400, "Valyuta summasi va kursi to'g'ri ko'rsatilishi shart");
      }
      amount = Math.round(originalAmount * exchangeRate);
    }
    if (amount < 1) throw new ApiError(400, "Summa noldan katta bo'lishi kerak");

    // FILIAL: ataylab null bo'lishi MUMKIN (markaz umumiy chiqimi).
    // body.branchId === null → foydalanuvchi ONGLI ravishda "umumiy" dedi.
    const branchId =
      body.branchId === null
        ? null
        : await this.branchAccess.resolveBranchForWrite(
            currentUser, (body.branchId as string) ?? null);

    return this.assertExpenseShape({
      branchId,
      allocation: (body.allocation as string) || 'none',
      categoryId: cat.id,
      categoryName: cat.name,
      categoryKind: cat.kind,
      title: String(body.title).trim(),
      description: (body.description as string) || '',
      amount,
      currency,
      originalAmount,
      exchangeRate,
      rateSource: (body.rateSource as string) || '',
      spentAt,
      accrualYear,
      accrualMonth,
      method: (body.method as string) || 'cash',
      vendor: (body.vendor as string) || '',
      receiptId: (body.receipt as string) || (body.receiptId as string) || null,
      isCapital: Boolean(body.isCapital),
      depreciationMonths: body.isCapital
        ? Number(body.depreciationMonths) || 0
        : null,
    } as Record<string, unknown>);
  }

  async create(body: Record<string, unknown>, currentUser?: Actor | null) {
    const draft = await this.buildDraft(body, currentUser);

    // CHIQIM LIMITI: markaz umumiy chiqimida (branchId=null) limit
    // tekshiruvi ASOSIY filial limiti bilan qilinmaydi - u yerda
    // "qaysi filial limiti?" degan savol javobsiz. Shuning uchun
    // umumiy chiqim HAR DOIM tasdiqdan o'tadi (u odatda eng katta
    // xarajat - ijara, brend reklamasi).
    const { needsApproval, threshold } = draft.branchId
      ? await this.approvals.checkExpenseLimit({
          branchId: draft.branchId as string,
          amount: draft.amount as number,
          permissions: currentUser?.permissions,
        })
      : { needsApproval: true, threshold: null };

    if (needsApproval) {
      // [MAVJUD XATO] `Approval.branchId` MAJBURIY (Postgres'da ham
      // NOT NULL). Ya'ni markaz umumiy chiqimi (branchId = null) shu
      // yerda HAR DOIM yiqiladi.
      //
      // Bu ko'chirish regressiyasi EMAS — Express'da ham aynan shunday.
      // Tuzatish "umumiy chiqimni kim tasdiqlaydi?" degan SIYOSAT
      // savolini talab qiladi (asosiy filial? owner? alohida navbat?),
      // shuning uchun ko'chirish bilan birga jimgina o'zgartirilmadi.
      const approval = await this.approvals.createRequest({
        branchId: draft.branchId as string,
        kind: APPROVAL_KINDS.EXPENSE_CREATE,
        amount: draft.amount as number,
        threshold,
        payload: {
          ...body,
          resolvedBranchId: draft.branchId ? String(draft.branchId) : null,
        },
        subjectName: draft.title as string,
        contextName: draft.categoryName as string,
        requestNote: body.requestNote as string,
        currentUser,
      });
      return { pendingApproval: true, approval };
    }

    // ── ATOMIK: chiqim + jurnal yozuvi + audit BITTA tranzaksiyada ──
    //
    // ILGARI: `expense.create()` keyin `postExpense()` alohida, va
    // jurnal xatosi YUTILARDI. Natijada "chiqim bor, jurnalda yo'q"
    // holati hosil bo'lishi mumkin edi — kassa qoldig'i hisobotdan
    // farq qilardi va buni faqat `journalVerify` keyinroq topardi.
    //
    // ENDI: xato bo'lsa chiqim ham yozilmaydi. Eng yomon natija —
    // "hech narsa yozilmadi", ya'ni foydalanuvchi xatoni DARHOL
    // ko'radi.
    const created = await this.prisma.$transaction(async (t) => {
      const tx = t as unknown as TxClient;
      const expense = await tx.expense.create({
        data: { ...draft, createdById: actorId(currentUser) } as never,
      });
      await this.financialTx.postExpense(
        { expenseId: expense.id }, currentUser, { tx });
      return expense;
    }, FINANCE_TXN_OPTIONS);
    return withLegacyId(created);
  }

  /**
   * TASDIQLANGAN chiqim so'rovini bajaradi.
   *
   * AYNAN BIR MARTA: avval shu so'rov bo'yicha yozuv bor-yo'qligi
   * tekshiriladi (jarayon o'rtada o'lgan bo'lishi mumkin), keyin
   * qisman unique indeks.
   */
  async executeApprovedExpense(approval: Record<string, unknown>) {
    const approvalId = (approval.id || approval._id) as string;

    const existing = await this.prisma.expense.findFirst({
      where: { expenseApprovalId: String(approvalId) },
    });
    if (existing) return withLegacyId(existing);

    // QAYTA VALIDATSIYA: kategoriya o'chirilgan/nofaol bo'lib qolgan
    // bo'lishi mumkin - payload'ga ko'r-ko'rona ishonilmaydi.
    const draft = await this.buildDraft(
      (approval.payload as Record<string, unknown>) || {},
      {
        id: (approval.requestedById || approval.requestedBy) as string,
        // Filial so'rov paytida hal qilingan - qayta hal qilinmaydi.
        canSeeAllBranches: true,
      },
    );

    // Tasdiqlangan chiqim ham to'g'ridan-to'g'ri yozilgani kabi pul
    // harakati — o'sha atomik yo'ldan o'tadi.
    const actor: Actor = {
      id: (approval.requestedById || approval.requestedBy || null) as string,
    };
    const created = await this.prisma.$transaction(async (t) => {
      const tx = t as unknown as TxClient;
      const expense = await tx.expense.create({
        data: {
          ...draft,
          branchId:
            (approval.payload as Record<string, unknown>)?.resolvedBranchId || null,
          amount: approval.amount ?? draft.amount,
          createdById: (approval.requestedById || approval.requestedBy || null),
          expenseApprovalId: String(approvalId),
        } as never,
      });
      await this.financialTx.postExpense({ expenseId: expense.id }, actor, { tx });
      return expense;
    }, FINANCE_TXN_OPTIONS);
    return withLegacyId(created);
  }

  async list({
    categoryId, kind, year, month, from, to, branchScope, page = 1, limit = 50,
  }: {
    categoryId?: string; kind?: string; year?: number; month?: number;
    from?: string; to?: string; branchScope?: string;
    page?: number; limit?: number;
  }) {
    const where: Record<string, unknown> = {
      isDeleted: false, AND: scopeClause(branchScope),
    };

    if (categoryId) where.categoryId = String(categoryId);
    if (kind) where.categoryKind = kind;
    if (year) where.accrualYear = Number(year);
    if (month) where.accrualMonth = Number(month);
    if (from || to) {
      const spentAt: Record<string, Date | null> = {};
      if (from) spentAt.gte = parseLocalDay(from);
      if (to) spentAt.lte = parseLocalDay(to);
      where.spentAt = spentAt;
    }

    const skip = (page - 1) * limit;
    const [items, total, sum] = await Promise.all([
      this.prisma.expense.findMany({
        where: where as never,
        orderBy: [{ spentAt: 'desc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
        include: LIST_INCLUDE,
      }),
      this.prisma.expense.count({ where: where as never }),
      // JAMI SUMMA SAHIFADAN MUSTAQIL: `items` faqat joriy sahifa,
      // `totalAmount` esa BUTUN filtr bo'yicha - aks holda "jami"
      // sahifa almashganda o'zgarib turardi.
      this.prisma.expense.aggregate({ where: where as never, _sum: { amount: true } }),
    ]);

    return {
      items: withLegacyIds(items),
      total,
      page,
      limit,
      totalAmount: (sum._sum.amount as unknown as number) || 0,
    };
  }

  async getById(id: string) {
    const doc = await this.prisma.expense.findFirst({
      where: { id: String(id), isDeleted: false },
      include: LIST_INCLUDE,
    });
    if (!doc) throw new ApiError(404, 'Chiqim topilmadi');
    // Markaz umumiy chiqimi (branchId=null) hammaga ko'rinadi.
    if (doc.branchId && !isBranchAllowed(doc.branchId)) {
      throw new ApiError(404, 'Chiqim topilmadi');
    }
    return withLegacyId(doc);
  }

  /** Yozish uchun XOM yozuv (ko'lam tekshiruvi bilan). */
  private async loadForWrite(id: string) {
    const doc = await this.prisma.expense.findFirst({
      where: { id: String(id), isDeleted: false },
    });
    if (!doc) throw new ApiError(404, 'Chiqim topilmadi');
    if (doc.branchId && !isBranchAllowed(doc.branchId)) {
      throw new ApiError(404, 'Chiqim topilmadi');
    }
    return doc;
  }

  async update(
    id: string,
    body: Record<string, unknown>,
    currentUser?: Actor | null,
  ) {
    const doc = await this.loadForWrite(id);

    // TASDIQDAN o'tgan chiqim summasini tahrirlash - limitni aylanib
    // o'tish yo'li bo'lardi (100 mln so'rab, 1 mln tasdiqlatib, keyin
    // 100 mln qilish).
    if (doc.expenseApprovalId && body.amount !== undefined) {
      throw new ApiError(
        400,
        "Tasdiqdan o'tgan chiqim summasini o'zgartirib bo'lmaydi. Bekor qilib qaytadan kiriting.",
      );
    }

    // XOM yozuv (include'siz) tarqatiladi — aks holda `category`
    // obyekti `data` ga tushib "Unknown argument" berardi.
    const draft = await this.buildDraft(
      { ...(doc as unknown as Record<string, unknown>), ...body }, currentUser);

    const saved = await this.prisma.expense.update({
      where: { id: doc.id }, data: draft as never });
    return withLegacyId(saved);
  }

  async remove(id: string, currentUser?: Actor | null) {
    const doc = await this.loadForWrite(id);
    await this.prisma.expense.update({
      where: { id: doc.id },
      data: { isDeleted: true, deletedAt: new Date(), deletedBy: actorId(currentUser) },
    });
    return { ok: true };
  }

  /** Oylik chiqim - kategoriya bo'yicha guruhlangan (hisobot uchun). */
  async summaryByCategory({ year, month }: { year: number; month: number }) {
    const where = {
      isDeleted: false,
      accrualYear: Number(year),
      accrualMonth: Number(month),
      AND: scopeClause(),
    };

    // Snapshot nomlari (`categoryName`, `categoryKind`) kalitga
    // qo'shiladi — ular yozuvda MUZLATILGAN, ya'ni kategoriya keyin
    // qayta nomlansa ham eski hisobot o'zgarmaydi.
    const rows = await this.prisma.expense.groupBy({
      by: ['categoryId', 'categoryName', 'categoryKind'],
      where: where as never,
      _sum: { amount: true },
      _count: { _all: true },
      orderBy: { _sum: { amount: 'desc' } },
    });

    return rows.map((r) => ({
      categoryId: r.categoryId,
      name: r.categoryName,
      kind: r.categoryKind,
      total: (r._sum.amount as unknown as number) || 0,
      count: r._count._all,
    }));
  }
}
