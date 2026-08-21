import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import {
  parseRange,
  previousRange,
  journalWhere,
  autoGranularity,
  truncExpr,
  branchClause,
  SQL_EXPENSE,
  SQL_FEES,
  SQL_PAYROLL,
  SQL_EXPENSE_NON_PAYROLL,
  SQL_REVENUE_NET,
  type AnalyticsFilter,
} from './analytics-filter.js';
import { compare, ratioPercent, n } from './metrics.js';

/**
 * ══════════════════════════════════════════════════════════════════════
 * CHIQIM TAHLILI (`services/expense.service.js` EKVIVALENTI)
 * ══════════════════════════════════════════════════════════════════════
 *
 * MANBA — JURNAL. `Expense` jadvali emas.
 *
 * NEGA: maosh `Expense` jadvalida YO'Q (u `SalaryTransaction` da), lekin
 * u markazning odatda ENG KATTA xarajati. `Expense` dan yig'ilsa
 * "chiqimlar" maoshsiz ko'rinardi va byudjet/fakt taqqoslash ma'nosiz
 * bo'lardi. Jurnalda esa ikkalasi ham bor va bitta qoidaga bo'ysunadi.
 *
 * Aynan shu sabab STEP 4 da maosh yozuviga `expenseCategoryId`
 * (Maosh kategoriyasi) muhrlangan edi.
 */

// Komissiya "chiqim" bo'lmaydigan kesimlar — quyidagi `feesAreCost`
// izohiga qarang. Kontrollerdagi bir xil nomli ro'yxat RUXSAT uchun,
// bu esa HISOB uchun: ikkalasi bir xil o'lchovlarni sanaydi, lekin
// sabablari boshqa va ular birga o'zgarmasligi ham mumkin.
const PAYROLL_DIMENSIONS: readonly string[] = Object.freeze(['person', 'teacher']);

const EXPENSE_BREAKDOWNS: Readonly<Record<string, { col: string; kind: string }>> =
  Object.freeze({
    category: { col: 'e."expenseCategoryId"', kind: 'expenseCategory' },
    person: { col: 'COALESCE(e."teacherId", e."staffId")', kind: 'person' },
    teacher: { col: 'e."teacherId"', kind: 'teacher' },
    branch: { col: 'e."branchId"', kind: 'branch' },
    group: { col: 'e."groupId"', kind: 'group' },
    costType: { col: 'e."costType"::text', kind: 'costType' },
  });

const COST_TYPE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  fixed: 'Doimiy',
  variable: "O'zgaruvchan",
});

@Injectable()
export class ExpenseService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** CHIQIM DINAMIKASI. */
  async getExpenseTrend(filters: AnalyticsFilter = {}) {
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
  }

  /**
   * KATEGORIYA KESIMI + OLDINGI DAVR bilan taqqoslash.
   *
   * "Qaysi xarajat O'SAYAPTI?" — bu sahifadagi ASOSIY savol, shuning
   * uchun oldingi davr ALOHIDA so'rov emas, BITTA so'rovda `FILTER`
   * bilan olinadi (ikki marta borish-kelish shart emas).
   *
   * ⚠ NON-OPERATING RO'YXATI BU YERDA OCHIQ YOZILGAN, `journalWhere`
   * ISHLATILMAYDI. Sabab: so'rov IKKI davrni bitta o'qishda qamraydi
   * (`prev.from` dan `range.to` gacha), ya'ni `journalWhere` ning
   * bitta-oraliq shakli to'g'ri kelmaydi. Express'da ham aynan shunday
   * va ro'yxat qo'lda takrorlangan — ko'chirishda BIRLASHTIRILMADI,
   * chunki bu xatti-harakatni o'zgartirish xavfini tug'dirardi.
   * (Ro'yxat ajralib ketishi mumkinligi `MIGRATION-CHECKLIST.md` B28.)
   */
  async getExpenseBreakdown(filters: AnalyticsFilter = {}) {
    const range = parseRange(filters);
    const prev = previousRange(range);
    const branchId = filters.branchId || null;
    const bc = branchClause('e."branchId"', branchId);

    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
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

    const ids = rows.map((r) => r.id).filter(Boolean) as string[];
    const cats = ids.length
      ? await this.prisma.expenseCategory.findMany({
          where: { id: { in: ids } },
          select: { id: true, name: true, kind: true, costType: true },
        })
      : [];
    const byId = new Map(cats.map((c) => [c.id, c]));

    const items: Array<Record<string, unknown>> = rows.map((r) => {
      const cat = byId.get(String(r.id));
      return {
        categoryId: r.id,
        // O'lchovsiz yozuv (masalan eski backfill) — "Kategoriyasiz".
        name: cat?.name || (r.id ? '' : 'Kategoriyasiz'),
        kind: cat?.kind || null,
        costType: cat?.costType || null,
        count: Number(r.count || 0),
        ...compare(n(r.current), n(r.previous)),
      };
    });

    const total = items.reduce((s, i) => s + (i.current as number), 0);
    for (const i of items) i.sharePercent = ratioPercent(i.current, total);
    items.sort((a, b) => (b.current as number) - (a.current as number));

    return {
      period: { from: range.from, to: range.to },
      previousPeriod: { from: prev.from, to: prev.to },
      total,
      items,
      // ENG TEZ O'SAYOTGANLAR — ogohlantirish tizimi shu ro'yxatdan oziqlanadi.
      topGrowing: [...items]
        .filter((i) => i.changePercent !== null && (i.change as number) > 0)
        .sort((a, b) => (b.changePercent as number) - (a.changePercent as number))
        .slice(0, 10),
    };
  }

  private async expenseNames(kind: string, ids: string[]): Promise<Map<string, string>> {
    if (!ids.length) return new Map();
    if (kind === 'expenseCategory') {
      const rows = await this.prisma.expenseCategory.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      });
      return new Map(rows.map((r) => [r.id, r.name]));
    }
    if (kind === 'person' || kind === 'teacher') {
      const rows = await this.prisma.user.findMany({
        where: { id: { in: ids } },
        select: { id: true, firstName: true, lastName: true, username: true, role: true },
      });
      return new Map(
        rows.map((r) => [
          r.id,
          `${r.firstName || ''} ${r.lastName || ''}`.trim() || r.username || '',
        ]),
      );
    }
    if (kind === 'branch') {
      const rows = await this.prisma.branch.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      });
      return new Map(rows.map((r) => [r.id, r.name]));
    }
    if (kind === 'group') {
      const rows = await this.prisma.group.findMany({
        where: { id: { in: ids } },
        select: { id: true, name: true },
      });
      return new Map(rows.map((r) => [r.id, r.name]));
    }
    if (kind === 'costType') {
      return new Map(ids.map((id) => [id, COST_TYPE_LABELS[id] || id]));
    }
    return new Map();
  }

  /**
   * ══════════════════════════════════════════════════════════════════
   * CHIQIM KESIMI — "PUL QAYERGA KETDI?" (talab 10)
   * ══════════════════════════════════════════════════════════════════
   *
   * NEGA `getExpenseBreakdown` YETARLI EMAS: u faqat KATEGORIYA beradi
   * ("Maosh — 4.2 mln"). Talab esa zanjirni davom ettirishni so'raydi:
   *
   *     Maosh 4.2 mln  →  O'qituvchi A 1.4 mln  →  guruhlari  →  yozuvlar
   *
   * Kategoriyadan keyingi bo'g'in ODAM. Jurnal yozuvida `teacherId` va
   * `staffId` allaqachon muhrlangan (STEP 4), ya'ni bu yerda YANGI
   * ma'lumot yaratilmaydi — mavjud o'lchov bo'yicha guruhlash ochiladi.
   *
   * ── NEGA `person` BITTA KESIM, `teacher`/`staff` EMAS ──
   * Foydalanuvchi "maosh kimga ketdi" deb so'raydi, "o'qituvchimi yoki
   * xodimmi" deb emas. COALESCE ikkalasini bitta ustunga yig'adi va
   * javob qatorida kim ekani `kind` bilan ko'rsatiladi.
   *
   * ⚠ RUXSAT: bu kesim MAOSH TANNARXINI odam bo'yicha ochadi, shuning
   * uchun KONTROLLER darajasida `salary.read`/`payroll.read` talab
   * qilinadi. Servis o'zi ruxsat tekshirmaydi — bu qatlamning qoidasi
   * (istisno: `entry-detail.service.ts`, u yerda sabab yozilgan).
   */
  async getExpenseBy(by: string, filters: AnalyticsFilter = {}) {
    const meta = EXPENSE_BREAKDOWNS[by];
    if (!meta) throw new Error(`Noma'lum chiqim kesimi: ${by}`);

    const range = parseRange(filters);
    // `journalWhere` non-operating yozuvlarni (egasi puli, o'tkazma)
    // o'zi chiqarib tashlaydi — chiqim ta'rifi butun modulda BITTA.
    const where = journalWhere({
      ...range,
      branchId: filters.branchId || null,
      dimensions: filters as Record<string, unknown>,
    });
    const c = Prisma.raw(meta.col);
    const limit = Math.min(Number(filters.limit) || 50, 200);

    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT ${c} AS "id",
        ${SQL_EXPENSE}            AS "expense",
        ${SQL_PAYROLL}            AS "payroll",
        ${SQL_EXPENSE_NON_PAYROLL} AS "other",
        ${SQL_FEES}               AS "fees",
        COUNT(DISTINCT e.id)      AS "entries"
      FROM journal_lines l
      JOIN journal_entries e ON e.id = l."entryId"
      WHERE ${where} AND ${c} IS NOT NULL
      GROUP BY ${c}
      HAVING (${SQL_EXPENSE} + ${SQL_FEES}) <> 0
      ORDER BY "expense" DESC
      LIMIT ${limit}
    `;

    const ids = rows.map((r) => String(r.id)).filter(Boolean);
    const names = await this.expenseNames(meta.kind, ids);

    // ── KOMISSIYA QAYSI KESIMDA "CHIQIM" ──
    //
    // Kategoriya/filial kesimida komissiya CHIQIM: markaz uni to'lagan
    // va u mavjud `/expenses/breakdown` jamisiga ham kiradi (ikkalasi
    // bir xil raqam berishi shart).
    //
    // ODAM kesimida esa YO'Q. "Kimga to'landi?" degan savolga komissiya
    // javob bermaydi — u Click/Payme ga ketgan, o'qituvchiga emas.
    // Jurnalda komissiya yozuvi o'sha guruhning `teacherId` si bilan
    // muhrlangani uchun u qo'shilsa "O'qituvchi A — 1.614 mln" chiqardi,
    // holbuki odam qo'liga 1.6 mln tekkan. Yig'indi 14 ming ga
    // "adashgan" ko'rinardi va zanjirga bo'lgan ishonch yo'qolardi.
    const feesAreCost = !PAYROLL_DIMENSIONS.includes(by);
    const amountOf = (r: Record<string, unknown>) =>
      n(r.expense) + (feesAreCost ? n(r.fees) : 0);
    const total = rows.reduce((s, r) => s + amountOf(r), 0);

    return {
      by,
      kind: meta.kind,
      period: { from: range.from, to: range.to },
      // Komissiya `amount` ga kirmagan kesimda buni OCHIQ aytamiz —
      // UI izohni shundan oladi, o'zi taxmin qilmaydi.
      feesIncluded: feesAreCost,
      total,
      items: rows.map((r) => {
        const amount = amountOf(r);
        return {
          id: String(r.id),
          name: names.get(String(r.id)) || '',
          amount,
          payroll: n(r.payroll),
          other: n(r.other),
          // Odam kesimida: shu odamning yozuvlariga tegib o'tgan
          // komissiya (uning xarajati EMAS, kontekst uchun).
          fees: n(r.fees),
          entries: Number(r.entries || 0),
          sharePercent: ratioPercent(amount, total),
        };
      }),
    };
  }

  /**
   * DOIMIY va O'ZGARUVCHAN XARAJAT (Faza 8).
   *
   * `costType` jurnal yozuviga STEP 4 da muhrlanadi (chiqimdan yoki
   * kategoriyadan meros). Muhrlanmagan eski yozuvlar `unclassified`
   * bo'lib ALOHIDA ko'rsatiladi — ularni "o'zgaruvchan" deb hisoblash
   * zarar chegarasi (break-even) hisobini jimgina buzardi.
   */
  async getCostStructure(filters: AnalyticsFilter = {}) {
    const range = parseRange(filters);
    const where = journalWhere({
      ...range,
      branchId: filters.branchId || null,
      dimensions: filters as Record<string, unknown>,
    });

    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT COALESCE(e."costType"::text, 'unclassified') AS "costType",
        COALESCE(SUM(CASE WHEN l."accountKind" IN ('expense','payment_fee')
          THEN l.debit - l.credit ELSE 0 END), 0) AS "amount"
      FROM journal_lines l
      JOIN journal_entries e ON e.id = l."entryId"
      WHERE ${where}
      GROUP BY COALESCE(e."costType"::text, 'unclassified')
    `;
    const revRows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT ${SQL_REVENUE_NET} AS "revenue"
      FROM journal_lines l JOIN journal_entries e ON e.id = l."entryId"
      WHERE ${where}
    `;

    const map = Object.fromEntries(rows.map((r) => [String(r.costType), n(r.amount)]));
    const fixed = map.fixed || 0;
    const variable = map.variable || 0;
    const unclassified = map.unclassified || 0;
    const total = fixed + variable + unclassified;
    const revenue = n(revRows[0]?.revenue);

    return {
      period: { from: range.from, to: range.to },
      fixed,
      variable,
      unclassified,
      total,
      fixedRatioPercent: ratioPercent(fixed, total),
      variableRatioPercent: ratioPercent(variable, total),
      // HISSA (contribution): daromad − o'zgaruvchan xarajat.
      // `unclassified` ATAYLAB kiritilmaydi — noma'lumni o'zgaruvchan deb
      // hisoblash hissani kamaytirib ko'rsatardi.
      contributionAfterVariable: revenue - variable,
      revenue,
      note:
        unclassified > 0
          ? "Bir qism chiqim doimiy/o'zgaruvchan sifatida belgilanmagan — hissa hisobiga kiritilmadi"
          : null,
    };
  }

  /** TAKRORLANUVCHI va BIR MARTALIK chiqim (Faza 9). */
  async getRecurringSplit(filters: AnalyticsFilter = {}) {
    const range = parseRange(filters);
    const bc = branchClause('ex."branchId"', filters.branchId || null);
    const rows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
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
  }

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
   *
   * ⚠⚠ BYUDJET TANLASHDA FILIAL KO'LAMI YO'Q (B27) ⚠⚠
   * `branchId` ANIQ berilmasa `findFirst` butun tashkilot bo'yicha
   * qidiradi va boshqa filialning byudjetini qaytarishi mumkin. Faktik
   * summa (`journalWhere`) esa ko'lamda qoladi — ya'ni plan va fakt
   * turli filialga tegishli bo'lib chiqishi mumkin.
   * ⚠ BU YERDA TUZATILMADI (ko'chirish xatti-harakatni o'zgartirmaydi);
   * `MIGRATION-CHECKLIST.md` B27 da qayd etilgan.
   */
  async getBudgetPerformance(filters: AnalyticsFilter = {}) {
    const range = parseRange(filters);
    const branchId = filters.branchId || null;
    const year = range.from.getUTCFullYear();
    const month = range.from.getUTCMonth() + 1;

    const budget = await this.prisma.budget.findFirst({
      where: {
        isDeleted: false,
        year,
        OR: [
          { periodType: 'month', month },
          { periodType: 'year', month: 0 },
        ],
        ...(branchId ? { branchId } : {}),
      } as never,
      include: {
        lines: { include: { category: { select: { id: true, name: true, kind: true } } } },
      },
      orderBy: { periodType: 'asc' },
    });

    if (!budget) {
      return {
        period: { from: range.from, to: range.to },
        hasBudget: false,
        message: 'Bu davr uchun byudjet belgilanmagan',
        lines: [],
        total: null,
      };
    }

    const where = journalWhere({ ...range, branchId, dimensions: {} });
    const actualRows = await this.prisma.$queryRaw<Record<string, unknown>[]>`
      SELECT e."expenseCategoryId" AS "categoryId",
        COALESCE(SUM(CASE WHEN l."accountKind" IN ('expense','payment_fee')
          THEN l.debit - l.credit ELSE 0 END), 0) AS "actual"
      FROM journal_lines l
      JOIN journal_entries e ON e.id = l."entryId"
      WHERE ${where}
      GROUP BY e."expenseCategoryId"
    `;
    const actualByCat = new Map(
      actualRows.map((r) => [String(r.categoryId), n(r.actual)]),
    );
    const actualTotal = actualRows.reduce((s, r) => s + n(r.actual), 0);

    const catKinds = await this.prisma.expenseCategory.findMany({
      where: { id: { in: [...actualByCat.keys()].filter((k) => k && k !== 'null') } },
      select: { id: true, kind: true },
    });
    const kindByCat = new Map(catKinds.map((c) => [c.id, c.kind]));
    const actualByKind = new Map<string, number>();
    for (const [catId, amount] of actualByCat) {
      const kind = kindByCat.get(catId) || 'operating';
      actualByKind.set(kind, (actualByKind.get(kind) || 0) + amount);
    }

    const variance = (budgeted: number, actual: number) => ({
      budget: budgeted,
      actual,
      // MANFIY = tejaldi, MUSBAT = oshib ketdi.
      variance: actual - budgeted,
      variancePercent: ratioPercent(actual - budgeted, budgeted),
      status:
        budgeted > 0 && actual > budgeted * 1.1
          ? 'over'
          : budgeted > 0 && actual < budgeted * 0.9
            ? 'under'
            : 'on_track',
    });

    const lines = (budget as never as { lines: any[] }).lines.map((ln) => {
      const budgeted = n(ln.amount);
      let actual = 0;
      let label = '';
      if (ln.scope === 'category') {
        actual = actualByCat.get(String(ln.categoryId)) || 0;
        label = ln.category?.name || '';
      } else if (ln.scope === 'kind') {
        actual = actualByKind.get(ln.categoryKind) || 0;
        label = ln.categoryKind || '';
      } else {
        actual = actualTotal;
        label = 'Jami';
      }
      return {
        id: ln.id,
        scope: ln.scope,
        categoryId: ln.categoryId || null,
        categoryKind: ln.categoryKind || null,
        label,
        ...variance(budgeted, actual),
      };
    });

    const totalLine = (budget as never as { lines: any[] }).lines.find(
      (l) => l.scope === 'total',
    );
    return {
      period: { from: range.from, to: range.to },
      hasBudget: true,
      budgetId: budget.id,
      budgetName: (budget as never as { name: string }).name,
      periodType: (budget as never as { periodType: string }).periodType,
      total: totalLine ? variance(n(totalLine.amount), actualTotal) : null,
      actualTotal,
      lines,
      overBudget: lines.filter((l) => l.status === 'over'),
    };
  }
}
