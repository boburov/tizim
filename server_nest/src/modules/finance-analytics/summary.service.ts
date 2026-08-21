import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ReceivablesService } from './receivables.service.js';
import {
  parseRange,
  previousRange,
  journalWhere,
  branchClause,
  SQL_REVENUE_NET,
  SQL_REVENUE_GROSS,
  SQL_REFUNDS,
  SQL_EXPENSE,
  SQL_PAYROLL,
  SQL_EXPENSE_NON_PAYROLL,
  SQL_FEES,
  SQL_SHORTAGE,
  type AnalyticsFilter,
  type Range,
} from './analytics-filter.js';
import { compare, ratioPercent, n } from './metrics.js';
import { TREASURY_KINDS } from '../../common/constants/ledger.js';

/**
 * ══════════════════════════════════════════════════════════════════════
 * MOLIYAVIY XULOSA (summary) — `services/summary.service.js`
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── NEGA "NET PROFIT" EMAS, "CONTRIBUTION PROFIT" ──
 *
 * Sof foyda (net profit) uchun BARCHA xarajat to'g'ri taqsimlangan
 * bo'lishi kerak — jumladan ijara, kommunal, ma'muriyat maoshi.
 * Bizda esa ularni o'qituvchiga yoki guruhga taqsimlash QOIDASI YO'Q
 * va uni o'ylab topish soxta aniqlik berardi.
 *
 * Shuning uchun markaz darajasida ikkala raqam ham beriladi:
 *
 *   CONTRIBUTION PROFIT = daromad − TO'G'RIDAN-TO'G'RI xarajat
 *                         (maosh + komissiya)
 *   OPERATING RESULT     = daromad − BARCHA operatsion xarajat
 *
 * Ikkinchisi markaz darajasida HALOL, chunki bu yerda hech narsani
 * taqsimlash shart emas — hamma xarajat shu markazniki. Lekin u
 * o'qituvchi/guruh kesimida ma'noga EGA EMAS va u yerda berilmaydi.
 */
@Injectable()
export class SummaryService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ReceivablesService) private readonly receivables: ReceivablesService,
  ) {}

  /**
   * ⚠ OMMAVIY: `financial-intelligence` va `profitability` ham SHU
   * metoddan foydalanadi. Nusxa ko'chirilsa "daromad" ta'rifi ikkiga
   * bo'linardi.
   */
  async summaryRow(
    range: Range,
    {
      branchId = null,
      dimensions = {},
    }: { branchId?: string | null; dimensions?: Record<string, unknown> } = {},
  ) {
    const where = journalWhere({ ...range, branchId, dimensions });
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT
        ${SQL_REVENUE_NET}          AS "revenueNet",
        ${SQL_REVENUE_GROSS}        AS "revenueGross",
        ${SQL_REFUNDS}              AS "refunds",
        ${SQL_EXPENSE}              AS "expense",
        ${SQL_PAYROLL}              AS "payroll",
        ${SQL_EXPENSE_NON_PAYROLL}  AS "expenseOther",
        ${SQL_FEES}                 AS "fees",
        ${SQL_SHORTAGE}             AS "shortage"
      FROM journal_lines l
      JOIN journal_entries e ON e.id = l."entryId"
      WHERE ${where}
    `;
    const r = rows[0] || {};
    const revenue = n(r.revenueNet);
    const payroll = n(r.payroll);
    const fees = n(r.fees);
    const expense = n(r.expense);
    const shortage = n(r.shortage);

    return {
      revenueGross: n(r.revenueGross),
      refunds: n(r.refunds),
      revenue,
      payroll,
      expenseOther: n(r.expenseOther),
      operatingExpenses: expense + fees,
      fees,
      shortage,
      // TO'G'RIDAN-TO'G'RI xarajat: maosh + to'lov komissiyasi.
      directCosts: payroll + fees,
      contributionProfit: revenue - payroll - fees,
      operatingResult: revenue - expense - fees - shortage,
    };
  }

  /** XAZINA QOLDIG'I — "hozir qancha pul bor" (davr OXIRIGA). */
  async cashBalance({
    to,
    branchId = null,
  }: { to?: Date | null; branchId?: string | null } = {}): Promise<number> {
    const bc = branchClause('e."branchId"', branchId);
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT COALESCE(SUM(l.debit - l.credit), 0) AS balance
      FROM journal_lines l
      JOIN journal_entries e ON e.id = l."entryId"
      WHERE l."accountKind"::text IN (${Prisma.join(TREASURY_KINDS as unknown as string[])})
        ${to ? Prisma.sql`AND e.date <= ${to}` : Prisma.empty}
        ${bc}
    `;
    // Xazina hisoblari DEBET tabiatli (NORMAL_SIDE) — qoldiq debet − kredit.
    return n(rows[0]?.balance);
  }

  /**
   * TO'LIQ XULOSA + oldingi davr bilan taqqoslash.
   *
   * Bitta chaqiruvda hamma narsa — dashboard uchun. Har KPI uchun alohida
   * so'rov yuborish 8 ta borish-kelish bo'lardi.
   */
  async getSummary(filters: AnalyticsFilter = {}) {
    const range = parseRange(filters);
    const prev = previousRange(range);
    const branchId = filters.branchId || null;
    const dimensions = filters as Record<string, unknown>;

    const [cur, was, cash, recv, recvPrev] = await Promise.all([
      this.summaryRow(range, { branchId, dimensions }),
      this.summaryRow(prev, { branchId, dimensions }),
      this.cashBalance({ to: range.to, branchId }),
      this.receivables.getReceivables({ ...filters, ...range }),
      this.receivables.getReceivables({ ...filters, ...prev }),
    ]);

    return {
      period: { from: range.from, to: range.to },
      previousPeriod: { from: prev.from, to: prev.to },

      revenue: compare(cur.revenue, was.revenue),
      revenueGross: compare(cur.revenueGross, was.revenueGross),
      refunds: compare(cur.refunds, was.refunds),
      operatingExpenses: compare(cur.operatingExpenses, was.operatingExpenses),
      payroll: compare(cur.payroll, was.payroll),
      fees: compare(cur.fees, was.fees),
      directCosts: compare(cur.directCosts, was.directCosts),
      contributionProfit: compare(cur.contributionProfit, was.contributionProfit),
      operatingResult: compare(cur.operatingResult, was.operatingResult),

      contributionMargin: {
        current: ratioPercent(cur.contributionProfit, cur.revenue),
        previous: ratioPercent(was.contributionProfit, was.revenue),
      },

      // PUL QOLDIG'I — FOYDADAN BOSHQA NARSA (Faza 11).
      // Foyda "qancha ishladik" ni, qoldiq "qancha pul yotibdi" ni aytadi.
      // Ular teng EMAS: qarzga sotilgan dars foyda beradi, pul bermaydi;
      // egasining investitsiyasi pul beradi, foyda bermaydi.
      cashBalance: cash,

      receivables: {
        expected: compare(recv.totals.expected, recvPrev.totals.expected),
        collected: compare(recv.totals.collected, recvPrev.totals.collected),
        outstanding: compare(recv.totals.outstanding, recvPrev.totals.outstanding),
        overdue: recv.totals.overdue,
        collectionRate: {
          current: recv.totals.collectionRate,
          previous: recvPrev.totals.collectionRate,
        },
      },
    };
  }
}
