import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  parseRange,
  previousRange,
  branchClause,
  planPeriodClause,
  type AnalyticsFilter,
  type Range,
} from './analytics-filter.js';
import { compare, ratioPercent, n } from './metrics.js';

/**
 * ══════════════════════════════════════════════════════════════════════
 * CHEGIRMA TAHLILI (Faza 5) — `services/discount.service.js`
 * ══════════════════════════════════════════════════════════════════════
 *
 * MANBA — `StudentPayment.discountApplied`, jurnal EMAS.
 *
 * NEGA: chegirma PUL HARAKATI EMAS. U — olinmagan pul. Jurnalda
 * hech qanday izi yo'q va bo'lmasligi ham kerak (aks holda soxta
 * daromad va soxta xarajat yozilardi).
 *
 * Oylik planda esa uchala raqam ham bor va ular bir-biriga bog'langan:
 *   baseFee         — asl narx
 *   discountApplied — chegirma
 *   expectedAmount  — yakuniy narx
 *
 * ── CHEGIRMA DARAJASI ──
 *   discountRate = chegirma / asl narx (baseFee yig'indisi)
 * Maxraj `baseFee`: yakuniy narx olinsa chegirma ikki marta ta'sir
 * qilib, foiz haqiqatdan kattaroq chiqardi.
 */
@Injectable()
export class DiscountService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  private planWhere(
    range: Range,
    branchId: string | null,
    filters: AnalyticsFilter = {},
  ): Prisma.Sql {
    // ── MAXRAJ BARCHA PLANLARNI QAMRAB OLADI ──
    //
    // Bu yerda ilgari `AND sp."discountApplied" > 0` sharti bor edi va u
    // chegirma darajasini JIMGINA buzardi: maxrajga faqat CHEGIRMA
    // OLGANLARNING narxi tushardi.
    //
    // Test buni ochdi: haqiqiy daraja 100 000 / 3 000 000 = 3.3% bo'lgani
    // holda 100 000 / 800 000 = 12.5% chiqardi — ya'ni deyarli TO'RT
    // BAROBAR yuqori. Bunday raqam ustida "chegirma siyosatini qayta
    // ko'rish" qarori qabul qilinishi mumkin edi.
    //
    // "Chegirma darajasi" — potentsial daromadning qancha ulushidan voz
    // kechganimiz, ya'ni maxraj BARCHA planning asl narxi.
    const parts: Prisma.Sql[] = [planPeriodClause('sp', range.from, range.to)];
    const bc = branchClause('sp."branchId"', branchId);
    if (bc !== Prisma.empty) parts.push(bc);
    if (filters.groupId)
      parts.push(Prisma.sql`AND sp."groupId" = ${String(filters.groupId)}`);
    if (filters.courseId)
      parts.push(Prisma.sql`AND g."courseId" = ${String(filters.courseId)}`);
    return Prisma.join(parts, ' ');
  }

  private async totals(range: Range, branchId: string | null, filters: AnalyticsFilter) {
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT COALESCE(SUM(sp."discountApplied"), 0) AS "discount",
             COALESCE(SUM(sp."baseFee"), 0)         AS "baseFee",
             COUNT(*) FILTER (WHERE sp."discountApplied" > 0) AS "rows",
             COUNT(DISTINCT sp."studentId") FILTER (WHERE sp."discountApplied" > 0) AS "students",
             COUNT(DISTINCT sp."studentId")          AS "allStudents"
      FROM student_payments sp
      LEFT JOIN groups g ON g.id = sp."groupId"
      WHERE ${this.planWhere(range, branchId, filters)}
    `;
    return rows[0] || {};
  }

  private async groupedBy(
    col: string,
    range: Range,
    branchId: string | null,
    filters: AnalyticsFilter,
    nameKind: string,
  ) {
    const c = Prisma.raw(col);
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT ${c} AS "id",
        COALESCE(SUM(sp."discountApplied"), 0) AS "discount",
        COALESCE(SUM(sp."baseFee"), 0)         AS "baseFee",
        COUNT(DISTINCT sp."studentId") FILTER (WHERE sp."discountApplied" > 0) AS "students"
      FROM student_payments sp
      LEFT JOIN groups g ON g.id = sp."groupId"
      WHERE ${this.planWhere(range, branchId, filters)} AND ${c} IS NOT NULL
      GROUP BY ${c}
      HAVING COALESCE(SUM(sp."discountApplied"), 0) > 0
      ORDER BY "discount" DESC
      LIMIT 20
    `;
    const ids = rows.map((r) => String(r.id));
    let names = new Map<string, string>();
    if (ids.length) {
      if (nameKind === 'branch') {
        const x = await this.prisma.branch.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true },
        });
        names = new Map(x.map((r) => [r.id, r.name]));
      } else if (nameKind === 'course') {
        const x = await this.prisma.course.findMany({
          where: { id: { in: ids } },
          select: { id: true, title: true },
        });
        names = new Map(x.map((r) => [r.id, r.title]));
      } else {
        const x = await this.prisma.group.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true },
        });
        names = new Map(x.map((r) => [r.id, r.name]));
      }
    }
    return rows.map((r) => ({
      id: r.id,
      name: names.get(String(r.id)) || '',
      discount: n(r.discount),
      baseFee: n(r.baseFee),
      students: Number(r.students || 0),
      discountRatePercent: ratioPercent(n(r.discount), n(r.baseFee)),
    }));
  }

  /**
   * CHEGIRMA TURI bo'yicha — `Discount.kind` (Faza 5 da qo'shilgan).
   *
   * ── ⚠ B26 TUZATILDI: FILIAL KO'LAMI ──
   * Ilgari bu yerda `const bc = branchClause(...) === Prisma.empty
   * ? Prisma.empty : Prisma.empty;` turardi — ternarning IKKALA
   * TARMOG'I ham bo'sh, ya'ni ko'lam natijasi TASHLAB YUBORILARDI.
   * Ustun nomi ham xato edi (`d."studentId"` filial ustuni EMAS).
   *
   * Natija: aniq `?branchId=` berilmasa bu kesim BUTUN TASHKILOT
   * chegirmalarini qaytarardi — fayldagi boshqa hamma kesim
   * (`byBranch`/`byCourse`/`byGroup`) esa ko'lamni to'g'ri qo'llardi.
   *
   * ── NEGA `EXISTS`, TO'G'RIDAN FILTR EMAS ──
   * `Discount` da `branchId` YO'Q: u guruhga tegishli, guruh esa
   * filialga. Bitta `EXISTS` ikkala holatni ham qamraydi — aniq filial
   * ham, ALS ko'lami ham (`branchClause` ikkalasini ham qaytaradi).
   *
   * ⚠ IKKALA STEKDA BIR VAQTDA tuzatildi — aks holda paritet buzilib,
   * tuzatish "ko'chirish regressiyasi" bo'lib ko'rinardi.
   */
  private async byKind(_range: Range, branchId: string | null) {
    const bc = branchClause('g2."branchId"', branchId);
    const scope =
      bc === Prisma.empty
        ? Prisma.empty
        : Prisma.sql`AND EXISTS (
            SELECT 1 FROM groups g2 WHERE g2.id = d."groupId" ${bc})`;
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT d.kind::text AS "kind", d.type::text AS "type",
             COUNT(*) AS "count",
             COUNT(DISTINCT d."studentId") AS "students"
      FROM discounts d
      WHERE d."isDeleted" = false AND d."isActive" = true
        ${scope}
      GROUP BY d.kind, d.type
      ORDER BY "count" DESC
    `;
    return rows.map((r) => ({
      kind: r.kind,
      type: r.type,
      count: Number(r.count || 0),
      students: Number(r.students || 0),
    }));
  }

  async getDiscountAnalytics(filters: AnalyticsFilter = {}) {
    const range = parseRange(filters);
    const prev = previousRange(range);
    const branchId = filters.branchId || null;

    const [cur, was, byBranch, byCourse, byGroup, kinds] = await Promise.all([
      this.totals(range, branchId, filters),
      this.totals(prev, branchId, filters),
      this.groupedBy('sp."branchId"', range, branchId, filters, 'branch'),
      this.groupedBy('g."courseId"', range, branchId, filters, 'course'),
      this.groupedBy('sp."groupId"', range, branchId, filters, 'group'),
      this.byKind(range, branchId),
    ]);

    const discount = n(cur.discount);
    const rowCount = Number(cur.rows || 0);

    return {
      period: { from: range.from, to: range.to },
      total: compare(discount, n(was.discount)),
      // O'RTACHA — faqat CHEGIRMA OLGAN qatorlar bo'yicha ("qanchalik
      // chuqur"), darajadan farqli savol.
      averagePerDiscountedRow: rowCount ? Math.round(discount / rowCount) : 0,
      discountedStudents: Number(cur.students || 0),
      totalStudents: Number(cur.allStudents || 0),
      discountRatePercent: {
        current: ratioPercent(discount, n(cur.baseFee)),
        previous: ratioPercent(n(was.discount), n(was.baseFee)),
        formula: "chegirma / BARCHA planning asl narxi (baseFee)",
      },
      byBranch,
      byCourse,
      byGroup,
      byKind: kinds,
    };
  }
}
