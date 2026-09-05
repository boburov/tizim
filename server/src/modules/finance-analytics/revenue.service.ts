import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { NameResolverService } from './name-resolver.service.js';
import {
  parseRange,
  previousRange,
  journalWhere,
  branchClause,
  autoGranularity,
  truncExpr,
  SQL_REVENUE_NET,
  SQL_REVENUE_GROSS,
  SQL_REFUNDS,
  SQL_FEES,
  type AnalyticsFilter,
  type Range,
} from './analytics-filter.js';
import { compare, ratioPercent, n } from './metrics.js';

/**
 * ══════════════════════════════════════════════════════════════════════
 * DAROMAD TAHLILI (`services/revenue.service.js` EKVIVALENTI)
 * ══════════════════════════════════════════════════════════════════════
 *
 * MANBA — JURNAL, `PaymentTransaction` EMAS.
 *
 * NEGA: jurnal moliyaviy haqiqatning yagona manbai. `PaymentTransaction`
 * dan yig'ilsa uchta narsa YO'QOLARDI:
 *   • depozitdan qoplangan daromad (u to'lov emas, `deposit_apply`)
 *   • qaytarimlar (daromadni kamaytiradi)
 *   • ichki o'tkazma/egasi puli chetlashtirish qoidasi
 * Natijada "daromad" ikki xil joyda ikki xil raqam bo'lardi.
 */

const BREAKDOWNS: Readonly<Record<string, string>> = Object.freeze({
  branch: 'e."branchId"',
  course: 'e."courseId"',
  teacher: 'e."teacherId"',
  group: 'e."groupId"',
  room: 'e."roomId"',
  method: 'e."paymentMethod"',
  // `studentId` jurnal yozuvida ALLAQACHON bor (STEP 4 o'lchovlari) —
  // bu yerda faqat kesim ochiladi, yangi ma'lumot yozilmaydi.
  student: 'e."studentId"',
});

@Injectable()
export class RevenueService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NameResolverService) private readonly names: NameResolverService,
  ) {}

  /** DAROMAD KESIMI — bitta GROUP BY, hech qanday N+1 yo'q. */
  async getRevenueBy(by: string, filters: AnalyticsFilter = {}) {
    const col = BREAKDOWNS[by];
    if (!col) throw new Error(`Noma'lum kesim: ${by}`);
    const range = parseRange(filters);
    const where = journalWhere({
      ...range,
      branchId: filters.branchId || null,
      dimensions: filters as Record<string, unknown>,
    });
    const c = Prisma.raw(col);
    const limit = Math.min(Number(filters.limit) || 50, 200);

    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT ${c} AS "id",
        ${SQL_REVENUE_NET}   AS "revenue",
        ${SQL_REVENUE_GROSS} AS "gross",
        ${SQL_REFUNDS}       AS "refunds",
        ${SQL_FEES}          AS "fees",
        COUNT(DISTINCT e.id) AS "entries"
      FROM journal_lines l
      JOIN journal_entries e ON e.id = l."entryId"
      WHERE ${where} AND ${c} IS NOT NULL
      GROUP BY ${c}
      HAVING ${SQL_REVENUE_NET} <> 0
      ORDER BY "revenue" DESC
      LIMIT ${limit}
    `;

    const total = rows.reduce((s, r) => s + n(r.revenue), 0);
    const ids = rows.map((r) => r.id).filter(Boolean) as string[];
    const names = this.names.has(by) ? await this.names.resolve(by, ids) : new Map();

    return rows.map((r) => ({
      id: r.id,
      name: names.get(String(r.id)) || (by === 'method' ? String(r.id) : ''),
      revenue: n(r.revenue),
      gross: n(r.gross),
      refunds: n(r.refunds),
      fees: n(r.fees),
      entries: Number(r.entries || 0),
      sharePercent: ratioPercent(n(r.revenue), total),
    }));
  }

  /**
   * DAROMAD DINAMIKASI (vaqt qatori).
   *
   * Guruhlash SQL'da (`date_trunc`) — barcha yozuvni Node'ga tortib
   * JS'da yig'ish millionlab qatorda ishlamasdi.
   */
  async getRevenueTrend(filters: AnalyticsFilter = {}) {
    const range = parseRange(filters);
    const granularity = filters.granularity || autoGranularity(range);
    const where = journalWhere({
      ...range,
      branchId: filters.branchId || null,
      dimensions: filters as Record<string, unknown>,
    });
    const bucket = truncExpr(granularity);

    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT ${bucket} AS "bucket",
        ${SQL_REVENUE_NET}   AS "revenue",
        ${SQL_REVENUE_GROSS} AS "gross",
        ${SQL_REFUNDS}       AS "refunds"
      FROM journal_lines l
      JOIN journal_entries e ON e.id = l."entryId"
      WHERE ${where}
      GROUP BY ${bucket}
      ORDER BY "bucket" ASC
    `;
    return {
      granularity,
      period: { from: range.from, to: range.to },
      points: rows.map((r) => ({
        date: r.bucket,
        revenue: n(r.revenue),
        gross: n(r.gross),
        refunds: n(r.refunds),
      })),
    };
  }

  /**
   * TO'LOV KANALLARI — Faza 12 ning ko'rinadigan natijasi.
   *
   * Har kanal uchun BRUTTO, KOMISSIYA va NETTO alohida. Ilgari Click va
   * Payme hisoblari mavjud bo'lsa-da, to'lov `cash|card` bilan
   * yozilardi — ya'ni kanal kesimi umuman ko'rinmasdi.
   *
   * MANBA: `PaymentTransaction` (jurnal emas) — chunki brutto/komissiya/
   * netto uchligi aynan shu hujjatda saqlanadi va tranzaksiya SONI ham
   * shu yerda. Bu daromadning IKKINCHI HAQIQATI EMAS: umumiy daromad
   * baribir jurnaldan olinadi, bu esa faqat KANAL taqsimoti.
   */
  async getPaymentMethodBreakdown(filters: AnalyticsFilter = {}) {
    const range = parseRange(filters);
    // FILIAL: bu yagona xom so'rov `branchClause` dan CHETLAB O'TARDI —
    // parametrsiz butun tarmoq to'lovlarini ko'rsatardi, `?branchId=`
    // bilan esa qiymat tekshirilmay qo'yilib, ko'lamni KENGAYTIRARDI.
    // Endi ko'lam qo'shni so'rovlar bilan bir xil yo'ldan quriladi
    // (`analytics-filter.ts` → `branchClause` ichida
    // `assertBranchInScope` va fail-closed `AND FALSE`).
    const branchScope = branchClause(
      'pt."branchId"',
      filters.branchId ? String(filters.branchId) : null,
    );

    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT pt.method::text AS "method",
        COUNT(*)                              AS "count",
        COALESCE(SUM(pt.amount), 0)           AS "gross",
        COALESCE(SUM(pt."feeAmount"), 0)      AS "fees",
        COALESCE(SUM(pt.amount - pt."feeAmount"), 0) AS "net"
      FROM payment_transactions pt
      WHERE pt."isDeleted" = false
        AND pt."paidAt" >= ${range.from} AND pt."paidAt" <= ${range.to}
        ${branchScope}
      GROUP BY pt.method
      ORDER BY "gross" DESC
    `;
    const totalGross = rows.reduce((s, r) => s + n(r.gross), 0);
    return rows.map((r) => ({
      method: r.method,
      count: Number(r.count || 0),
      gross: n(r.gross),
      fees: n(r.fees),
      net: n(r.net),
      sharePercent: ratioPercent(n(r.gross), totalGross),
      // Kanal narxi: komissiya / brutto.
      feeRatePercent: ratioPercent(n(r.fees), n(r.gross)),
    }));
  }

  /**
   * QAYTARIM TAHLILI.
   *
   * ── QAYTARIM DARAJASI (refund rate) FORMULASI ──
   *      refundRate = qaytarilgan summa / BRUTTO daromad
   *
   * Maxraj ATAYLAB BRUTTO (qaytarim ayirilmagan): netto olinsa qaytarim
   * ikki marta ta'sir qilardi (surat o'sib, maxraj kamayib) va raqam
   * haqiqatdan kattaroq chiqardi.
   *
   * IKKI MARTA SANALMAYDI: qaytarim FAQAT jurnaldan olinadi (daromad
   * hisobining debet tomoni). `Refund` jadvali holat va tasdiq uchun,
   * summa manbai sifatida EMAS — aks holda bajarilmagan (pending)
   * qaytarim ham hisobga tushardi.
   */
  async getRefundAnalytics(filters: AnalyticsFilter = {}) {
    const range = parseRange(filters);
    const prev = previousRange(range);
    const branchId = filters.branchId || null;

    const load = async (r: Range) => {
      const where = journalWhere({
        ...r,
        branchId,
        dimensions: filters as Record<string, unknown>,
      });
      const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT ${SQL_REFUNDS} AS "refunds", ${SQL_REVENUE_GROSS} AS "gross",
               COUNT(DISTINCT e.id) FILTER (WHERE e.kind = 'refund') AS "count"
        FROM journal_lines l
        JOIN journal_entries e ON e.id = l."entryId"
        WHERE ${where}
      `;
      return rows[0] || {};
    };

    const [cur, was] = await Promise.all([load(range), load(prev)]);
    const byCourse = await this.getRefundsBy('e."courseId"', range, branchId, filters);
    const byGroup = await this.getRefundsBy('e."groupId"', range, branchId, filters);
    const byBranch = await this.getRefundsBy('e."branchId"', range, branchId, filters);

    return {
      period: { from: range.from, to: range.to },
      amount: compare(n(cur.refunds), n(was.refunds)),
      count: compare(Number(cur.count || 0), Number(was.count || 0)),
      refundRatePercent: {
        current: ratioPercent(n(cur.refunds), n(cur.gross)),
        previous: ratioPercent(n(was.refunds), n(was.gross)),
        formula: 'qaytarim / BRUTTO daromad',
      },
      byCourse,
      byGroup,
      byBranch,
    };
  }

  private async getRefundsBy(
    col: string,
    range: Range,
    branchId: string | null,
    filters: AnalyticsFilter,
  ) {
    const where = journalWhere({
      ...range,
      branchId,
      dimensions: filters as Record<string, unknown>,
    });
    const c = Prisma.raw(col);
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT ${c} AS "id", ${SQL_REFUNDS} AS "refunds",
             COUNT(DISTINCT e.id) FILTER (WHERE e.kind = 'refund') AS "count"
      FROM journal_lines l
      JOIN journal_entries e ON e.id = l."entryId"
      WHERE ${where} AND ${c} IS NOT NULL AND e.kind = 'refund'
      GROUP BY ${c}
      HAVING ${SQL_REFUNDS} > 0
      ORDER BY "refunds" DESC
      LIMIT 20
    `;
    const key = col.includes('courseId')
      ? 'course'
      : col.includes('groupId')
        ? 'group'
        : 'branch';
    const ids = rows.map((r) => r.id).filter(Boolean) as string[];
    const names = ids.length ? await this.names.resolve(key, ids) : new Map();
    return rows.map((r) => ({
      id: r.id,
      name: names.get(String(r.id)) || '',
      refunds: n(r.refunds),
      count: Number(r.count || 0),
    }));
  }
}
