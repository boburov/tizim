import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ROLES } from '../../common/constants/permissions.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * PLATFORMA ANALITIKASI — DEV PANEL UCHUN O'QISH PROYEKSIYASI
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * ── NEGA ALOHIDA SERVIS, MAVJUD `finance-analytics` EMAS ──
 *
 * Mavjud tahlil servislari FILIAL KO'LAMIDA ishlaydi: ular
 * `branchFilter()` ni ALS kontekstidan o'qiydi va u kontekst
 * `AuthMiddleware` tomonidan ochiladi. Bu endpoint esa
 * autentifikatsiyasiz (sir bilan) chaqiriladi — ALS bo'sh, ya'ni
 * o'sha servislar "kontekstsiz" rejimda ishlab, jimgina BUTUN
 * markazni qaytarardi. U holda ham natija to'g'ri bo'lardi, lekin
 * bog'liqlik nozik va tasodifiy: kimdir ko'lam qoidasini
 * qattiqlashtirsa, bu endpoint jimgina bo'sh javob berardi.
 *
 * Shuning uchun bu yerda so'rovlar OSHKORA butun markaz bo'yicha
 * yoziladi va filial kesimi natijaning ICHIDA alohida beriladi.
 *
 * ── PROYEKSIYA, NUSXA EMAS ──
 * Bu yerda hech narsa saqlanmaydi va hisob-kitob TAKRORLANMAYDI:
 * javob har safar bazadan yig'iladi. Dev panel uni ko'rsatadi, o'z
 * bazasiga yozmaydi — ya'ni haqiqat manbai bitta bo'lib qoladi.
 *
 * ── SHAXSIY MA'LUMOT YO'Q ──
 * Ism, telefon, login, to'lov tafsiloti — hech biri qaytmaydi. Faqat
 * AGREGAT: sanoq, summa, kesim. Platforma egasiga markaz "qanday
 * ishlayapti" kerak, "kim nima qildi" emas.
 */

/** Oxirgi N oyning `{ year, month }` ro'yxati (eng eskisi birinchi). */
const lastMonths = (n: number): { year: number; month: number }[] => {
  const out: { year: number; month: number }[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = n - 1; i >= 0; i -= 1) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push({ year: x.getFullYear(), month: x.getMonth() + 1 });
  }
  return out;
};

const num = (v: unknown): number => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
};

@Injectable()
export class PlatformAnalyticsService {
  private readonly logger = new Logger('PlatformAnalytics');

  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * To'liq proyeksiya. Har bo'lak ALOHIDA `try` ichida: bittasi yiqilsa
   * (masalan modul o'chirilgan yoki jadval bo'sh) qolgani baribir
   * qaytadi va panel yarim ma'lumot bilan bo'lsa ham ishlaydi.
   *
   * ⚠ YIQILGAN BO'LAK `null` QAYTARADI, `0` EMAS. Panel `null` ni
   * "o'lchanmadi" deb ko'rsatadi; `0` esa "daromad yo'q" degan ishonchli
   * yolg'on bo'lardi.
   */
  async snapshot(months = 6) {
    const [general, finance, education] = await Promise.all([
      this.safe('general', () => this.general()),
      this.safe('finance', () => this.finance(months)),
      this.safe('education', () => this.education()),
    ]);

    return {
      generatedAt: new Date().toISOString(),
      periodMonths: months,
      general,
      finance,
      education,
    };
  }

  private async safe<T>(name: string, fn: () => Promise<T>): Promise<T | null> {
    try {
      return await fn();
    } catch (err) {
      this.logger.warn(`Analitika bo'lagi olinmadi (${name}): ${String(err)}`);
      return null;
    }
  }

  // ── UMUMIY ────────────────────────────────────────────────────────────

  private async general() {
    const notDeleted = { isDeleted: false } as const;

    const [staff, students, teachers, groups, activeGroups, branches, activeStudents] =
      await Promise.all([
        this.prisma.user.count({ where: { ...notDeleted, role: { not: ROLES.STUDENT } } }),
        this.prisma.user.count({ where: { ...notDeleted, role: ROLES.STUDENT } }),
        this.prisma.user.count({ where: { ...notDeleted, role: ROLES.TEACHER } }),
        this.prisma.group.count({ where: notDeleted }),
        this.prisma.group.count({ where: { ...notDeleted, isActive: true } }),
        this.prisma.branch.count({ where: notDeleted }),
        this.prisma.user.count({ where: { ...notDeleted, role: ROLES.STUDENT, isActive: true } }),
      ]);

    let storageMb: number | null = null;
    try {
      const rows = await this.prisma.$queryRaw<Array<{ size: bigint }>>`
        SELECT pg_database_size(current_database()) as size
      `;
      if (rows?.[0]?.size) storageMb = Math.round(Number(rows[0].size) / (1024 * 1024));
    } catch {
      /* o'lchanmadi */
    }

    // Oxirgi 30 kundagi faoliyat — markaz "tirik" ekanining belgisi.
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const recentActivity = await this.prisma.activityLog
      .count({ where: { createdAt: { gte: since } } })
      .catch(() => 0);

    return {
      users: staff,
      students,
      activeStudents,
      teachers,
      groups,
      activeGroups,
      branches,
      storageMb,
      recentActivity30d: recentActivity,
    };
  }

  // ── MOLIYA ────────────────────────────────────────────────────────────

  private async finance(months: number) {
    const period = lastMonths(months);
    const first = period[0];
    const from = new Date(first.year, first.month - 1, 1);

    const [
      txAgg,
      byMethod,
      expenseAgg,
      byCategory,
      refundAgg,
      discountAgg,
      receivable,
      revenueTrend,
      expenseTrend,
    ] = await Promise.all([
      // TUSHUM — `netAmount` EMAS, `amount` (brutto): "markaz qancha
      // sotdi" savoliga javob. Komissiya alohida ustunda.
      this.prisma.paymentTransaction.aggregate({
        _sum: { amount: true, feeAmount: true },
        _count: { _all: true },
        where: { paidAt: { gte: from } },
      }),
      this.prisma.paymentTransaction.groupBy({
        by: ['method'],
        _sum: { amount: true },
        _count: { _all: true },
        where: { paidAt: { gte: from } },
      }),
      this.prisma.expense.aggregate({
        _sum: { amount: true },
        _count: { _all: true },
        where: { spentAt: { gte: from } },
      }),
      this.prisma.expense.groupBy({
        by: ['categoryName'],
        _sum: { amount: true },
        where: { spentAt: { gte: from } },
        orderBy: { _sum: { amount: 'desc' } },
        take: 12,
      }),
      // QAYTARIMLAR — faqat BAJARILGANLARI pul harakati.
      this.prisma.refund.aggregate({
        _sum: { amount: true },
        _count: { _all: true },
        where: { status: 'executed', executedAt: { gte: from } },
      }),
      this.prisma.studentPayment.aggregate({
        _sum: { discountApplied: true },
        where: { createdAt: { gte: from } },
      }),
      // QARZDORLIK — HOZIRGI holat, davrga bog'liq emas: "bizga qancha
      // qarz" savoli tarixiy oynadan mustaqil.
      this.prisma.studentPayment.aggregate({
        _sum: { expectedAmount: true, paidAmount: true, writeOffAmount: true },
        where: { status: { in: ['unpaid', 'partial'] }, writtenOff: false },
      }),
      this.prisma.paymentTransaction.groupBy({
        by: ['year', 'month'],
        _sum: { amount: true },
        where: { paidAt: { gte: from } },
      }),
      this.prisma.expense.groupBy({
        by: ['accrualYear', 'accrualMonth'],
        _sum: { amount: true },
        where: { spentAt: { gte: from } },
      }),
    ]);

    const revenue = num(txAgg._sum.amount);
    const fees = num(txAgg._sum.feeAmount);
    const expenses = num(expenseAgg._sum.amount);
    const refunds = num(refundAgg._sum.amount);

    const revByKey = new Map(revenueTrend.map((r) => [`${r.year}-${r.month}`, num(r._sum.amount)]));
    const expByKey = new Map(
      expenseTrend.map((r) => [`${r.accrualYear}-${r.accrualMonth}`, num(r._sum.amount)]),
    );

    const trend = period.map((p) => {
      const key = `${p.year}-${p.month}`;
      const rev = revByKey.get(key) ?? 0;
      const exp = expByKey.get(key) ?? 0;
      return { year: p.year, month: p.month, revenue: rev, expenses: exp, net: rev - exp };
    });

    // ── KASSA QOLDIG'I BU YERDA YO'Q — ATAYLAB ──
    //
    // `Account` da saqlangan `balance` ustuni MAVJUD EMAS: qoldiq
    // jurnaldan hisoblanadi (`journal.balances()`), chunki saqlangan
    // qiymat muqarrar eskiradi. Uni bu yerda qayta hisoblash moliya
    // mantig'ini IKKINCHI joyda takrorlash bo'lardi — aynan taqiqlangan
    // narsa ("tenant — yagona haqiqat manbai").
    //
    // Pul harakati o'rniga `trend` beriladi: har oy tushum/chiqim/sof.
    // "Bugun kassada qancha" savoli markaz egasining o'z panelida
    // (`/owner/finance/accounts`) va u yerda bitta manbadan o'qiladi.

    const expected = num(receivable._sum.expectedAmount);
    const paid = num(receivable._sum.paidAmount);

    return {
      // Davr — panel "qaysi oraliq" ekanini ko'rsatishi uchun.
      from: from.toISOString(),
      revenue,
      // Brutto − komissiya: kassaga HAQIQATAN tushgan summa.
      netRevenue: revenue - fees,
      providerFees: fees,
      paymentCount: txAgg._count._all,
      expenses,
      expenseCount: expenseAgg._count._all,
      refunds,
      refundCount: refundAgg._count._all,
      discounts: num(discountAgg._sum.discountApplied),
      // Sof natija: tushum − chiqim − qaytarim. Komissiya chiqimga
      // KIRMAYDI (u tushumdan ushlab qolingan) — ikki marta hisoblanmasin.
      net: revenue - expenses - refunds,
      receivable: Math.max(0, expected - paid),
      byMethod: byMethod
        .map((m) => ({ method: m.method, amount: num(m._sum.amount), count: m._count._all }))
        .sort((a, b) => b.amount - a.amount),
      byCategory: byCategory.map((c) => ({
        category: c.categoryName || 'Boshqa',
        amount: num(c._sum.amount),
      })),
      trend,
    };
  }

  // ── TA'LIM ────────────────────────────────────────────────────────────

  private async education() {
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);

    const [attendance, memberships, leads] = await Promise.all([
      this.prisma.attendance
        .groupBy({ by: ['status'], _count: { _all: true }, where: { date: { gte: since } } })
        .catch(() => [] as { status: string; _count: { _all: number } }[]),
      // Faol a'zolik = hali guruhni tark etmagan (`leftAt` bo'sh).
      this.prisma.groupMembership.count({ where: { leftAt: null } }).catch(() => 0),
      this.prisma.lead.count({ where: { createdAt: { gte: since } } }).catch(() => 0),
    ]);

    const total = attendance.reduce((s, a) => s + a._count._all, 0);
    const present = attendance
      .filter((a) => String(a.status) === 'present')
      .reduce((s, a) => s + a._count._all, 0);

    return {
      // ⚠ `null` — "dars bo'lmagan", `0` EMAS. Bo'sh oyda 0% ko'rsatish
      // "hech kim kelmadi" degan yolg'on bo'lardi.
      attendanceRate30d: total > 0 ? Math.round((present / total) * 1000) / 10 : null,
      attendanceRecords30d: total,
      activeMemberships: memberships,
      newLeads30d: leads,
    };
  }
}
