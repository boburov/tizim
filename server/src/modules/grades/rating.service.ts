import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { withLegacyId } from '../../common/utils/serialize.js';
import { ApiError } from '../../common/errors/api-error.js';
import { GradesService } from './grades.service.js';
import { AttendanceService } from '../attendance/index.js';
import { BranchAccessService } from '../../common/rbac/branch-access.service.js';

const STUDENT_SELECT = {
  // `id` ATAYLAB: Prisma `select` bilan avtomatik kelmaydi.
  id: true,
  firstName: true,
  lastName: true,
  username: true,
};

const isoToday = () => new Date().toISOString().slice(0, 10);
const isoDaysAgo = (days: number) =>
  new Date(Date.now() - days * 86400000).toISOString().slice(0, 10);

interface RatingSettings {
  gradeWeight: number;
  attendanceWeight: number;
}

/** point = (avgGrade/5*100)*gradeWeight + attendanceRate*attendanceWeight */
const computePoint = (
  avgGrade: number | null,
  attendanceRate: number | null,
  settings: RatingSettings,
): number => {
  const gradePart = avgGrade != null ? (avgGrade / 5) * 100 : 0;
  const attPart = attendanceRate != null ? attendanceRate : 0;
  const raw =
    gradePart * settings.gradeWeight + attPart * settings.attendanceWeight;
  return Math.round(raw * 100) / 100;
};

@Injectable()
export class RatingService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly grades: GradesService,
    private readonly attendance: AttendanceService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  // ─── Sozlamalar (yagona hujjat) ───
  // YAGONA QATOR: `id` ning o'zi "default" (schema'dagi @default).
  getSettings() {
    return this.prisma.ratingSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default' },
      update: {},
    });
  }

  async updateSettings(body: { gradeWeight?: unknown; attendanceWeight?: unknown }) {
    // Qator mavjudligini kafolatlaymiz (birinchi tahrirda ham ishlashi
    // uchun).
    await this.getSettings();

    const data: Record<string, number> = {};
    if (body.gradeWeight !== undefined) {
      const v = Number(body.gradeWeight);
      if (Number.isNaN(v) || v < 0 || v > 1) {
        throw new ApiError(400, "Ball vazni 0 dan 1 gacha bo'lishi kerak");
      }
      data.gradeWeight = v;
    }
    if (body.attendanceWeight !== undefined) {
      const v = Number(body.attendanceWeight);
      if (Number.isNaN(v) || v < 0 || v > 1) {
        throw new ApiError(400, "Davomat vazni 0 dan 1 gacha bo'lishi kerak");
      }
      data.attendanceWeight = v;
    }
    return this.prisma.ratingSettings.update({ where: { id: 'default' }, data });
  }

  /**
   * ─── Leaderboard ───
   * scope: "all" (barcha aktiv o'quvchilar) yoki groupId (shu guruh
   * a'zolari). fromDate/toDate ixtiyoriy — berilmasa "umrbod".
   */
  async getLeaderboard({
    scope = 'all', fromDate, toDate, limit = 100,
  }: {
    scope?: string; fromDate?: unknown; toDate?: unknown; limit?: number;
  } = {}) {
    const settings = await this.getSettings();

    // O'quvchilar to'plamini aniqlaymiz (aktiv a'zoliklar bo'yicha).
    //
    // ⚠ FILIAL: reyting boshqa filial o'quvchilarini ARALASHTIRMASLIGI
    // kerak — aks holda direktor begona o'quvchilar ismini va ballarini
    // ko'rardi, va o'z filiali o'quvchisining o'rni ham noto'g'ri
    // chiqardi. `branchGroupFilter("groupId")` — Prisma'da ustun nomi
    // `groupId` (`group` bo'lsa relation filtri bo'lib qolardi).
    const membershipWhere: Record<string, unknown> = {
      leftAt: null,
      isDeleted: false,
      ...(await this.branchAccess.branchGroupFilter('groupId')),
    };
    let groupId: string | null = null;
    if (scope && scope !== 'all') {
      // ID endi oddiy satr - `new ObjectId(...)` kerak emas.
      groupId = String(scope);
      membershipWhere.groupId = groupId;
    }
    const memberships = await this.prisma.groupMembership.findMany({
      where: membershipWhere as never,
      select: { groupId: true, student: { select: STUDENT_SELECT } },
    });

    // O'quvchi -> guruhlar (ko'rsatish uchun) va noyob o'quvchilar.
    const studentMap = new Map<string, {
      student: Record<string, unknown>; groupIds: string[];
    }>();
    for (const m of memberships) {
      if (!m.student) continue;
      const sid = String(m.student.id);
      if (!studentMap.has(sid)) {
        // Javobda `_id` QOLADI - klient reyting qatorini shu bilan
        // ochadi.
        studentMap.set(sid, {
          student: withLegacyId(m.student) as Record<string, unknown>,
          groupIds: [],
        });
      }
      studentMap.get(sid)!.groupIds.push(m.groupId);
    }
    const studentIds = Array.from(studentMap.keys());
    if (studentIds.length === 0) return { settings, items: [] };

    // Ballar o'rtachasi (bitta aggregate so'rov).
    const gradeAvgMap = await this.grades.averagesForStudents(studentIds, {
      fromDate, toDate, groupId,
    });

    // Davomat foizi - har o'quvchi uchun (mavjud attendance summary).
    // Sana berilmasa "umrbod" oraliq (2 yil orqaga … bugun) —
    // attendance summary fromDate/toDate talab qiladi.
    const effFrom = (fromDate as string) || isoDaysAgo(730);
    const effTo = (toDate as string) || isoToday();
    const scopeGroupIds = groupId ? [groupId] : undefined;
    const rateEntries = await Promise.all(
      studentIds.map(async (sid) => {
        try {
          const s = await this.attendance.getStudentSummary(sid, {
            fromDate: effFrom,
            toDate: effTo,
            scopeGroupIds,
          });
          return [sid, (s as { attendanceRate?: number })?.attendanceRate ?? null];
        } catch {
          return [sid, null];
        }
      }),
    );
    const rateMap = new Map(rateEntries as [string, number | null][]);

    const items = studentIds
      .map((sid) => {
        const { student } = studentMap.get(sid)!;
        const g = gradeAvgMap.get(sid) || { average: null, count: 0 };
        const attendanceRate = rateMap.get(sid) ?? null;
        const point = computePoint(g.average, attendanceRate, settings as never);
        return {
          student: {
            _id: student._id,
            firstName: student.firstName,
            lastName: student.lastName,
            username: student.username,
          },
          averageGrade: g.average,
          gradeCount: g.count,
          attendanceRate,
          point,
          rank: 0,
        };
      })
      .sort((a, b) => b.point - a.point);

    // Reyting o'rinlarini (rank) belgilaymiz.
    items.forEach((it, i) => {
      it.rank = i + 1;
    });

    return { settings, items: items.slice(0, limit) };
  }

  /**
   * O'quvchining umumiy va guruh ichidagi reytingdagi o'rni (student
   * panel uchun).
   */
  async getStudentRank(
    studentId: string,
    { fromDate, toDate }: { fromDate?: unknown; toDate?: unknown } = {},
  ) {
    const all = await this.getLeaderboard({
      scope: 'all', fromDate, toDate, limit: 100000 });
    const mine = all.items.find(
      (x) => String(x.student._id) === String(studentId));

    // O'quvchining aktiv guruhi (birinchi) ichidagi reyting.
    const membership = await this.prisma.groupMembership.findFirst({
      where: { studentId: String(studentId), leftAt: null, isDeleted: false },
      select: { groupId: true },
    });

    let group = null;
    if (membership) {
      const g = await this.getLeaderboard({
        scope: String(membership.groupId), fromDate, toDate, limit: 100000 });
      const groupDoc = await this.prisma.group.findUnique({
        where: { id: String(membership.groupId) },
        select: { id: true, name: true },
      });
      group = {
        group: groupDoc ? { _id: groupDoc.id, name: groupDoc.name } : null,
        total: g.items.length,
        me: g.items.find(
          (x) => String(x.student._id) === String(studentId)) || null,
      };
    }

    return {
      overall: { total: all.items.length, me: mine || null },
      group,
    };
  }
}
