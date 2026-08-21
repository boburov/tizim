import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { branchFilter } from '../../common/als/branch-context.js';
import { BranchPnlService } from './branch-pnl.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O'QITUVCHI TAHLILI — FILIALLAR KESIMIDA
 * (`branchAnalytics/services/branchTeachers.service.js` KO'CHIRMASI).
 *
 * ── O'QITUVCHI TA'RIFI: "shu filialda FAOL guruhi bor odam" ──
 * `User.homeBranchId` bo'yicha sanash NOTO'G'RI bo'lardi: ishga
 * olingan, lekin hali guruh berilmagan odam ham hisobga tushib,
 * "o'qituvchi boshiga guruh" ko'rsatkichini SUN'IY pasaytirardi.
 * Ikki filialda dars beradigan o'qituvchi esa IKKALASIDA ham
 * sanaladi — chunki u ikkalasida ham RESURS.
 *
 * ── MAOSH ──
 * `TeacherSalary` (year, month) bo'yicha saqlanadi, SANA bo'yicha emas.
 * Shuning uchun oraliq OYLAR RO'YXATIGA aylantiriladi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const div = (a: number, b: number): number | null =>
  (b > 0 ? Math.round((a / b) * 100) / 100 : null);

/**
 * Sana oralig'ini `(year, month)` juftliklariga aylantiradi.
 *
 * ⚠ CHEGARA 36 OY: oraliq berilmaganda yoki juda keng bo'lganda `OR`
 * sharti CHEKSIZ o'sib ketardi. 36 oydan uzun tahlil bu ekranda ma'noga
 * ega emas — trend emas, o'rtacha bo'lib qoladi.
 */
const monthsInRange = (from?: Date | null, to?: Date | null) => {
  const start = from ? new Date(from) : new Date();
  const end = to ? new Date(to) : new Date();
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return [];

  const out: { year: number; month: number }[] = [];
  let y = start.getUTCFullYear();
  let m = start.getUTCMonth() + 1;
  const endY = end.getUTCFullYear();
  const endM = end.getUTCMonth() + 1;

  while ((y < endY || (y === endY && m <= endM)) && out.length < 36) {
    out.push({ year: y, month: m });
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
};

@Injectable()
export class BranchTeachersService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly pnlService: BranchPnlService,
  ) {}

  async teachers({ from = null, to = null }: {
    from?: Date | null; to?: Date | null;
  } = {}) {
    const scope = branchFilter();

    // ── FAOL GURUHLAR + ULARNING O'QITUVCHILARI ──
    // `teachers` — KO'P-KO'PGA bog'lanish (asosiy + yordamchi).
    const groups = await this.prisma.group.findMany({
      where: { ...scope, isActive: true, isDeleted: false },
      select: { id: true, branchId: true, teachers: { select: { id: true } } },
    });

    const byBranch = new Map<string, any>();
    const ensure = (k: string) => {
      if (!byBranch.has(k)) {
        byBranch.set(k, {
          branchId: k,
          activeGroups: 0,
          teacherIds: new Set<string>(),
          studentIds: new Set<string>(),
          // ⚠ Guruhsiz o'qituvchi bo'lmaydi, lekin O'QITUVCHISIZ guruh
          // BO'LADI — u alohida sanaladi, chunki bu BOSHQARUV muammosi.
          groupsWithoutTeacher: 0,
        });
      }
      return byBranch.get(k);
    };

    const groupBranch = new Map<string, string>();
    for (const g of groups) {
      const k = String(g.branchId);
      groupBranch.set(String(g.id), k);
      const b = ensure(k);
      b.activeGroups += 1;
      if (!g.teachers.length) b.groupsWithoutTeacher += 1;
      for (const t of g.teachers) b.teacherIds.add(String(t.id));
    }

    // ── FAOL O'QUVCHILAR ──
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
    for (const m of memberships) {
      const k = groupBranch.get(String(m.groupId));
      if (!k) continue;
      ensure(k).studentIds.add(String(m.studentId));
    }

    // ── MAOSH (oraliqqa tushgan oylar) ──
    const months = monthsInRange(from, to);
    const salaryRows = months.length
      ? await this.prisma.teacherSalary.groupBy({
          by: ['branchId'],
          where: {
            ...scope,
            OR: months.map(({ year, month }) => ({ year, month })),
          } as never,
          _sum: { expectedAmount: true, paidAmount: true },
        })
      : [];
    const salaryMap = new Map(
      salaryRows.map((r: any) => [
        String(r.branchId),
        {
          expected: Number(r._sum.expectedAmount || 0),
          paid: Number(r._sum.paidAmount || 0),
        },
      ]),
    );

    // ── DAROMAD (maosh ulushini hisoblash uchun) ──
    // ⚠ FORMULA TAKRORLANMAYDI — `pnl` NING O'ZI chaqiriladi. Ikki
    // joyda ikki xil "daromad" ta'rifi paydo bo'lsa, BIR ekranda IKKI
    // XIL raqam chiqardi.
    const report = await this.pnlService.pnl({ from, to, consolidated: false });
    const revenueMap = new Map(
      report.items.map((i) => [String(i.branchId), i.revenue]),
    );

    // ⚠ Maoshi bor, lekin FAOL GURUHI YO'Q filial ham ko'rinsin —
    // "guruh yopilgan, maosh esa hisoblangan" holati yashirinmasin.
    for (const k of salaryMap.keys()) ensure(k);

    const ids = [...byBranch.keys()];
    if (!ids.length) return [];

    const branches = await this.prisma.branch.findMany({
      where: { id: { in: ids } },
      select: { id: true, name: true, code: true },
    });
    const branchMap = new Map(branches.map((b) => [String(b.id), b]));

    return [...byBranch.values()]
      .map((b) => {
        const meta: any = branchMap.get(b.branchId) || {};
        const teacherCount = b.teacherIds.size;
        const students = b.studentIds.size;
        const salary = salaryMap.get(b.branchId) || { expected: 0, paid: 0 };
        const revenue = revenueMap.get(b.branchId) ?? null;

        return {
          branchId: b.branchId,
          name: meta.name || '',
          code: meta.code || '',

          teacherCount,
          activeGroups: b.activeGroups,
          groupsWithoutTeacher: b.groupsWithoutTeacher,
          students,

          // ⚠ O'qituvchi yo'q bo'lsa `null` — "0 guruh" degan yolg'on emas.
          groupsPerTeacher: div(b.activeGroups, teacherCount),
          studentsPerTeacher: div(students, teacherCount),

          salaryExpected: Math.round(salary.expected),
          salaryPaid: Math.round(salary.paid),
          salaryPerTeacher: div(salary.expected, teacherCount),

          // ⚠ MAOSH ULUSHI — filial iqtisodining ENG MUHIM nisbati.
          // Daromad 0 yoki MANFIY bo'lsa `null`: manfiy maxrajdan
          // chiqqan foiz ma'nosiz (masalan −200% "yaxshi" ko'rinardi).
          salaryShareOfRevenue:
            revenue !== null && revenue > 0
              ? Math.round((salary.expected / revenue) * 10000) / 100
              : null,
        };
      })
      .sort((a, b) => b.students - a.students);
  }
}
