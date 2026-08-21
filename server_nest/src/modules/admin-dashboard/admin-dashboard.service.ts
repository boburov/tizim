import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ROLES } from '../../common/constants/permissions.js';
import { branchFilter, userBranchCondition } from '../../common/als/branch-context.js';
import { BranchAccessService } from '../../common/rbac/branch-access.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RAHBARIYAT PANELI — `services/adminDashboard.service.js` EKVIVALENTI.
 *
 * ⚠ MAYDON NOMLARI: Mongo'da bog'lanish `group`/`student` edi, Prisma'da
 * `groupId`/`studentId`. Shuning uchun ko'lam helperlariga maydon nomi
 * OCHIQ uzatiladi: `branchGroupFilter("groupId")`.
 *
 * Standart qiymatga tayanib qolish XAVFLI: filtr JIMGINA tushib qolsa
 * panel BUTUN tashkilot raqamlarini ko'rsatardi.
 *
 * ⚠ BARCHA SANA HISOBLARI UTC — Express bilan bir xil. Mahalliy vaqtga
 * o'tkazish oy chegaralarini siljitib, o'tgan oyning raqamini bugun
 * o'zgartirib yuborardi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

// === Sana yordamchilari (UTC) ===
const monthRange = (year: number, month: number) => {
  const y = Number(year);
  const m = Number(month);
  const start = new Date(Date.UTC(y, m - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(y, m, 0, 23, 59, 59, 999));
  return { start, end };
};

const todayRange = () => {
  const now = new Date();
  const start = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0),
  );
  const end = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59, 999),
  );
  return { start, end };
};

const previousMonths = (count: number) => {
  const now = new Date();
  const arr: Array<{ year: number; month: number }> = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    arr.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 });
  }
  return arr;
};

const DAY_LABELS = ['Yak', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh'];
const DAY_SHORT = ['Yak', 'Du', 'Se', 'Ch', 'Pa', 'Ju', 'Sh'];
const MONTH_SHORT = [
  'Yan', 'Fev', 'Mar', 'Apr', 'May', 'Iyn',
  'Iyl', 'Avg', 'Sen', 'Okt', 'Noy', 'Dek',
];

const dayKey = (d: Date) => d.toISOString().slice(0, 10);
const monthKey = (d: Date) => d.getUTCMonth() + 1;

@Injectable()
export class AdminDashboardService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(BranchAccessService) private readonly branchAccess: BranchAccessService,
  ) {}

  /**
   * Foydalanuvchi filtri: `userBranchCondition()` OR beradi, shuning
   * uchun uni `AND` ichiga qo'yamiz (boshqa OR bilan to'qnashmasin).
   */
  private userScoped(base: Record<string, any>): Record<string, any> {
    const cond = userBranchCondition();
    return cond ? { ...base, AND: [cond] } : base;
  }

  /** Bugungi davomat taqsimoti (gauge uchun). */
  private async computeAttendanceGauge() {
    const { start, end } = todayRange();

    const rows = await this.prisma.attendance.groupBy({
      by: ['status'],
      where: {
        // FILIAL: `Attendance` da `branchId` YO'Q — guruh orqali bog'lanadi.
        ...(await this.branchAccess.branchGroupFilter('groupId')),
        date: { gte: start, lte: end },
        isDeleted: false,
      },
      _count: { _all: true },
    } as never) as any[];

    const counts: Record<string, number> = {
      present: 0, late: 0, excused: 0, absent: 0, exempt: 0,
    };
    for (const r of rows) counts[r.status] = r._count._all || 0;

    // ⚠ YAGONA TA'RIF: maxraj = present + absent + late
    // (`exempt` va `excused` TASHQARIDA). O'zgartirilsa davomat foizi
    // butun tizim bo'ylab siljib ketardi.
    const denom = counts.present + counts.late + counts.absent;
    const rate =
      denom === 0 ? null : Math.round(((counts.present + counts.late) / denom) * 100);
    return {
      rate,
      present: counts.present,
      late: counts.late,
      absent: counts.absent,
      total: denom,
    };
  }

  /**
   * So'nggi 30 kun ichida har hafta kunidagi dars soni — bar chart.
   *
   * ⚠ XOM SQL ISHLATILMAYDI (`EXTRACT(DOW ...)` bo'lardi): u holda
   * filial ko'lami sharti ham QO'LDA SQL'ga ko'chirilishi kerak edi,
   * ya'ni xavfsizlik qoidasi IKKI JOYDA ikki xil yozilardi. Bu yerda
   * faqat `date` ustuni o'qiladi va guruhlash JS'da — ko'lam mantig'i
   * YAGONA manbada qoladi.
   */
  private async computeWeekdayActivity() {
    const now = new Date();
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 30, 0, 0, 0, 0),
    );

    const rows = await this.prisma.attendance.findMany({
      where: {
        ...(await this.branchAccess.branchGroupFilter('groupId')),
        date: { gte: start },
        isDeleted: false,
      } as never,
      select: { date: true },
    });

    const counts = new Array(7).fill(0);
    for (const r of rows) counts[new Date(r.date).getUTCDay()] += 1;

    // Du–Yak tartibida qaytaramiz.
    const order = [1, 2, 3, 4, 5, 6, 0];
    return order.map((idx) => ({ day: DAY_LABELS[idx], lessonsCount: counts[idx] }));
  }

  /** Oylik kirim (to'lov tranzaksiyalari yig'indisi). */
  private async computeRevenue(start: Date, end: Date) {
    const row = await this.prisma.paymentTransaction.aggregate({
      where: {
        // FILIAL: `PaymentTransaction` da `branchId` BOR (denormalizatsiya).
        ...branchFilter(),
        paidAt: { gte: start, lte: end },
        isDeleted: false,
      } as never,
      _sum: { amount: true },
      _count: { _all: true },
    });
    return { total: row._sum.amount || 0, count: row._count._all || 0 };
  }

  /** So'nggi to'lovlar ro'yxati. */
  private async computeRecentPayments() {
    const rows = await this.prisma.paymentTransaction.findMany({
      where: { ...branchFilter(), isDeleted: false } as never,
      orderBy: { paidAt: 'desc' },
      take: 5,
      include: {
        student: { select: { firstName: true, lastName: true } },
        group: { select: { name: true } },
      },
    });
    return rows.map((r) => ({
      id: String(r.id),
      studentName: r.student
        ? `${r.student.firstName} ${r.student.lastName || ''}`.trim()
        : "Noma'lum",
      groupName: r.group?.name || '-',
      amount: r.amount,
      method: r.method,
      paidAt: r.paidAt,
    }));
  }

  /**
   * Eng faol o'qituvchilar — faol guruhlardagi o'quvchilar soni bo'yicha.
   *
   * Guruhlar soni kichik (yuzlab), shuning uchun yig'ish JS'da — bu
   * `$lookup` quvurini takrorlashdan ancha o'qiladigan va xatoga kamroq
   * moyil.
   */
  private async computeTopTeachers() {
    const groups = await this.prisma.group.findMany({
      where: { ...branchFilter(), isActive: true, isDeleted: false } as never,
      select: {
        teachers: { select: { id: true, firstName: true, lastName: true } },
        _count: {
          select: { memberships: { where: { leftAt: null, isDeleted: false } } },
        },
      },
    });

    const byTeacher = new Map<string, any>();
    for (const g of groups) {
      const students = (g as any)._count.memberships || 0;
      for (const t of g.teachers) {
        const cur = byTeacher.get(t.id) || {
          id: String(t.id),
          name: `${t.firstName} ${t.lastName || ''}`.trim(),
          groupsCount: 0,
          studentsCount: 0,
        };
        cur.groupsCount += 1;
        cur.studentsCount += students;
        byTeacher.set(t.id, cur);
      }
    }

    return [...byTeacher.values()]
      .sort((a, b) => b.studentsCount - a.studentsCount || b.groupsCount - a.groupsCount)
      .slice(0, 4);
  }

  // === Asosiy: getOverview ===
  async getOverview({ year, month }: { year?: number; month?: number } = {}) {
    const now = new Date();
    const y = year ? Number(year) : now.getUTCFullYear();
    const m = month ? Number(month) : now.getUTCMonth() + 1;
    const { start, end } = monthRange(y, m);
    const prev = monthRange(m === 1 ? y - 1 : y, m === 1 ? 12 : m - 1);

    // A'zoliklar guruh orqali filialga bog'lanadi (`branchId` maydoni yo'q).
    const memberScope = await this.branchAccess.branchGroupFilter('groupId');

    const [
      studentsCount, teachersCount, activeGroupsCount,
      newStudentsThisMonth, lostStudentsThisMonth,
      newLeadsThisMonth, pendingLeads,
      revenueThisMonth, revenueLastMonth,
      attendanceGauge, weekdayActivity, recentPayments, topTeachers,
    ] = await Promise.all([
      // ⚠ FILIAL: bu hisoblagichlarda filtr YO'Q edi — panel tanlangan
      // filialda turib BUTUN tashkilot sonlarini ko'rsatardi.
      this.prisma.user.count({
        where: this.userScoped({ role: ROLES.STUDENT, isActive: true, isDeleted: false }) as never,
      }),
      this.prisma.user.count({
        where: this.userScoped({ role: ROLES.TEACHER, isActive: true, isDeleted: false }) as never,
      }),
      this.prisma.group.count({
        where: { ...branchFilter(), isActive: true, isDeleted: false } as never,
      }),
      this.prisma.groupMembership.count({
        where: { ...memberScope, joinedAt: { gte: start, lte: end }, isDeleted: false } as never,
      }),
      this.prisma.groupMembership.count({
        where: { ...memberScope, leftAt: { gte: start, lte: end }, isDeleted: false } as never,
      }),
      this.prisma.lead.count({
        where: { ...branchFilter(), createdAt: { gte: start, lte: end } } as never,
      }),
      this.prisma.lead.count({
        where: { ...branchFilter(), status: { in: ['new', 'info_given', 'trial'] } } as never,
      }),
      this.computeRevenue(start, end),
      this.computeRevenue(prev.start, prev.end),
      this.computeAttendanceGauge(),
      this.computeWeekdayActivity(),
      this.computeRecentPayments(),
      this.computeTopTeachers(),
    ]);

    // ⚠ O'zgarish foizi: o'tgan oy 0 bo'lsa `null` (0 EMAS) — "o'sish
    // yo'q" bilan "taqqoslab bo'lmaydi" bir xil ko'rinmasligi kerak.
    const revenueDelta =
      Number(revenueLastMonth.total) > 0
        ? Math.round(
            ((Number(revenueThisMonth.total) - Number(revenueLastMonth.total)) /
              Number(revenueLastMonth.total)) * 100,
          )
        : null;

    return {
      period: { year: y, month: m },
      studentsCount,
      teachersCount,
      activeGroupsCount,
      newStudentsThisMonth,
      lostStudentsThisMonth,
      netGrowth: newStudentsThisMonth - lostStudentsThisMonth,
      newLeadsThisMonth,
      pendingLeads,
      revenueThisMonth: revenueThisMonth.total,
      revenueLastMonth: revenueLastMonth.total,
      paymentsCount: revenueThisMonth.count,
      revenueDelta,
      attendanceGauge,
      todayAttendanceRate: attendanceGauge.rate,
      weekdayActivity,
      recentPayments,
      topTeachers,
    };
  }

  // === getStudentFlow (o'quvchilar oqimi — oylik) ===
  async getStudentFlow({ months = 6 }: { months?: number } = {}) {
    const periods = previousMonths(months);
    // FILIAL: a'zoliklar guruh orqali. BIR MARTA hisoblab, sikl ichida
    // qayta ishlatamiz (har oy uchun qayta so'rov yubormaymiz).
    const flowScope = await this.branchAccess.branchGroupFilter('groupId');
    const result: any[] = [];
    for (const p of periods) {
      const { start, end } = monthRange(p.year, p.month);
      const [joined, left] = await Promise.all([
        this.prisma.groupMembership.count({
          where: { ...flowScope, joinedAt: { gte: start, lte: end }, isDeleted: false } as never,
        }),
        this.prisma.groupMembership.count({
          where: { ...flowScope, leftAt: { gte: start, lte: end }, isDeleted: false } as never,
        }),
      ]);
      result.push({ year: p.year, month: p.month, joined, left, netGrowth: joined - left });
    }
    return result;
  }

  // === getCashflow ===

  /**
   * ⚠ SANA BO'YICHA GURUHLASH JS'DA, XOM SQL'DA EMAS — sabab
   * `computeWeekdayActivity` dagi bilan bir xil: SQL'da filial sharti
   * IKKINCHI marta yozilishi kerak bo'lardi.
   */
  private async sumBuckets(
    delegate: any, start: Date, end: Date, dateField: string,
    keyOf: (d: Date) => string | number,
  ) {
    const rows = await delegate.findMany({
      where: {
        // FILIAL: `PaymentTransaction`/`SalaryTransaction`/`Expense` da
        // `branchId` BOR.
        ...branchFilter(),
        [dateField]: { gte: start, lte: end },
        isDeleted: false,
      },
      select: { [dateField]: true, amount: true },
    });

    const map = new Map<string | number, number>();
    for (const r of rows) {
      const k = keyOf(new Date(r[dateField]));
      map.set(k, (map.get(k) || 0) + Number(r.amount || 0));
    }
    return map;
  }

  private sumByDay(delegate: any, start: Date, end: Date, dateField = 'paidAt') {
    return this.sumBuckets(delegate, start, end, dateField, dayKey);
  }

  private sumByMonth(delegate: any, start: Date, end: Date, dateField = 'paidAt') {
    return this.sumBuckets(delegate, start, end, dateField, monthKey);
  }

  /** Ikki bucket xaritasini qo'shadi (maosh + umumiy chiqim bitta ustun). */
  private mergeSums(a: Map<any, number>, b: Map<any, number>) {
    const out = new Map(a);
    for (const [k, v] of b) out.set(k, (out.get(k) || 0) + v);
    return out;
  }

  /**
   * ⚠ CHIQIM = MAOSH + UMUMIY XARAJAT. Ilgari chiqim FAQAT maoshdan
   * iborat edi — grafik markazning haqiqiy xarajatini ko'rsatmasdi va
   * foyda DOIM yuqori ko'rinardi.
   *
   * ⚠ `year`/`month` FAQAT `range="month"` va `"year"` uchun ma'noli.
   * `range="week"` da hafta ATAYLAB JORIY haftaligicha qoladi —
   * "o'tgan oyning qaysi haftasi" degan savolga javob yo'q.
   */
  async getCashflow({ range = 'month', year, month }: {
    range?: string; year?: number; month?: number;
  } = {}) {
    const now = new Date();
    // Tanlangan yil/oy bo'lmasa — joriy (avvalgi xatti-harakat).
    const y = Number.isInteger(year) ? (year as number) : now.getUTCFullYear();
    const mIndex = Number.isInteger(month) ? (month as number) - 1 : now.getUTCMonth();

    if (range === 'year') {
      const start = new Date(Date.UTC(y, 0, 1, 0, 0, 0, 0));
      const end = new Date(Date.UTC(y, 11, 31, 23, 59, 59, 999));
      const [income, salaryExpense, opexExpense] = await Promise.all([
        this.sumByMonth(this.prisma.paymentTransaction, start, end),
        this.sumByMonth(this.prisma.salaryTransaction, start, end),
        this.sumByMonth(this.prisma.expense, start, end, 'spentAt'),
      ]);
      const expense = this.mergeSums(salaryExpense, opexExpense);
      const buckets: any[] = [];
      for (let m = 1; m <= 12; m += 1) {
        buckets.push({
          label: MONTH_SHORT[m - 1],
          income: income.get(m) || 0,
          expense: expense.get(m) || 0,
        });
      }
      return { range, buckets };
    }

    // week | month → kunlik buckets
    let start: Date;
    let end: Date;
    if (range === 'week') {
      // JORIY hafta (Dushanba → Yakshanba).
      const ny = now.getUTCFullYear();
      const dow = now.getUTCDay() || 7; // Yak=7
      start = new Date(Date.UTC(ny, now.getUTCMonth(), now.getUTCDate() - (dow - 1), 0, 0, 0, 0));
      end = new Date(
        Date.UTC(ny, now.getUTCMonth(), now.getUTCDate() - (dow - 1) + 6, 23, 59, 59, 999),
      );
    } else {
      start = new Date(Date.UTC(y, mIndex, 1, 0, 0, 0, 0));
      end = new Date(Date.UTC(y, mIndex + 1, 0, 23, 59, 59, 999));
    }

    const [income, salaryExpense, opexExpense] = await Promise.all([
      this.sumByDay(this.prisma.paymentTransaction, start, end),
      this.sumByDay(this.prisma.salaryTransaction, start, end),
      this.sumByDay(this.prisma.expense, start, end, 'spentAt'),
    ]);
    const expense = this.mergeSums(salaryExpense, opexExpense);

    const buckets: any[] = [];
    const cursor = new Date(start);
    while (cursor <= end) {
      const key = dayKey(cursor);
      const label =
        range === 'week' ? DAY_SHORT[cursor.getUTCDay()] : String(cursor.getUTCDate());
      buckets.push({
        label,
        income: income.get(key) || 0,
        expense: expense.get(key) || 0,
      });
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }

    return { range, buckets };
  }
}
