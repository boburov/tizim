import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { branchFilter } from '../../common/als/branch-context.js';
import {
  RoomOccupancyService,
  WORKING_HOURS_PER_DAY,
} from '../../common/helpers/room-occupancy.js';
import { BranchPnlService } from './branch-pnl.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * NORMALIZATSIYA VA UNUMDORLIK —
 * `branchAnalytics/services/branchMetrics.service.js` KO'CHIRMASI.
 *
 * ── NEGA ABSOLYUT RAQAM YETARLI EMAS ──
 * "Chilonzor 80 mln, Yunusobod 40 mln daromad qildi" — bu Chilonzor
 * yaxshi ishlayapti degani EMAS. Chilonzorda 12 xona, Yunusobodda 4 ta
 * bo'lsa, aslida Yunusobod IKKI BAROBAR samaraliroq ishlayapti.
 *
 * Shuning uchun barcha ko'rsatkich NISBIY: 1 kv.m ga, 1 xonaga,
 * 1 o'quvchiga.
 *
 * ⚠ MA'LUMOT YO'Q BO'LSA `null` — 0 EMAS. Nol "yomon ishlayapti" degan
 * YOLG'ON xabar berardi; `null` esa "hisoblab bo'lmaydi, kirish
 * ma'lumotini to'ldiring" deydi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Nolga bo'lishdan himoyalangan bo'lish. */
const div = (a: number, b: number): number | null =>
  (b > 0 ? Math.round((a / b) * 100) / 100 : null);

@Injectable()
export class BranchMetricsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly occupancy: RoomOccupancyService,
    private readonly pnlService: BranchPnlService,
  ) {}

  /**
   * XONA BANDLIGI — FILIAL DARAJASIDA.
   *
   * FORMULA: band slot-soat / mavjud slot-soat.
   *   band   = xonalarning EGALLANGAN haftalik soatlari
   *   mavjud = xonalar soni × ish kunidagi soat × FAOL kunlar
   *
   * ⚠ HISOB SHU YERDA QILINMAYDI — band soat `RoomOccupancyService`
   * dan keladi, xuddi `/branch-analytics/rooms` va
   * `/finance-analytics/rooms` kabi. Ilgari uchala joy ham O'ZICHA
   * hisoblardi va ayni xona uchun UCH XIL foiz chiqishi mumkin edi.
   */
  async utilization() {
    const scope = branchFilter();

    const [rooms, occupancy] = await Promise.all([
      this.prisma.room.findMany({
        where: { ...scope, isActive: true, isDeleted: false },
        select: { id: true, branchId: true },
      }),
      this.occupancy.weeklyRoomHours(),
    ]);

    const roomsByBranch = new Map<string, number>();
    for (const r of rooms) {
      const k = String(r.branchId);
      roomsByBranch.set(k, (roomsByBranch.get(k) || 0) + 1);
    }

    // Band soat XONA bo'yicha keladi; uni filialga XONA orqali
    // bog'laymiz. Boshqa filialning (yoki nofaol) xonasi hisobga
    // olinmaydi.
    const branchOfRoom = new Map(rooms.map((r) => [String(r.id), String(r.branchId)]));
    const busyByBranch = new Map<string, number>();
    for (const [roomId, h] of (occupancy as any).byRoom) {
      const branch = branchOfRoom.get(roomId);
      if (!branch) continue;
      busyByBranch.set(branch, (busyByBranch.get(branch) || 0) + h.weeklyHours);
    }

    const branchIds = [...new Set([...roomsByBranch.keys(), ...busyByBranch.keys()])];
    const branches = branchIds.length
      ? await this.prisma.branch.findMany({
          where: { id: { in: branchIds.map(String) } },
          select: { id: true, name: true, code: true },
        })
      : [];
    const nameMap = new Map(branches.map((b) => [String(b.id), b]));

    return branchIds.map((k) => {
      const roomCount = roomsByBranch.get(k) || 0;
      const busyHours = Math.round((busyByBranch.get(k) || 0) * 10) / 10;
      const capacityHours =
        roomCount * WORKING_HOURS_PER_DAY * (occupancy as any).activeDaysPerWeek;

      return {
        branchId: k,
        name: nameMap.get(k)?.name || '',
        roomCount,
        busyHours,
        capacityHours,
        activeDaysPerWeek: (occupancy as any).activeDaysPerWeek,
        // ⚠ Xona kiritilmagan bo'lsa `null` — "0% bandlik" degan
        // yolg'on xulosa chiqmasin.
        utilizationPercent:
          capacityHours > 0
            ? Math.round((busyHours / capacityHours) * 10000) / 100
            : null,
      };
    });
  }

  /**
   * TALABA CHURN (ketib qolish).
   *
   * ⚠ TA'RIF — BU YERDAGI ENG MUHIM QAROR:
   *   KETGAN = davr ichida guruhdan chiqarilgan (`leftAt`) VA davr
   *            oxirida BOSHQA faol guruhi ham qolmagan.
   *
   * "Boshqa guruhi ham yo'q" sharti SHART: o'quvchi IELTS dan chiqib
   * CEFR ga o'tsa u markazni TASHLAB KETMAGAN. Bu shartsiz churn IKKI
   * BAROBAR yuqori ko'rinardi.
   */
  async churn({ from, to }: { from?: Date | null; to?: Date | null } = {}) {
    const scope = branchFilter();
    const groups = await this.prisma.group.findMany({
      where: scope,
      select: { id: true, branchId: true },
    });
    const groupBranch = new Map(groups.map((g) => [String(g.id), String(g.branchId)]));
    const groupIds = groups.map((g) => g.id);

    if (!groupIds.length) return [];

    const leftRange: any = { not: null };
    if (from) leftRange.gte = from;
    if (to) leftRange.lte = to;

    const [left, active] = await Promise.all([
      this.prisma.groupMembership.findMany({
        where: { groupId: { in: groupIds }, leftAt: leftRange, isDeleted: false },
        select: { studentId: true, groupId: true },
      }),
      this.prisma.groupMembership.findMany({
        where: { groupId: { in: groupIds }, leftAt: null, isDeleted: false },
        select: { studentId: true, groupId: true },
      }),
    ]);

    // Hali biror guruhda faol bo'lganlar — ular KETMAGAN.
    const stillActive = new Set(active.map((m) => String(m.studentId)));

    const byBranch = new Map<string, any>();
    const ensure = (k: string) => {
      if (!byBranch.has(k)) byBranch.set(k, { branchId: k, churned: 0, active: 0 });
      return byBranch.get(k);
    };

    for (const m of left) {
      const k = groupBranch.get(String(m.groupId));
      if (!k) continue;
      if (stillActive.has(String(m.studentId))) continue;
      ensure(k).churned += 1;
    }
    for (const m of active) {
      const k = groupBranch.get(String(m.groupId));
      if (!k) continue;
      ensure(k).active += 1;
    }

    const ids = [...byBranch.keys()];
    const branches = ids.length
      ? await this.prisma.branch.findMany({
          where: { id: { in: ids.map(String) } },
          select: { id: true, name: true },
        })
      : [];
    const nameMap = new Map(branches.map((b) => [String(b.id), b.name]));

    return [...byBranch.values()].map((b) => {
      const base = b.churned + b.active;
      return {
        ...b,
        name: nameMap.get(b.branchId) || '',
        churnPercent: base > 0 ? Math.round((b.churned / base) * 10000) / 100 : null,
      };
    });
  }

  /**
   * NORMALIZATSIYALANGAN KO'RSATKICHLAR — filiallarni HAJMIDAN QAT'I
   * NAZAR solishtirish.
   *
   * CAC (bitta o'quvchini jalb qilish narxi) uchun marketing xarajati
   * kerak. U `Expense` dan KATEGORIYA NOMI bo'yicha topiladi — markazda
   * "Marketing" kategoriyasi bo'lmasa CAC `null` bo'ladi.
   */
  async normalized({ from = null, to = null }: {
    from?: Date | null; to?: Date | null;
  } = {}) {
    const [report, util, branches] = await Promise.all([
      this.pnlService.pnl({ from, to, consolidated: false }),
      this.utilization(),
      this.prisma.branch.findMany({
        // ⚠ `branchFilter("id")` — Prisma'da birlamchi kalit ustuni `id`.
        where: { ...branchFilter('id'), isDeleted: false },
        select: { id: true, name: true, code: true, areaM2: true, openedAt: true },
      }),
    ]);

    const utilMap = new Map(util.map((u) => [String(u.branchId), u]));
    const pnlMap = new Map(report.items.map((i) => [String(i.branchId), i]));

    // Aktiv o'quvchilar soni (filial bo'yicha).
    const groups = await this.prisma.group.findMany({
      where: { ...branchFilter(), isActive: true, isDeleted: false },
      select: { id: true, branchId: true },
    });
    const groupBranch = new Map(groups.map((g) => [String(g.id), String(g.branchId)]));
    const memberships = groups.length
      ? await this.prisma.groupMembership.findMany({
          where: {
            groupId: { in: groups.map((g) => g.id) },
            leftAt: null,
            isDeleted: false,
          },
          select: { studentId: true, groupId: true },
        })
      : [];

    const studentsByBranch = new Map<string, Set<string>>();
    for (const m of memberships) {
      const k = groupBranch.get(String(m.groupId));
      if (!k) continue;
      if (!studentsByBranch.has(k)) studentsByBranch.set(k, new Set());
      studentsByBranch.get(k)!.add(String(m.studentId));
    }

    const expRange: any = {};
    if (from) expRange.gte = from;
    if (to) expRange.lte = to;

    /**
     * MARKETING XARAJATI.
     *
     * ⚠ JOIN RELATION FILTRI bilan (`category: { OR: [...] }`) — qo'lda
     * `$lookup` kerak emas, chunki `Expense.categoryId` haqiqiy tashqi
     * kalit. Regex `mode: "insensitive"` bilan almashtirilgan: Postgres
     * bunda indeksdan foydalana oladi.
     */
    const marketing = await this.prisma.expense.groupBy({
      by: ['branchId'],
      where: {
        ...branchFilter(),
        isDeleted: false,
        ...(Object.keys(expRange).length ? { spentAt: expRange } : {}),
        category: {
          OR: [
            { name: { contains: 'marketing', mode: 'insensitive' } },
            { name: { contains: 'reklama', mode: 'insensitive' } },
          ],
        },
      } as never,
      _sum: { amount: true },
    });
    const marketingMap = new Map(
      marketing.map((m: any) => [String(m.branchId), Number(m._sum.amount || 0)]),
    );

    // Yangi o'quvchi (davr ichida yozilgan) — CAC MAXRAJI.
    const newLeads = await this.prisma.lead.groupBy({
      by: ['branchId'],
      where: {
        ...branchFilter(),
        status: 'enrolled',
        ...(Object.keys(expRange).length ? { updatedAt: expRange } : {}),
      } as never,
      _count: { _all: true },
    });
    const newMap = new Map(
      newLeads.map((n: any) => [String(n.branchId), n._count._all]),
    );

    return branches.map((b) => {
      const k = String(b.id);
      const p: any = pnlMap.get(k) || { revenue: 0, expense: 0, net: 0 };
      const u: any = utilMap.get(k) || { roomCount: 0, utilizationPercent: null };
      const students = studentsByBranch.get(k)?.size || 0;
      const spend = marketingMap.get(k) || 0;
      const acquired = newMap.get(k) || 0;

      return {
        branchId: k,
        name: b.name,
        code: b.code,
        // Xom raqamlar — kontekst uchun.
        revenue: p.revenue,
        net: p.net,
        students,
        roomCount: u.roomCount,
        areaM2: b.areaM2 ?? null,
        openedAt: b.openedAt ?? null,

        // ── NORMALIZATSIYALANGAN ──
        revenuePerM2: b.areaM2 ? div(p.revenue, b.areaM2) : null,
        studentsPerRoom: div(students, u.roomCount),
        revenuePerStudent: div(p.revenue, students), // ARPU
        utilizationPercent: u.utilizationPercent,
        // CAC: marketing xarajati / jalb qilingan o'quvchi.
        cac: acquired > 0 ? div(spend, acquired) : null,
        marketingSpend: spend,
        acquiredStudents: acquired,
      };
    });
  }
}
