import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ROLES } from '../../common/constants/permissions.js';
import { userBranchCondition } from '../../common/als/branch-context.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O'QUVCHILAR STATISTIKASI — `services/studentStats.service.js` EKVIVALENTI.
 *
 * ⚠⚠ FILIAL KO'LAMI BU FAYLDA BUTUNLAY YO'Q EDI — VA U TUZATILGAN.
 *
 * `tests/branchLeak.test.js` Prisma'ga ko'chirilgach darhol ushladi:
 * BO'M-BO'SH filial kontekstida `ongoing.cohorts[*].count` BUTUN
 * MARKAZning o'quvchilarini sanardi.
 *
 * ⚠ SABAB VA U TAKRORLANMASLIGI KERAK: filtrlar MODUL DARAJASIDAGI
 * KONSTANTA edi. Konstanta import paytida BIR MARTA hisoblanadi, filial
 * ko'lami esa HAR SO'ROVDA (AsyncLocalStorage) boshqacha bo'ladi — ya'ni
 * uni konstantaga qo'yib BO'LMAYDI. Shuning uchun ular FUNKSIYA.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Ro'yxatga olinish davomiyligiga ko'ra kohorta chegaralari (oyda). */
const DURATION_BUCKETS = [
  { key: '0-3', label: '0-3 oy', minMonths: 0, maxMonths: 3 },
  { key: '3-6', label: '3-6 oy', minMonths: 3, maxMonths: 6 },
  { key: '6-12', label: '6-12 oy', minMonths: 6, maxMonths: 12 },
  { key: '12+', label: '1 yildan ortiq', minMonths: 12, maxMonths: null },
];

const previousMonths = (count: number) => {
  const now = new Date();
  const arr: Array<{ year: number; month: number }> = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1));
    arr.push({ year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 });
  }
  return arr;
};

const monthStart = (year: number, month: number) =>
  new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));

/**
 * ⚠ OYLARDAGI FARQ — Mongo `$dateDiff(unit: "month")` bilan AYNAN BIR XIL.
 *
 * `$dateDiff` oy birligida KUNNI HISOBGA OLMAYDI: u kesib o'tilgan oy
 * chegaralarini sanaydi. 31-yanvar → 1-fevral = 1 oy, 1-yanvar →
 * 31-yanvar = 0 oy.
 *
 * "Kun bo'yicha aniqroq" hisoblash TO'G'RIROQ tuyulishi mumkin, lekin u
 * kohortalar chegarasini siljitib, O'TGAN oyning raqamini BUGUN
 * o'zgartirib yuborardi — hisobot esa BARQAROR bo'lishi kerak.
 */
const monthDiff = (start: Date, end: Date): number => {
  const a = new Date(start);
  const b = new Date(end);
  return (
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 +
    (b.getUTCMonth() - a.getUTCMonth())
  );
};

/** O'quvchi uchun umumiy bazaviy filtr. */
const BASE_STUDENT_FILTER = {
  role: ROLES.STUDENT,
  isDeleted: false,
  // `enrolledAt` NULLABLE: ro'yxatga olinmagan o'quvchi statistikaga
  // KIRMASLIGI kerak.
  enrolledAt: { not: null },
};

@Injectable()
export class StudentStatsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /** Filial ko'lamini `AND` ichiga qo'shadi (kontekst yo'q bo'lsa — tegmaydi). */
  private userScoped(base: Record<string, any>): Record<string, any> {
    const cond = userBranchCondition();
    return cond ? { ...base, AND: [cond] } : base;
  }

  // ⚠ QUYIDAGILAR FUNKSIYA — KONSTANTA EMAS (yuqoridagi izohga qarang).

  /** Hozir o'qiyotganlar: faol + hali yakunlamagan. */
  private ongoingFilter() {
    return this.userScoped({ ...BASE_STUDENT_FILTER, isActive: true, completedAt: null });
  }

  /** Yakunlaganlar: yakunlash sanasi belgilangan. */
  private finishedFilter() {
    return this.userScoped({ ...BASE_STUDENT_FILTER, completedAt: { not: null } });
  }

  /** Faol o'quvchilar (trend/so'nggi ro'yxat/jami son uchun). */
  private activeStudentFilter() {
    return this.userScoped({ ...BASE_STUDENT_FILTER, isActive: true });
  }

  /**
   * Oylar bo'yicha yangi ro'yxatga olishlar — trend grafigi.
   *
   * ⚠ XOM SQL DAN VOZ KECHILDI — FILIAL KO'LAMI SABABLI.
   * `userBranchCondition()` Prisma shartini qaytaradi va uni SQL matniga
   * QO'LDA tarjima qilish kerak bo'lardi — ya'ni ko'lam qoidasi IKKI
   * JOYDA ikki tilda yozilardi va ular muqarrar ravishda bir-biridan
   * uzoqlashardi.
   */
  private async computeEnrollmentTrend(months: number) {
    const periods = previousMonths(months);
    const rangeStart = monthStart(periods[0].year, periods[0].month);

    const rows = await this.prisma.user.findMany({
      where: { ...this.activeStudentFilter(), enrolledAt: { gte: rangeStart } } as never,
      select: { enrolledAt: true },
    });

    // Bo'sh oylarni 0 bilan to'ldiramiz (grafikda uzilish bo'lmasin).
    const map = new Map<string, number>();
    for (const r of rows) {
      if (!r.enrolledAt) continue;
      const d = new Date(r.enrolledAt);
      const key = `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}`;
      map.set(key, (map.get(key) || 0) + 1);
    }
    return periods.map((p) => ({
      year: p.year,
      month: p.month,
      count: map.get(`${p.year}-${p.month}`) || 0,
    }));
  }

  /**
   * Davomiylik (oyda) bo'yicha kohortalar + o'rtacha davomiylik.
   * `endAt = null` bo'lsa "hozir" olinadi (Mongo'dagi `$$NOW`).
   */
  private async computeDurationStats(where: Record<string, any>, useNow: boolean) {
    const rows = await this.prisma.user.findMany({
      where: where as never,
      select: { enrolledAt: true, completedAt: true },
    });

    const now = new Date();
    const counts: Record<string, number> = Object.fromEntries(
      DURATION_BUCKETS.map((b) => [b.key, 0]),
    );
    let totalMonths = 0;
    for (const r of rows) {
      const end = useNow ? now : r.completedAt;
      // Ikkala sana ham bo'lishi shart — filtr buni kafolatlaydi, lekin
      // himoya sifatida qoldiramiz (0 oy deb sanaladi).
      const m = r.enrolledAt && end ? Math.max(0, monthDiff(r.enrolledAt, end)) : 0;
      totalMonths += m;
      const bucket = DURATION_BUCKETS.find(
        (b) => m >= b.minMonths && (b.maxMonths === null || m < b.maxMonths),
      );
      if (bucket) counts[bucket.key] += 1;
    }

    const total = rows.length;
    const cohorts = DURATION_BUCKETS.map((b) => ({
      key: b.key,
      label: b.label,
      count: counts[b.key],
    }));
    const avgDurationMonths = total ? Math.round((totalMonths / total) * 10) / 10 : 0;

    return { cohorts, avgDurationMonths, total };
  }

  /** Eng so'nggi ro'yxatga olingan o'quvchilar. */
  private computeRecentEnrollments(limit: number) {
    return this.prisma.user.findMany({
      where: this.activeStudentFilter() as never,
      // ⚠ `id` ATAYLAB: Prisma `select` bilan uni avtomatik qaytarmaydi,
      // klient esa qatorni `_id` bo'yicha ochadi.
      select: {
        id: true, firstName: true, lastName: true,
        username: true, enrolledAt: true,
      },
      orderBy: { enrolledAt: 'desc' },
      take: limit,
    });
  }

  async getStudentStats({ months = 12, recentLimit = 8 }: {
    months?: number; recentLimit?: number;
  } = {}) {
    const [activeCount, ongoing, finished, enrollmentTrend, recentRows] =
      await Promise.all([
        this.prisma.user.count({ where: this.activeStudentFilter() as never }),
        this.computeDurationStats(this.ongoingFilter(), true),
        this.computeDurationStats(this.finishedFilter(), false),
        this.computeEnrollmentTrend(months),
        this.computeRecentEnrollments(recentLimit),
      ]);

    return {
      activeCount,
      ongoing,
      finished,
      enrollmentTrend,
      // ⚠ Javobda `_id` QOLADI — klient ro'yxati shunga tayangan.
      recentEnrollments: recentRows.map((r) => ({ ...r, _id: r.id })),
    };
  }
}
