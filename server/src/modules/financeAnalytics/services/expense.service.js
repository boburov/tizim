import prisma from "../../../config/prisma.js";
import { Prisma } from "@prisma/client";
import {
  parseRange, previousRange, journalWhere, autoGranularity, truncExpr, branchClause,
  SQL_EXPENSE, SQL_FEES, SQL_PAYROLL, SQL_EXPENSE_NON_PAYROLL, SQL_REVENUE_NET,
} from "./analyticsFilter.js";
import { compare, ratioPercent, n } from "./metrics.js";

/**
 * ══════════════════════════════════════════════════════════════════════
 * CHIQIM TAHLILI
 * ══════════════════════════════════════════════════════════════════════
 *
 * MANBA — JURNAL. `Expense` jadvali emas.
 *
 * NEGA: maosh `Expense` jadvalida YO'Q (u SalaryTransaction'da), lekin
 * u markazning odatda ENG KATTA xarajati. `Expense` dan yig'ilsa
 * "chiqimlar" maoshsiz ko'rinardi va byudjet/fakt taqqoslash ma'nosiz
 * bo'lardi. Jurnalda esa ikkalasi ham bor va bitta qoidaga bo'ysunadi.
 *
 * Aynan shu sabab STEP 4 da maosh yozuviga `expenseCategoryId`
 * (Maosh kategoriyasi) muhrlangan edi.
 */

/** CHIQIM DINAMIKASI. */
export const getExpenseTrend = async (filters = {}) => {
  const range = parseRange(filters);
  const granularity = filters.granularity || autoGranularity(range);
  const where = journalWhere({ ...range, branchId: filters.branchId || null, dimensions: filters });
  const bucket = truncExpr(granularity);

  const rows = await prisma.$queryRaw`
    SELECT ${bucket} AS "bucket",
      ${SQL_EXPENSE}             AS "expense",
      ${SQL_PAYROLL}             AS "payroll",
      ${SQL_EXPENSE_NON_PAYROLL} AS "other",
      ${SQL_FEES}                AS "fees"
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
      expense: n(r.expense) + n(r.fees),
      payroll: n(r.payroll),
      other: n(r.other),
      fees: n(r.fees),
    })),
  };
};

/**
 * KATEGORIYA KESIMI + OLDINGI DAVR bilan taqqoslash.
 *
 * "Qaysi xarajat O'SAYAPTI?" — bu sahifadagi ASOSIY savol, shuning
 * uchun oldingi davr ALOHIDA so'rov emas, BITTA so'rovda `FILTER`
 * bilan olinadi (ikki marta borish-kelish shart emas).
 */
export const getExpenseBreakdown = async (filters = {}) => {
  const range = parseRange(filters);
  const prev = previousRange(range);
  const branchId = filters.branchId || null;
  const bc = branchClause('e."branchId"', branchId);

  const rows = await prisma.$queryRaw`
    SELECT e."expenseCategoryId" AS "id",
      COALESCE(SUM(CASE WHEN e.date >= ${range.from} AND e.date <= ${range.to}
        AND l."accountKind" IN ('expense','payment_fee') THEN l.debit - l.credit ELSE 0 END), 0) AS "current",
      COALESCE(SUM(CASE WHEN e.date >= ${prev.from} AND e.date <= ${prev.to}
        AND l."accountKind" IN ('expense','payment_fee') THEN l.debit - l.credit ELSE 0 END), 0) AS "previous",
      COUNT(DISTINCT e.id) FILTER (WHERE e.date >= ${range.from} AND e.date <= ${range.to}) AS "count"
    FROM journal_lines l
    JOIN journal_entries e ON e.id = l."entryId"
    WHERE e.date >= ${prev.from} AND e.date <= ${range.to}
      AND e.kind::text NOT IN ('owner_investment','owner_withdrawal','account_transfer','transfer_send','transfer_receive','inter_branch')
      ${bc}
    GROUP BY e."expenseCategoryId"
    HAVING COALESCE(SUM(CASE WHEN l."accountKind" IN ('expense','payment_fee') THEN l.debit - l.credit ELSE 0 END), 0) <> 0
  `;

  const ids = rows.map((r) => r.id).filter(Boolean);
  const cats = ids.length
    ? await prisma.expenseCategory.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true, kind: true, costType: true },
      })
    : [];
  const byId = new Map(cats.map((c) => [c.id, c]));

  const items = rows.map((r) => {
    const cat = byId.get(String(r.id));
    return {
      categoryId: r.id,
      // O'lchovsiz yozuv (masalan eski backfill) — "Kategoriyasiz".
      name: cat?.name || (r.id ? "" : "Kategoriyasiz"),
      kind: cat?.kind || null,
      costType: cat?.costType || null,
      count: Number(r.count || 0),
      ...compare(n(r.current), n(r.previous)),
    };
  });

  const total = items.reduce((s, i) => s + i.current, 0);
  for (const i of items) i.sharePercent = ratioPercent(i.current, total);
  items.sort((a, b) => b.current - a.current);

  return {
    period: { from: range.from, to: range.to },
    previousPeriod: { from: prev.from, to: prev.to },
    total,
    items,
    // ENG TEZ O'SAYOTGANLAR — ogohlantirish tizimi shu ro'yxatdan oziqlanadi.
    topGrowing: [...items]
      .filter((i) => i.changePercent !== null && i.change > 0)
      .sort((a, b) => b.changePercent - a.changePercent)
      .slice(0, 10),
  };
};

/**
 * DOIMIY va O'ZGARUVCHAN XARAJAT (Faza 8).
 *
 * `costType` jurnal yozuviga STEP 4 da muhrlanadi (chiqimdan yoki
 * kategoriyadan meros). Muhrlanmagan eski yozuvlar `unclassified`
 * bo'lib ALOHIDA ko'rsatiladi — ularni "o'zgaruvchan" deb hisoblash
 * zarar chegarasi (break-even) hisobini jimgina buzardi.
 */
export const getCostStructure = async (filters = {}) => {
  const range = parseRange(filters);
  const where = journalWhere({ ...range, branchId: filters.branchId || null, dimensions: filters });

  const rows = await prisma.$queryRaw`
    SELECT COALESCE(e."costType"::text, 'unclassified') AS "costType",
      COALESCE(SUM(CASE WHEN l."accountKind" IN ('expense','payment_fee')
        THEN l.debit - l.credit ELSE 0 END), 0) AS "amount"
    FROM journal_lines l
    JOIN journal_entries e ON e.id = l."entryId"
    WHERE ${where}
    GROUP BY COALESCE(e."costType"::text, 'unclassified')
  `;
  const revRows = await prisma.$queryRaw`
    SELECT ${SQL_REVENUE_NET} AS "revenue"
    FROM journal_lines l JOIN journal_entries e ON e.id = l."entryId"
    WHERE ${where}
  `;

  const map = Object.fromEntries(rows.map((r) => [r.costType, n(r.amount)]));
  const fixed = map.fixed || 0;
  const variable = map.variable || 0;
  const unclassified = map.unclassified || 0;
  const total = fixed + variable + unclassified;
  const revenue = n(revRows[0]?.revenue);

  return {
    period: { from: range.from, to: range.to },
    fixed, variable, unclassified, total,
    fixedRatioPercent: ratioPercent(fixed, total),
    variableRatioPercent: ratioPercent(variable, total),
    // HISSA (contribution): daromad − o'zgaruvchan xarajat.
    // `unclassified` ATAYLAB kiritilmaydi — noma'lumni o'zgaruvchan deb
    // hisoblash hissani kamaytirib ko'rsatardi.
    contributionAfterVariable: revenue - variable,
    revenue,
    note: unclassified > 0
      ? "Bir qism chiqim doimiy/o'zgaruvchan sifatida belgilanmagan — hissa hisobiga kiritilmadi"
      : null,
  };
};

/** TAKRORLANUVCHI va BIR MARTALIK chiqim (Faza 9). */
export const getRecurringSplit = async (filters = {}) => {
  const range = parseRange(filters);
  const bc = branchClause('ex."branchId"', filters.branchId || null);
  const rows = await prisma.$queryRaw`
    SELECT (ex."recurringExpenseId" IS NOT NULL) AS "isRecurring",
           COALESCE(SUM(ex.amount), 0) AS "amount",
           COUNT(*) AS "count"
    FROM expenses ex
    WHERE ex."isDeleted" = false
      AND ex."spentAt" >= ${range.from} AND ex."spentAt" <= ${range.to}
      ${bc}
    GROUP BY (ex."recurringExpenseId" IS NOT NULL)
  `;
  const rec = rows.find((r) => r.isRecurring) || {};
  const one = rows.find((r) => !r.isRecurring) || {};
  return {
    period: { from: range.from, to: range.to },
    recurring: { amount: n(rec.amount), count: Number(rec.count || 0) },
    oneTime: { amount: n(one.amount), count: Number(one.count || 0) },
  };
};

/**
 * BYUDJET vs FAKT (Faza 10).
 *
 * BYUDJET JURNALGA YOZILMAYDI — u REJA, pul harakati emas. Taqqoslash
 * faqat SHU YERDA, o'qish paytida bo'ladi.
 *
 * Uch daraja mustaqil taqqoslanadi va ARALASHTIRILMAYDI:
 *   total    — butun davr shifti
 *   category — aniq kategoriya
 *   kind     — kategoriya turi (payroll/operating/tax/capital)
 * Ularni qo'shib yuborish bir xil pulni ikki-uch marta sanardi.
 */
export const getBudgetPerformance = async (filters = {}) => {
  const range = parseRange(filters);
  const branchId = filters.branchId || null;
  const year = range.from.getUTCFullYear();
  const month = range.from.getUTCMonth() + 1;

  const budget = await prisma.budget.findFirst({
    where: {
      isDeleted: false,
      year,
      OR: [{ periodType: "month", month }, { periodType: "year", month: 0 }],
      ...(branchId ? { branchId } : {}),
    },
    include: { lines: { include: { category: { select: { id: true, name: true, kind: true } } } } },
    orderBy: { periodType: "asc" },
  });

  if (!budget) {
    return {
      period: { from: range.from, to: range.to },
      hasBudget: false,
      message: "Bu davr uchun byudjet belgilanmagan",
      lines: [], total: null,
    };
  }

  const where = journalWhere({ ...range, branchId, dimensions: {} });
  const actualRows = await prisma.$queryRaw`
    SELECT e."expenseCategoryId" AS "categoryId",
      COALESCE(SUM(CASE WHEN l."accountKind" IN ('expense','payment_fee')
        THEN l.debit - l.credit ELSE 0 END), 0) AS "actual"
    FROM journal_lines l
    JOIN journal_entries e ON e.id = l."entryId"
    WHERE ${where}
    GROUP BY e."expenseCategoryId"
  `;
  const actualByCat = new Map(actualRows.map((r) => [String(r.categoryId), n(r.actual)]));
  const actualTotal = actualRows.reduce((s, r) => s + n(r.actual), 0);

  const catKinds = await prisma.expenseCategory.findMany({
    where: { id: { in: [...actualByCat.keys()].filter((k) => k && k !== "null") } },
    select: { id: true, kind: true },
  });
  const kindByCat = new Map(catKinds.map((c) => [c.id, c.kind]));
  const actualByKind = new Map();
  for (const [catId, amount] of actualByCat) {
    const kind = kindByCat.get(catId) || "operating";
    actualByKind.set(kind, (actualByKind.get(kind) || 0) + amount);
  }

  const variance = (budgeted, actual) => ({
    budget: budgeted,
    actual,
    // MANFIY = tejaldi, MUSBAT = oshib ketdi.
    variance: actual - budgeted,
    variancePercent: ratioPercent(actual - budgeted, budgeted),
    status: budgeted > 0 && actual > budgeted * 1.1 ? "over"
      : budgeted > 0 && actual < budgeted * 0.9 ? "under" : "on_track",
  });

  const lines = budget.lines.map((ln) => {
    const budgeted = n(ln.amount);
    let actual = 0;
    let label = "";
    if (ln.scope === "category") {
      actual = actualByCat.get(String(ln.categoryId)) || 0;
      label = ln.category?.name || "";
    } else if (ln.scope === "kind") {
      actual = actualByKind.get(ln.categoryKind) || 0;
      label = ln.categoryKind || "";
    } else {
      actual = actualTotal;
      label = "Jami";
    }
    return {
      id: ln.id, scope: ln.scope, categoryId: ln.categoryId || null,
      categoryKind: ln.categoryKind || null, label, ...variance(budgeted, actual),
    };
  });

  const totalLine = budget.lines.find((l) => l.scope === "total");
  return {
    period: { from: range.from, to: range.to },
    hasBudget: true,
    budgetId: budget.id,
    budgetName: budget.name,
    periodType: budget.periodType,
    total: totalLine ? variance(n(totalLine.amount), actualTotal) : null,
    actualTotal,
    lines,
    overBudget: lines.filter((l) => l.status === "over"),
  };
};
