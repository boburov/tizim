import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { NameResolverService } from './name-resolver.service.js';
import {
  parseRange,
  branchClause,
  planPeriodClause,
  type AnalyticsFilter,
} from './analytics-filter.js';
import { ratioPercent, n } from './metrics.js';

/**
 * ══════════════════════════════════════════════════════════════════════
 * DEBITORLIK (o'quvchi qarzi)
 * (`services/receivables.service.js` EKVIVALENTI)
 * ══════════════════════════════════════════════════════════════════════
 *
 * MANBA — MAVJUD IKKI HUJJAT, YANGI JADVAL YO'Q:
 *   StudentPayment            → KUTILGAN (oylik plan: expectedAmount)
 *   StudentPayment.paidAmount → HAQIQATDA to'langan
 *
 * Qarz = kutilgan − to'langan. Uni alohida jadvalda saqlash MUQARRAR
 * eskirardi: to'lov qabul qilinganda biri o'zgarib, ikkinchisi qolib
 * ketardi va qaysi biri haqiqat ekani noma'lum bo'lardi.
 *
 * ── NEGA JURNALDAN EMAS ──
 * Jurnal PUL HARAKATINI yuritadi — u "kelmagan pul" ni bilmaydi.
 * Qarz esa aynan KELMAGAN pul. Shuning uchun bu yagona hisobot
 * operatsion hujjatdan o'qiladi (talab ham shuni aytadi).
 *
 * ── TO'LOV MUDDATI (due date) ──
 * Oylik to'lov O'SHA OY ichida to'lanadi deb qabul qilinadi, ya'ni
 * muddat — oyning OXIRGI kuni. Oy tugagach qarz "muddati o'tgan"
 * bo'ladi.
 *
 * Bu QAROR, kashfiyot emas: bazada har o'quvchi uchun alohida
 * shartnoma muddati YO'Q. Boshqa qoida kerak bo'lsa (masalan "har
 * oyning 5-sanasi"), o'zgartiriladigan yagona joy — quyidagi
 * `DUE_DATE` ifodasi.
 *
 * ── HISOBDAN CHIQARILGAN QARZ (write-off) ──
 * `writtenOff` qatorlar kutilgan/to'langan/qoldiqdan CHIQARILADI va
 * alohida `badDebt` bo'lib beriladi — mavjud `finance-report` bilan
 * AYNAN bir xil qoida (ikki hisobot bir xil raqam berishi shart).
 */

// Oyning oxirgi kuni — to'lov muddati.
const DUE_DATE = Prisma.raw(`(make_date(sp.year, sp.month, 1) + INTERVAL '1 month - 1 day')`);
// Muddatidan necha kun o'tdi (hali kelmagan bo'lsa manfiy).
const DAYS_OVERDUE = Prisma.raw(
  `EXTRACT(DAY FROM (NOW() - (make_date(sp.year, sp.month, 1) + INTERVAL '1 month - 1 day')))`,
);
// Qator bo'yicha qoldiq.
const REMAINING = Prisma.raw(`GREATEST(sp."expectedAmount" - sp."paidAmount", 0)`);

/**
 * ⚠ `DUE_DATE` ATAYLAB SAQLANDI, GARCHI SO'ROVDA ISHLATILMASA HAM.
 *
 * Express'da ham shunday: yosh guruhlari `DAYS_OVERDUE` orqali
 * hisoblanadi, `DUE_DATE` esa muddat TA'RIFINI o'qiydigan odam uchun
 * turadi. O'chirilsa qoida faqat `EXTRACT(...)` ifodasining ichida
 * yashiringan bo'lardi.
 */
void DUE_DATE;

const GROUPINGS: Readonly<Record<string, { col: string; label: string }>> = Object.freeze({
  branch: { col: 'sp."branchId"', label: 'branch' },
  group: { col: 'sp."groupId"', label: 'group' },
  course: { col: 'g."courseId"', label: 'course' },
  student: { col: 'sp."studentId"', label: 'student' },
});

@Injectable()
export class ReceivablesService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(NameResolverService) private readonly names: NameResolverService,
  ) {}

  private planWhere({
    from,
    to,
    branchId,
    dimensions = {},
  }: {
    from: Date;
    to: Date;
    branchId: string | null;
    dimensions?: Record<string, unknown>;
  }): Prisma.Sql {
    const parts: Prisma.Sql[] = [
      // Plan OYI tanlangan oraliqqa tushadimi (indeksdan foydalanadigan
      // shakl — qarang `analytics-filter.ts` → `planPeriodClause`).
      planPeriodClause('sp', from, to),
    ];
    const bc = branchClause('sp."branchId"', branchId);
    if (bc !== Prisma.empty) parts.push(bc);
    if (dimensions.groupId)
      parts.push(Prisma.sql`AND sp."groupId" = ${String(dimensions.groupId)}`);
    if (dimensions.studentId)
      parts.push(Prisma.sql`AND sp."studentId" = ${String(dimensions.studentId)}`);
    if (dimensions.courseId)
      parts.push(Prisma.sql`AND g."courseId" = ${String(dimensions.courseId)}`);
    return Prisma.join(parts, ' ');
  }

  /** UMUMIY DEBITORLIK + YOSH TAHLILI (aging). */
  async getReceivables(filters: AnalyticsFilter = {}) {
    const range = parseRange(filters);
    const where = this.planWhere({
      ...range,
      branchId: filters.branchId || null,
      dimensions: filters as Record<string, unknown>,
    });

    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT
        COALESCE(SUM(sp."expectedAmount") FILTER (WHERE NOT sp."writtenOff"), 0) AS "expected",
        COALESCE(SUM(sp."paidAmount")     FILTER (WHERE NOT sp."writtenOff"), 0) AS "collected",
        COALESCE(SUM(${REMAINING})        FILTER (WHERE NOT sp."writtenOff"), 0) AS "outstanding",
        COALESCE(SUM(sp."writeOffAmount") FILTER (WHERE sp."writtenOff"), 0)     AS "badDebt",
        COALESCE(SUM(${REMAINING}) FILTER (
          WHERE NOT sp."writtenOff" AND ${DAYS_OVERDUE} > 0), 0)                 AS "overdue",
        -- YOSH GURUHLARI (muddatdan keyingi kunlar)
        COALESCE(SUM(${REMAINING}) FILTER (
          WHERE NOT sp."writtenOff" AND ${DAYS_OVERDUE} <= 0), 0)                AS "notDue",
        COALESCE(SUM(${REMAINING}) FILTER (
          WHERE NOT sp."writtenOff" AND ${DAYS_OVERDUE} > 0  AND ${DAYS_OVERDUE} <= 7), 0)  AS "d0_7",
        COALESCE(SUM(${REMAINING}) FILTER (
          WHERE NOT sp."writtenOff" AND ${DAYS_OVERDUE} > 7  AND ${DAYS_OVERDUE} <= 30), 0) AS "d8_30",
        COALESCE(SUM(${REMAINING}) FILTER (
          WHERE NOT sp."writtenOff" AND ${DAYS_OVERDUE} > 30 AND ${DAYS_OVERDUE} <= 60), 0) AS "d31_60",
        COALESCE(SUM(${REMAINING}) FILTER (
          WHERE NOT sp."writtenOff" AND ${DAYS_OVERDUE} > 60), 0)                AS "d60plus",
        COUNT(*) FILTER (WHERE NOT sp."writtenOff" AND ${REMAINING} > 0)         AS "debtorRows",
        COUNT(DISTINCT sp."studentId") FILTER (
          WHERE NOT sp."writtenOff" AND ${REMAINING} > 0)                        AS "debtorStudents"
      FROM student_payments sp
      LEFT JOIN groups g ON g.id = sp."groupId"
      WHERE ${where}
    `;
    const r = rows[0] || {};
    const expected = n(r.expected);
    const collected = n(r.collected);

    return {
      period: { from: range.from, to: range.to },
      totals: {
        expected,
        collected,
        outstanding: n(r.outstanding),
        overdue: n(r.overdue),
        badDebt: n(r.badDebt),
        // UNDIRISH DARAJASI: to'langan / kutilgan.
        // Kutilgan 0 bo'lsa `null` — "100%" deyish yolg'on bo'lardi.
        collectionRate: ratioPercent(collected, expected),
        debtorRows: Number(r.debtorRows || 0),
        debtorStudents: Number(r.debtorStudents || 0),
      },
      aging: {
        notDue: n(r.notDue),
        d0_7: n(r.d0_7),
        d8_30: n(r.d8_30),
        d31_60: n(r.d31_60),
        d60plus: n(r.d60plus),
      },
    };
  }

  /**
   * KESIM BO'YICHA DEBITORLIK — drill-down uchun.
   *
   * BITTA SO'ROV bilan (N+1 yo'q): `by` faqat qat'iy ro'yxatdan tanlanadi,
   * ya'ni bu yerda SQL in'ektsiyasi mumkin emas.
   */
  async getReceivablesBy(by: string, filters: AnalyticsFilter = {}) {
    const g = GROUPINGS[by];
    if (!g) throw new Error(`Noma'lum kesim: ${by}`);
    const range = parseRange(filters);
    const where = this.planWhere({
      ...range,
      branchId: filters.branchId || null,
      dimensions: filters as Record<string, unknown>,
    });
    const col = Prisma.raw(g.col);
    const limit = Math.min(Number(filters.limit) || 50, 200);

    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT ${col} AS "id",
        COALESCE(SUM(sp."expectedAmount") FILTER (WHERE NOT sp."writtenOff"), 0) AS "expected",
        COALESCE(SUM(sp."paidAmount")     FILTER (WHERE NOT sp."writtenOff"), 0) AS "collected",
        COALESCE(SUM(${REMAINING})        FILTER (WHERE NOT sp."writtenOff"), 0) AS "outstanding",
        COALESCE(SUM(${REMAINING}) FILTER (
          WHERE NOT sp."writtenOff" AND ${DAYS_OVERDUE} > 60), 0)                AS "d60plus",
        COUNT(DISTINCT sp."studentId")                                           AS "students"
      FROM student_payments sp
      LEFT JOIN groups g ON g.id = sp."groupId"
      WHERE ${where}
      GROUP BY ${col}
      HAVING COALESCE(SUM(${REMAINING}) FILTER (WHERE NOT sp."writtenOff"), 0) > 0
      ORDER BY "outstanding" DESC
      LIMIT ${limit}
    `;

    const ids = rows.map((r) => r.id).filter(Boolean) as string[];
    // ⚠ O'QUVCHI qatori `personName` bilan yechiladi — `student` bilan
    // EMAS: bu yerda `username` zaxirasi YO'Q (batafsil izoh
    // `name-resolver.service.ts` da).
    const names = await this.names.resolve(by === 'student' ? 'personName' : by, ids);

    return rows.map((r) => ({
      id: r.id,
      name: names.get(String(r.id)) || '',
      expected: n(r.expected),
      collected: n(r.collected),
      outstanding: n(r.outstanding),
      overdue60plus: n(r.d60plus),
      students: Number(r.students || 0),
      collectionRate: ratioPercent(n(r.collected), n(r.expected)),
    }));
  }
}
