import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { withLegacyId } from '../../common/utils/serialize.js';
import { branchFilter } from '../../common/als/branch-context.js';
import { BranchAccessService } from '../../common/rbac/branch-access.service.js';

/**
 * ══════════════════════════════════════════════════════════════════════
 * BYUDJET BOSHQARUVI — REJA, PUL EMAS
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── BYUDJET JURNALGA YOZILMAYDI ──
 * Bu shu modulning eng muhim qoidasi. Byudjet — NIYAT, pul harakati
 * emas. Uni jurnalga yozish soxta xarajat yaratardi va "byudjet vs
 * fakt" taqqoslashi o'z-o'zini taqqoslashga aylanardi.
 *
 * Shuning uchun bu servis `FinancialTransactionService` ni UMUMAN
 * chaqirmaydi va hech qanday `JournalEntry` yaratmaydi.
 *
 * ── UCH DARAJA ARALASHMAYDI ──
 *   total    — butun davr uchun yagona shift
 *   category — aniq kategoriya
 *   kind     — kategoriya turi (payroll/operating/tax/capital)
 * Ular BIR-BIRINI QAMRAMAYDI: "jami 50 mln, shundan marketing 5 mln"
 * — ikkalasi ham to'g'ri va ular qo'shilmaydi. Qisman unique
 * indekslar har darajada takrorlanishni to'sadi
 * (20260819110000_finance_partial_unique_indexes).
 */

interface Actor {
  id?: string | null;
  _id?: string | null;
  homeBranchId?: string | null;
}
const actorId = (u?: Actor | null): string | null => u?.id || u?._id || null;

export interface BudgetLineInput {
  scope?: string;
  categoryId?: string | null;
  categoryKind?: string | null;
  amount: number;
  note?: string;
}

/** Qator kiritilishini tekshiradi — daraja bo'yicha maydonlar farq qiladi. */
const normalizeLine = (line: BudgetLineInput) => {
  const scope = line.scope || 'category';
  const amount = Math.round(Number(line.amount) || 0);
  if (amount < 0) throw new ApiError(400, "Byudjet summasi manfiy bo'lishi mumkin emas");

  if (scope === 'category' && !line.categoryId) {
    throw new ApiError(400, "Kategoriya qatori uchun kategoriya tanlanishi shart");
  }
  if (scope === 'kind' && !line.categoryKind) {
    throw new ApiError(400, "Tur qatori uchun kategoriya turi tanlanishi shart");
  }
  return {
    scope,
    // Daraja bilan mos kelmaydigan maydon TOZALANADI: aks holda
    // `total` qatoriga tasodifan kategoriya yopishib qolib, qisman
    // unique indeks kutilmaganda ishga tushardi.
    categoryId: scope === 'category' ? String(line.categoryId) : null,
    categoryKind: scope === 'kind' ? line.categoryKind : null,
    amount,
    note: line.note || '',
  };
};

const BUDGET_INCLUDE = {
  lines: { include: { category: { select: { id: true, name: true, kind: true } } } },
  branch: { select: { id: true, name: true } },
};

@Injectable()
export class BudgetService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  async listBudgets({ year, branchId }: { year?: number; branchId?: string } = {}) {
    const rows = await this.prisma.budget.findMany({
      where: {
        isDeleted: false,
        ...(year ? { year: Number(year) } : {}),
        ...(branchId ? { branchId: String(branchId) } : branchFilter()),
      } as never,
      include: BUDGET_INCLUDE,
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      take: 50,
    });
    return rows.map((r) => withLegacyId(r));
  }

  async getBudget(id: string) {
    const b = await this.prisma.budget.findFirst({
      where: { id: String(id), isDeleted: false },
      include: BUDGET_INCLUDE,
    });
    if (!b) throw new ApiError(404, 'Byudjet topilmadi');
    return withLegacyId(b);
  }

  async createBudget(
    body: {
      name?: string; branchId?: string | null; periodType?: string;
      year: number; month?: number; quarter?: number; status?: string;
      note?: string; lines?: BudgetLineInput[];
    },
    currentUser?: Actor | null,
  ) {
    const branchId =
      body.branchId === null
        ? null
        : await this.branchAccess.resolveBranchForWrite(currentUser, body.branchId ?? null);

    const periodType = body.periodType || 'month';
    const year = Number(body.year);
    // `month`/`quarter` TEGISHLI BO'LMAGANDA 0 (NULL emas) — Postgres'da
    // NULL != NULL bo'lgani uchun nullable ustun takrorlanishni
    // to'smasdi (qarang schema.prisma, model Budget).
    const month = periodType === 'month' ? Number(body.month) : 0;
    const quarter = periodType === 'quarter' ? Number(body.quarter) : 0;

    if (!year) throw new ApiError(400, "Yil ko'rsatilishi shart");
    if (periodType === 'month' && (!month || month < 1 || month > 12)) {
      throw new ApiError(400, "Oy 1–12 oralig'ida bo'lishi kerak");
    }

    const lines = (body.lines || []).map(normalizeLine);

    try {
      const created = await this.prisma.budget.create({
        data: {
          name: body.name || '',
          branchId,
          periodType: periodType as never,
          year,
          month,
          quarter,
          status: (body.status || 'active') as never,
          note: body.note || '',
          createdById: actorId(currentUser),
          lines: { create: lines as never },
        } as never,
        include: { lines: true },
      });
      return withLegacyId(created);
    } catch (err) {
      // Qisman unique indeks: bir davrga ikkinchi byudjet.
      if ((err as { code?: string })?.code === 'P2002') {
        throw new ApiError(409, 'Bu davr uchun byudjet allaqachon mavjud');
      }
      throw err;
    }
  }

  /**
   * BYUDJETNI YANGILASH.
   *
   * Qatorlar TO'LIQ almashtiriladi (`set` semantikasi): UI butun
   * ro'yxatni yuboradi va qaysi qator o'chgani/qo'shilganini server
   * hisoblab o'tirmaydi. Bu soddaroq va xatosizroq — qisman
   * yangilashda "o'chirilgan qator qayta paydo bo'ldi" turidagi
   * nosozliklar tug'iladi.
   */
  async updateBudget(
    id: string,
    body: { name?: string; status?: string; note?: string; lines?: BudgetLineInput[] },
    _currentUser?: Actor | null,
  ) {
    const existing = await this.prisma.budget.findFirst({
      where: { id: String(id), isDeleted: false },
      select: { id: true },
    });
    if (!existing) throw new ApiError(404, 'Byudjet topilmadi');

    const data: Record<string, unknown> = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.note !== undefined) data.note = body.note;
    if (body.status !== undefined) data.status = body.status;

    if (Array.isArray(body.lines)) {
      const lines = body.lines.map(normalizeLine);
      return this.prisma.$transaction(async (tx) => {
        await tx.budgetLine.deleteMany({ where: { budgetId: existing.id } });
        const updated = await tx.budget.update({
          where: { id: existing.id },
          data: { ...data, lines: { create: lines } } as never,
          include: { lines: true },
        });
        return withLegacyId(updated);
      });
    }

    const updated = await this.prisma.budget.update({
      where: { id: existing.id },
      data: data as never,
      include: { lines: true },
    });
    return withLegacyId(updated);
  }

  /**
   * O'CHIRISH — YUMSHOQ (soft delete).
   *
   * Byudjet o'tmishdagi taqqoslashning bir qismi: uni butunlay
   * yo'qotish "o'sha oyda reja bor edimi?" degan savolni javobsiz
   * qoldirardi.
   */
  async removeBudget(id: string, currentUser?: Actor | null) {
    const b = await this.prisma.budget.findFirst({
      where: { id: String(id), isDeleted: false },
      select: { id: true },
    });
    if (!b) throw new ApiError(404, 'Byudjet topilmadi');
    await this.prisma.budget.update({
      where: { id: b.id },
      data: { isDeleted: true, deletedAt: new Date(), deletedBy: actorId(currentUser) },
    });
    return { id: b.id, deleted: true };
  }
}
