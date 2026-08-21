import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';

import { Prisma } from "@prisma/client";
import { branchFilter } from "../../../common/als/branch-context.js";

/** MOLIYA SIGNALLARI — `signals/finance.signal.js` ning ko'chirmasi. */
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * FILIAL KO'LAMI XOM SQL UCHUN.
 *
 * ═══════════════════════════════════════════════════════════════════
 * `branchMatchStage()` BU YERDA ISHLATILMAYDI.
 *
 * U Mongo quvurida `$match` bosqichi edi va `...branchMatchStage()`
 * ko'rinishida spread qilinardi. Migratsiyadan keyin u PRISMA shaklini
 * qaytaradi — eski kod uni hamon quvurga qo'shgani uchun Mongoose
 * "Arguments must be aggregate pipeline operators" bilan yiqilardi.
 *
 * Xom SQL'da `where` obyekti ishlamaydi, shuning uchun u SQL bo'lagiga
 * aylantiriladi. FAIL-CLOSED: bo'sh ro'yxat `AND FALSE` beradi —
 * hech qaysi filialga biriktirilmagan xodim hech nima ko'rmaydi.
 * ═══════════════════════════════════════════════════════════════════
 */
const rawBranchClause = () => {
  const bf = branchFilter();
  if (!Object.keys(bf).length) return Prisma.empty;
  const v: any = bf.branchId;
  if (typeof v === "string") return Prisma.sql` AND "branchId" = ${v}`;
  if (v?.in) {
    if (!v.in.length) return Prisma.sql` AND FALSE`;
    return Prisma.sql` AND "branchId" IN (${Prisma.join(v.in)})`;
  }
  return Prisma.empty;
};

const num = (v: any) => Number(v) || 0;

/** (yil, oy) juftligini n oy orqaga/oldinga suradi. */
export const shiftMonth = (year: any,month: any,delta: any) => {
  const zero = year * 12 + (month - 1) + delta;
  return { year: Math.floor(zero / 12), month: (zero % 12) + 1 };
};

export const monthKey = ({ year, month }: any) => `${year}-${String(month).padStart(2, "0")}`;

@Injectable()
export class FinanceSignalService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  /**
   * HAQIQATDA YIG'ILGAN daromad - oy bo'yicha.
   *
   * PaymentTransaction.paidAt bo'yicha guruhlanadi (year/month EMAS): bu
   * "qaysi oyda PUL KELDI" degan savol, "qaysi oy uchun to'landi" emas.
   * Pul oqimi uchun aynan birinchisi kerak - iyulda to'langan may qarzi
   * iyul pul oqimida turadi.
   */
  async collectedByMonth(months: any,now: any) {
  const since = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months + 1, 1),
  );
  // `$group` sana QISMLARI bo'yicha - Prisma `groupBy` buni bilmaydi
  // (u faqat butun ustun bo'yicha guruhlaydi), shuning uchun xom SQL.
  const rows: any = await this.prisma.$queryRaw`
    SELECT
      EXTRACT(YEAR  FROM "paidAt")::int AS year,
      EXTRACT(MONTH FROM "paidAt")::int AS month,
      COALESCE(SUM("amount"), 0)::float AS amount,
      COUNT(*)::int                     AS count
    FROM "payment_transactions"
    WHERE "paidAt" >= ${since}
    ${rawBranchClause()}
    GROUP BY 1, 2
    ORDER BY 1, 2
  `;
  return rows.map((r: any) => {
    const key = { year: num(r.year), month: num(r.month) };
    return { ...key, key: monthKey(key), amount: num(r.amount), count: num(r.count) };
  });
}

  /**
   * XARAJAT - oy bo'yicha.
   *
   * HALOL CHEKLOV: kodbazada umumiy xarajat taksonomiyasi YO'Q (ijara,
   * kommunal, marketing uchun model yo'q). Yozilgan yagona chiqim oqimi -
   * o'qituvchi maoshi (SalaryTransaction). Shuning uchun bu signal
   * "jami xarajat" emas, "MAOSH xarajati" deb nomlanadi va insight matnida
   * ham shunday yoziladi. "Marketing +18%" kabi tavsiya berish uchun avval
   * ExpenseCategory modeli kerak - uni bo'lmaganda o'ylab topish yolg'on.
   */
  async salaryExpenseByMonth(months: any,now: any) {
  const since = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - months + 1, 1),
  );
  const rows: any = await this.prisma.$queryRaw`
    SELECT
      EXTRACT(YEAR  FROM "paidAt")::int AS year,
      EXTRACT(MONTH FROM "paidAt")::int AS month,
      COALESCE(SUM("amount"), 0)::float AS amount,
      COUNT(*)::int                     AS count
    FROM "salary_transactions"
    WHERE "isDeleted" = false
      AND "paidAt" >= ${since}
    ${rawBranchClause()}
    GROUP BY 1, 2
    ORDER BY 1, 2
  `;
  return rows.map((r: any) => {
    const key = { year: num(r.year), month: num(r.month) };
    return { ...key, key: monthKey(key), amount: num(r.amount), count: num(r.count) };
  });
}

  /**
   * MUDDATI O'TGAN TO'LOVLAR - filial darajasidagi yig'ma kesim.
   *
   * writtenOff=true chiqarib tashlanadi: u qarz allaqachon yo'qotish deb
   * tan olingan, uni qayta "yig'ilishi kerak" ro'yxatiga qo'yish owner
   * vaqtini behuda sarflashga majbur qilardi.
   *
   * "Muddati o'tgan" = davri TUGAGAN va to'liq yopilmagan. Joriy oy
   * to'lovi hali kechikmagan hisoblanadi (oy davom etmoqda).
   */
  async overdueSignal(now: any) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;

  // `$expr: { $gt: [...] }` — IKKI USTUNNI solishtirish. Prisma buni
  // `where` da qila olmaydi (field reference `not`/`gt` bilan
  // ishlamaydi), shuning uchun xom SQL.
  const rows: any = await this.prisma.$queryRaw`
    SELECT
      COALESCE(SUM("expectedAmount" - "paidAmount"), 0)::float AS amount,
      COUNT(*)::int                                           AS periods,
      COUNT(DISTINCT "studentId")::int                        AS students,
      MIN("year")::int                                        AS "oldestYear",
      (ARRAY_AGG("id"))[1:20]                                 AS ids
    FROM "student_payments"
    WHERE "writtenOff" = false
      AND "status" IN ('unpaid', 'partial')
      AND "expectedAmount" > "paidAmount"
      -- Faqat TUGAGAN davrlar: (year < joriy) yoki (year = joriy va month < joriy).
      AND ("year" < ${year} OR ("year" = ${year} AND "month" < ${month}))
    ${rawBranchClause()}
  `;

  const r = rows[0]?.periods ? rows[0] : null;
  if (!r) {
    return { amount: 0, periods: 0, students: 0, maxDebtDays: 0, ids: [] };
  }

  // Eng eski to'lanmagan davrni aniq topamiz - $min faqat yilni to'g'ri
  // beradi, (yil, oy) juftligining minimumi uchun saralash kerak.
  const oldest: any = await this.prisma.$queryRaw`
    SELECT "year"::int AS year, "month"::int AS month
    FROM "student_payments"
    WHERE "writtenOff" = false
      AND "status" IN ('unpaid', 'partial')
      AND "expectedAmount" > "paidAmount"
      AND ("year" < ${year} OR ("year" = ${year} AND "month" < ${month}))
    ${rawBranchClause()}
    ORDER BY "year", "month"
    LIMIT 1
  `;

  let maxDebtDays = 0;
  if (oldest[0]) {
    const periodEnd = new Date(Date.UTC(num(oldest[0].year), num(oldest[0].month), 0));
    maxDebtDays = Math.max(0, Math.floor((now.getTime() - periodEnd.getTime()) / DAY_MS));
  }

  return {
    amount: num(r.amount),
    periods: num(r.periods),
    // SQL `COUNT(DISTINCT ...)` — Mongo'dagi `$addToSet` + `.length`
    // ning to'g'ridan-to'g'ri ekvivalenti (massivni tashib kelmasdan).
    students: num(r.students),
    maxDebtDays,
    oldestYear: r.oldestYear === null ? undefined : num(r.oldestYear),
    ids: (r.ids || []).map(String),
  };
}

  /**
   * KOGORTLI BASHORAT - keyingi oy daromadi.
   *
   * Rev(keyingi oy) = Σ(faol o'quvchi × kutilgan to'lov × (1 − ketish ehtimoli))
   *
   * Ketish ehtimoli dvigatelning O'ZI hozir hisoblagan churn ball'laridan
   * olinadi (ochiq student_churn_risk insight'lari). Shuning uchun
   * orkestrator tartibi MUHIM: o'quvchi detektori moliyadan OLDIN ishlashi
   * kerak, aks holda bashorat kechagi ballarga tayanadi.
   *
   * Yangi o'quvchi oqimi ATAYLAB kiritilmagan: u lidlardan bashorat
   * qilinadi va bu ikkinchi darajali noaniqlik qo'shadi. Bashorat
   * "hozirgi bazadan kutilayotgan daromad" - konservativ va tushunarli.
   */
  async revenueForecast(branchId: any,now: any) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;

  // (a) Joriy oyning kutilgan daromadi - baza.
  const currentRows: any = await this.prisma.$queryRaw`
    SELECT
      COALESCE(SUM("expectedAmount"), 0)::float AS expected,
      COALESCE(SUM("paidAmount"), 0)::float     AS paid,
      COUNT(DISTINCT "studentId")::int          AS students
    FROM "student_payments"
    WHERE "year" = ${year} AND "month" = ${month} AND "writtenOff" = false
    ${rawBranchClause()}
  `;
  const current = currentRows[0] || { expected: 0, paid: 0, students: 0 };
  const currentStudentCount = num(current.students);

  // (b) Hozir faol o'quvchilar (guruh a'zoligi ochiq).
  const groups = await this.prisma.group.findMany({
    where: { branchId: String(branchId), isDeleted: false, isActive: true },
    select: { id: true },
  });
  // `distinct("student")` o'rni: `distinct: ["studentId"]` + `select`.
  const activeMembers = groups.length
    ? await this.prisma.groupMembership.findMany({
        where: {
          groupId: { in: groups.map((g) => g.id) },
          leftAt: null,
          isDeleted: false,
        },
        select: { studentId: true },
        distinct: ["studentId"],
      })
    : [];
  const activeIds = new Set(activeMembers.map((m) => String(m.studentId)));

  // (c) Ketish xavfi - dvigatel hozir hisoblagan ballardan.
  // `expectedImpact.amount` Mongo'da ichma-ich obyekt edi; Prisma'da u
  // tekis ustun: `expectedImpactAmount`.
  const churnRows = await this.prisma.insight.findMany({
    where: {
      branchId: String(branchId),
      kind: "student_churn_risk",
      status: { in: ["open", "acked"] },
    },
    select: { subjectId: true, score: true, expectedImpactAmount: true },
  });

  let atRisk: number = 0;
  let riskyStudents = 0;
  for (const r of churnRows) {
    // Faqat hali faol o'quvchilar: allaqachon ketganning insight'i
    // yopilishini kutayotgan bo'lishi mumkin.
    if (!activeIds.has(String(r.subjectId))) continue;
    riskyStudents += 1;
    // Kutilayotgan yo'qotish = shu o'quvchining oylik to'lovi × ketish ehtimoli.
    atRisk += ((r.expectedImpactAmount as unknown as number) || 0) * r.score;
  }

  // (d) Yig'ish darajasi - kutilgan daromadning qanchasi HAQIQATDA keladi.
  // Oxirgi 3 tugagan oy bo'yicha. Bu "kutilgan" va "yig'ilgan" orasidagi
  // tarixiy uzilishni bashoratga kiritadi.
  const collectionRate = await this.historicalCollectionRate(now);

  const baseExpected = num(current.expected);
  const forecastGross = Math.max(0, baseExpected - atRisk);
  const forecastNet = forecastGross * collectionRate.rate;

  const deltaRatio = baseExpected > 0 ? (forecastGross - baseExpected) / baseExpected : 0;

  return {
    currentExpected: baseExpected,
    currentPaid: num(current.paid),
    currentStudents: currentStudentCount,
    activeStudents: activeIds.size,
    atRisk,
    riskyStudents,
    collectionRate: collectionRate.rate,
    collectionSample: collectionRate.months,
    forecastGross,
    forecastNet,
    // Manfiy = pasayish kutilmoqda. Insight aynan shu sonni ko'rsatadi.
    deltaRatio,
    nextPeriod: shiftMonth(year, month, 1),
  };
}

  /**
   * TARIXIY YIG'ISH DARAJASI - oxirgi 3 tugagan oy: paid / expected.
   * Bashoratni "hammasi to'lanadi" optimizmidan qutqaradi.
   */
  async historicalCollectionRate(now: any) {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const periods = [1, 2, 3].map((d) => shiftMonth(year, month, -d));

  // `$or: [{year,month}, ...]` -> SQL `(year,month) IN ((..),(..))`.
  const pairs = Prisma.join(
    periods.map((p) => Prisma.sql`(${p.year}, ${p.month})`),
  );
  const rows: any = await this.prisma.$queryRaw`
    SELECT
      COALESCE(SUM("expectedAmount"), 0)::float AS expected,
      COALESCE(SUM("paidAmount"), 0)::float     AS paid
    FROM "student_payments"
    WHERE "writtenOff" = false
      AND ("year", "month") IN (${pairs})
    ${rawBranchClause()}
  `;
  const r = rows[0];
  // Ma'lumot yo'q → 1 (neytral). Sun'iy pessimizm ham xato bo'lardi.
  const expected = num(r?.expected);
  if (!expected) return { rate: 1, months: 0, expected: 0, paid: 0 };
  const paid = num(r?.paid);
  return {
    rate: Math.max(0, Math.min(1, paid / expected)),
    months: periods.length,
    expected,
    paid,
  };
}

  /**
   * PUL OQIMI kesimi - joriy oyda kirim, chiqim va qoldiq.
   * "Kassa ogohlantirishi" shundan chiqadi: chiqim kirimdan oshib ketsa.
   */
  async cashflowSignal(now: any) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const [inRows, outRows]: any[] = await Promise.all([
    this.prisma.$queryRaw`
      SELECT COALESCE(SUM("amount"), 0)::float AS amount
      FROM "payment_transactions"
      WHERE "paidAt" >= ${start}
      ${rawBranchClause()}
    `,
    this.prisma.$queryRaw`
      SELECT COALESCE(SUM("amount"), 0)::float AS amount
      FROM "salary_transactions"
      WHERE "isDeleted" = false AND "paidAt" >= ${start}
      ${rawBranchClause()}
    `,
  ]);

  const inflow = num(inRows[0]?.amount);
  const outflow = num(outRows[0]?.amount);
  // Oyning qancha qismi o'tdi - qoldiqni oy oxiriga proyeksiya qilish uchun.
  const daysInMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const dayOfMonth = now.getUTCDate();
  const monthProgress = daysInMonth > 0 ? dayOfMonth / daysInMonth : 1;

  return {
    inflow,
    outflow,
    net: inflow - outflow,
    monthProgress,
    // Chiziqli proyeksiya: oy oxirigacha shu tezlikda davom etsa.
    // Sodda, lekin tushunarli - va maosh oy oxirida to'lanadi, shuning
    // uchun proyeksiya ATAYLAB pessimistik tomonga qaramaydi.
    projectedInflow: monthProgress > 0 ? inflow / monthProgress : inflow,
  };
}

  /**
   * Barcha moliya signallarini yig'adi.
   * @param {string} branchId
   */
  async collectFinanceSignals(branchId: any,now: any = new Date()) {
  const [collected, expense, overdue, forecast, cashflow] = await Promise.all([
    this.collectedByMonth(7, now),
    this.salaryExpenseByMonth(7, now),
    this.overdueSignal(now),
    this.revenueForecast(branchId, now),
    this.cashflowSignal(now),
  ]);
  return { collected, expense, overdue, forecast, cashflow };
}
}