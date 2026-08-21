import prisma from "../../../config/prisma.js";
import { Prisma } from "@prisma/client";
import {
  parseRange, previousRange, journalWhere, autoGranularity, truncExpr,
  SQL_REVENUE_NET, SQL_REVENUE_GROSS, SQL_REFUNDS, SQL_FEES,
} from "./analyticsFilter.js";
import { compare, ratioPercent, n } from "./metrics.js";

/**
 * ══════════════════════════════════════════════════════════════════════
 * DAROMAD TAHLILI
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
 *
 * Manba hujjatlar drill-down uchun KEYIN qo'shiladi (jurnal yozuvining
 * `refModel`/`refId` si orqali) — lekin ular ikkinchi "daromad
 * haqiqati" bo'lmaydi.
 */

const nameResolvers = {
  branch: async (ids) => {
    const rows = await prisma.branch.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    return new Map(rows.map((r) => [r.id, r.name]));
  },
  course: async (ids) => {
    const rows = await prisma.course.findMany({ where: { id: { in: ids } }, select: { id: true, title: true } });
    return new Map(rows.map((r) => [r.id, r.title]));
  },
  teacher: async (ids) => {
    const rows = await prisma.user.findMany({
      where: { id: { in: ids } }, select: { id: true, firstName: true, lastName: true },
    });
    return new Map(rows.map((r) => [r.id, `${r.firstName} ${r.lastName || ""}`.trim()]));
  },
  group: async (ids) => {
    const rows = await prisma.group.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    return new Map(rows.map((r) => [r.id, r.name]));
  },
  room: async (ids) => {
    const rows = await prisma.room.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } });
    return new Map(rows.map((r) => [r.id, r.name]));
  },
  // O'QUVCHI — zanjirning eng chuqur nomlangan bo'g'ini.
  //
  // Talab 34: "Guruh A" ni bosgan odam O'QUVCHILAR ro'yxatini ko'rishi
  // kerak. Ilgari bu kesim YO'Q edi va zanjir guruhda uzilardi:
  // qarzdorlik bo'yicha o'quvchi ro'yxati bor edi (receivables/by/student),
  // lekin "kim TO'LADI" degan savolga javob yo'q edi — faqat "kim
  // to'lamadi".
  student: async (ids) => {
    const rows = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, firstName: true, lastName: true, username: true },
    });
    return new Map(rows.map((r) => [
      r.id,
      `${r.firstName || ""} ${r.lastName || ""}`.trim() || r.username || "",
    ]));
  },
};

const BREAKDOWNS = Object.freeze({
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

/** DAROMAD KESIMI — bitta GROUP BY, hech qanday N+1 yo'q. */
export const getRevenueBy = async (by, filters = {}) => {
  const col = BREAKDOWNS[by];
  if (!col) throw new Error(`Noma'lum kesim: ${by}`);
  const range = parseRange(filters);
  const where = journalWhere({ ...range, branchId: filters.branchId || null, dimensions: filters });
  const c = Prisma.raw(col);
  const limit = Math.min(Number(filters.limit) || 50, 200);

  const rows = await prisma.$queryRaw`
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
  const ids = rows.map((r) => r.id).filter(Boolean);
  const names = nameResolvers[by] && ids.length ? await nameResolvers[by](ids) : new Map();

  return rows.map((r) => ({
    id: r.id,
    name: names.get(String(r.id)) || (by === "method" ? String(r.id) : ""),
    revenue: n(r.revenue),
    gross: n(r.gross),
    refunds: n(r.refunds),
    fees: n(r.fees),
    entries: Number(r.entries || 0),
    sharePercent: ratioPercent(n(r.revenue), total),
  }));
};

/**
 * DAROMAD DINAMIKASI (vaqt qatori).
 *
 * Guruhlash SQL'da (`date_trunc`) — barcha yozuvni Node'ga tortib
 * JS'da yig'ish millionlab qatorda ishlamasdi.
 */
export const getRevenueTrend = async (filters = {}) => {
  const range = parseRange(filters);
  const granularity = filters.granularity || autoGranularity(range);
  const where = journalWhere({ ...range, branchId: filters.branchId || null, dimensions: filters });
  const bucket = truncExpr(granularity);

  const rows = await prisma.$queryRaw`
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
};

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
export const getPaymentMethodBreakdown = async (filters = {}) => {
  const range = parseRange(filters);
  const branchScope = filters.branchId
    ? Prisma.sql`AND pt."branchId" = ${String(filters.branchId)}`
    : Prisma.empty;

  const rows = await prisma.$queryRaw`
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
};

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
export const getRefundAnalytics = async (filters = {}) => {
  const range = parseRange(filters);
  const prev = previousRange(range);
  const branchId = filters.branchId || null;

  const load = async (r) => {
    const where = journalWhere({ ...r, branchId, dimensions: filters });
    const rows = await prisma.$queryRaw`
      SELECT ${SQL_REFUNDS} AS "refunds", ${SQL_REVENUE_GROSS} AS "gross",
             COUNT(DISTINCT e.id) FILTER (WHERE e.kind = 'refund') AS "count"
      FROM journal_lines l
      JOIN journal_entries e ON e.id = l."entryId"
      WHERE ${where}
    `;
    return rows[0] || {};
  };

  const [cur, was] = await Promise.all([load(range), load(prev)]);
  const byCourse = await getRefundsBy('e."courseId"', range, branchId, filters);
  const byGroup = await getRefundsBy('e."groupId"', range, branchId, filters);
  const byBranch = await getRefundsBy('e."branchId"', range, branchId, filters);

  return {
    period: { from: range.from, to: range.to },
    amount: compare(n(cur.refunds), n(was.refunds)),
    count: compare(Number(cur.count || 0), Number(was.count || 0)),
    refundRatePercent: {
      current: ratioPercent(n(cur.refunds), n(cur.gross)),
      previous: ratioPercent(n(was.refunds), n(was.gross)),
      formula: "qaytarim / BRUTTO daromad",
    },
    byCourse, byGroup, byBranch,
  };
};

const getRefundsBy = async (col, range, branchId, filters) => {
  const where = journalWhere({ ...range, branchId, dimensions: filters });
  const c = Prisma.raw(col);
  const rows = await prisma.$queryRaw`
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
  const key = col.includes("courseId") ? "course" : col.includes("groupId") ? "group" : "branch";
  const ids = rows.map((r) => r.id).filter(Boolean);
  const names = ids.length ? await nameResolvers[key](ids) : new Map();
  return rows.map((r) => ({
    id: r.id, name: names.get(String(r.id)) || "",
    refunds: n(r.refunds), count: Number(r.count || 0),
  }));
};

export { nameResolvers };
