import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { withLegacyIds } from '../../common/utils/serialize.js';
import { toUtcMidnight, localTodayMidnight } from '../../common/utils/date.js';
import { scheduleActiveOn, type ScheduleSlot } from '../../common/utils/attendance.js';
import { ROLES } from '../../common/constants/permissions.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O'QITUVCHI DARS BERISH DAVRLARI —
 * `modules/groups/services/teacherGroupPeriod.service.js` NING O'QISH QISMI.
 *
 * ⚠ BU MANBA HAQIQAT. `Group.teachers` — undan HOSILA kesh (faqat so'rov
 * tezligi uchun denormalizatsiya). Kim qachon dars berganini AYNAN shu
 * davrlar aytadi va maosh proratsiyasi ham shulardan hisoblanadi.
 *
 * ⚠ `schedule` HAR SO'ROVDA OCHIQ `include` QILINISHI SHART.
 * `scheduleActiveOn()` guruh jadvalini kutadi; unutilsa massiv BO'SH
 * kelib, jadval to'qnashuvi tekshiruvi JIMGINA hech nimani tutmay
 * qo'yardi — to'qnashuv esa bazaga yozilib ketardi.
 *
 * ── FAZA 5a: FAQAT O'QISH ──
 * Yozish amallari (`create`, `update`, `remove`, `handover`,
 * `assignTeacher`, `unassignTeacher`) BU YERDA YO'Q: ular
 * `selfSalary.guard`, tasdiq (`expenseApprovals`) va maosh qayta
 * hisobiga tayanadi — ular hali ko'chirilmagan. Trafik Express'da
 * qolgani uchun bu xavfsiz.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Jadval bilan birga o'qiladigan guruh maydonlari — BITTA manba. */
export const GROUP_SCHEDULE_SELECT = {
  select: { day: true, startTime: true, endTime: true, effectiveFrom: true },
} as const;

const DAY_LABEL_UZ: Record<string, string> = {
  mon: 'Dushanba',
  tue: 'Seshanba',
  wed: 'Chorshanba',
  thu: 'Payshanba',
  fri: 'Juma',
  sat: 'Shanba',
  sun: 'Yakshanba',
};

/**
 * Ikki vaqt oralig'i kesishadimi.
 *
 * ⚠ YOPIQ-OCHIQ: `14:00-15:00` va `15:00-16:00` KESISHMAYDI. Aks holda
 * ketma-ket darslar to'qnashuv deb rad etilardi.
 *
 * "HH:mm" nol bilan to'ldirilgani uchun SATR solishtiruvi to'g'ri
 * ishlaydi (`"09:00" < "14:00"`).
 */
const timesOverlap = (aStart: string, aEnd: string, bStart: string, bEnd: string) =>
  aStart < bEnd && bStart < aEnd;

/** A dagi biror slot B dagi slot bilan to'qnashsa — o'sha B slotini qaytaradi. */
const findSlotConflict = (
  slotsA: ScheduleSlot[],
  slotsB: ScheduleSlot[],
): ScheduleSlot | null => {
  for (const a of slotsA) {
    for (const b of slotsB) {
      if (a.day === b.day && timesOverlap(a.startTime, a.endTime, b.startTime, b.endTime)) {
        return b;
      }
    }
  }
  return null;
};

@Injectable()
export class TeacherGroupPeriodService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Bitta o'qituvchiga bir kun/bir vaqtda IKKITA guruh darsi
   * belgilanmasligini ta'minlaydi.
   *
   * O'qituvchi HOZIR dars berayotgan (ochiq davr, aktiv guruh)
   * jadvallar bilan solishtiradi.
   *
   * @param excludeGroupId tekshirilayotgan guruhning O'ZI (o'z-o'ziga
   *        to'qnashmasin — usiz har tahrir "darsi bor" deb rad etilardi)
   */
  async assertTeacherScheduleFree(
    teacherId: string,
    incomingSchedule: ScheduleSlot[] | null | undefined,
    excludeGroupId: string | null = null,
  ): Promise<void> {
    const slots = scheduleActiveOn(incomingSchedule || []);
    if (!slots.length) return;

    const periods = await this.prisma.teacherGroupPeriod.findMany({
      where: { teacherId: String(teacherId), endDate: null, isDeleted: false },
      select: { groupId: true },
    });
    const groupIds = periods
      .map((p) => p.groupId)
      .filter((g) => !excludeGroupId || String(g) !== String(excludeGroupId));
    if (!groupIds.length) return;

    const groups = await this.prisma.group.findMany({
      where: { id: { in: groupIds }, isActive: true, isDeleted: false },
      select: { name: true, schedule: GROUP_SCHEDULE_SELECT },
    });

    for (const g of groups) {
      const conflict = findSlotConflict(slots, scheduleActiveOn(g.schedule || []));
      if (conflict) {
        const dayLabel = DAY_LABEL_UZ[conflict.day] || conflict.day;
        throw new ApiError(
          400,
          `O'qituvchining bu vaqtda darsi bor: "${g.name}" — ${dayLabel} ${conflict.startTime}-${conflict.endTime}. Bir o'qituvchiga bir vaqtda ikkita dars belgilab bo'lmaydi.`,
        );
      }
    }
  }

  /**
   * Guruhga biriktirish uchun BO'SH o'qituvchilar.
   *
   * Guruh jadvalidagi kun/vaqtlarda BOSHQA guruhida darsi bo'lmagan
   * aktiv o'qituvchilar. Band bo'lganlari chiqarib tashlanadi.
   *
   * ⚠ GURUH JADVALI BO'SH bo'lsa — to'qnashuv bo'lishi MUMKIN EMAS,
   * ya'ni HAMMA bo'sh. Bu erta qaytish ataylab: usiz bo'sh jadval
   * hech kimni topmagandek ko'rinardi.
   */
  async listAvailableTeachers(groupId: string) {
    const group = await this.prisma.group.findUnique({
      where: { id: String(groupId) },
      select: { id: true, schedule: GROUP_SCHEDULE_SELECT },
    });
    if (!group) throw new ApiError(404, 'Guruh topilmadi');
    const slots = scheduleActiveOn(group.schedule || []);

    const teachers = await this.prisma.user.findMany({
      where: { role: ROLES.TEACHER, isActive: true, isDeleted: false },
      select: { id: true, firstName: true, lastName: true, username: true },
      orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    });

    if (!slots.length) return withLegacyIds(teachers);

    const teacherIds = teachers.map((t) => t.id);
    // Har bir o'qituvchining BOSHQA guruhlaridagi ochiq davrlari.
    const periods = await this.prisma.teacherGroupPeriod.findMany({
      where: {
        teacherId: { in: teacherIds },
        endDate: null,
        isDeleted: false,
        groupId: { not: String(groupId) },
      },
      select: { teacherId: true, groupId: true },
    });

    const otherGroupIds = [...new Set(periods.map((p) => String(p.groupId)))];
    const otherGroups = await this.prisma.group.findMany({
      where: { id: { in: otherGroupIds }, isActive: true, isDeleted: false },
      select: { id: true, schedule: GROUP_SCHEDULE_SELECT },
    });
    const schedByGroup = new Map(
      otherGroups.map((g) => [String(g.id), scheduleActiveOn(g.schedule || [])]),
    );

    const busyByTeacher = new Map<string, ScheduleSlot[]>();
    for (const p of periods) {
      const sched = schedByGroup.get(String(p.groupId));
      if (!sched?.length) continue;
      const key = String(p.teacherId);
      const arr = busyByTeacher.get(key) || [];
      arr.push(...sched);
      busyByTeacher.set(key, arr);
    }

    return withLegacyIds(
      teachers.filter((t) => {
        const busy = busyByTeacher.get(String(t.id));
        return !busy || !findSlotConflict(slots, busy);
      }),
    );
  }

  /**
   * Berilgan sanada AKTIV o'qituvchi ID'lari.
   *
   * ⚠ HALF-OPEN `[start, end)`: `endDate` KUNI o'qituvchi ARTIQ dars
   * bermaydi. Bu a'zolik va davomat kodlashi bilan bir xil — inclusive
   * qilinsa oxirgi kun uchun ikki o'qituvchiga maosh yozilardi.
   */
  async activeTeacherIdsForGroup(
    groupId: string,
    onDate: Date | string | null = null,
  ): Promise<string[]> {
    const t = (onDate ? toUtcMidnight(onDate) : localTodayMidnight()).getTime();
    const rows = await this.prisma.teacherGroupPeriod.findMany({
      where: { groupId: String(groupId), isDeleted: false },
      select: { teacherId: true, startDate: true, endDate: true },
    });
    const ids: string[] = [];
    for (const r of rows) {
      const s = new Date(r.startDate).getTime();
      const e = r.endDate ? new Date(r.endDate).getTime() : Infinity;
      if (t >= s && t < e) ids.push(r.teacherId);
    }
    return ids;
  }

  /**
   * Berilgan oy bilan KESISHADIGAN davrlar — maosh generatsiyasi uchun.
   *
   * ⚠ `teacher` MAYDONI SAQLANADI. Prisma `teacherId` beradi, lekin
   * chaqiruvchilar (teacherSalary) uni `teacher` nomi bilan o'qiydi —
   * moslashtirilmasa maosh yozuvi EGASIZ qolardi.
   */
  async teacherPeriodsActiveInMonth(groupId: string, year: number, month: number) {
    const monthStart = new Date(Date.UTC(year, month - 1, 1)).getTime();
    const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)).getTime();
    const rows = await this.prisma.teacherGroupPeriod.findMany({
      where: { groupId: String(groupId), isDeleted: false },
      select: { id: true, teacherId: true, startDate: true, endDate: true },
    });
    return rows
      .filter((r) => {
        const s = new Date(r.startDate).getTime();
        const e = r.endDate ? new Date(r.endDate).getTime() : Infinity;
        return s <= monthEnd && e > monthStart;
      })
      .map((r) => ({ ...r, _id: r.id, teacher: r.teacherId }));
  }

  /**
   * O'qituvchi + guruhning shu oy bilan kesishadigan MAOSH davrlari.
   *
   * Oydagi har bir davr ALOHIDA proratsiya qilinib summalar qo'shiladi —
   * shuning uchun stavka maydonlari ham qaytariladi.
   */
  async periodsForMonth(teacherId: string, groupId: string, year: number, month: number) {
    const monthStart = new Date(Date.UTC(year, month - 1, 1)).getTime();
    const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999)).getTime();
    const rows = await this.prisma.teacherGroupPeriod.findMany({
      where: {
        teacherId: String(teacherId),
        groupId: String(groupId),
        isDeleted: false,
      },
      select: {
        id: true,
        startDate: true,
        endDate: true,
        // Yangi (USTUN) stavka maydonlari — `rateResolver` shularni o'qiydi.
        variableType: true,
        variableRate: true,
        percentBase: true,
        // LEGACY — eski yozuvlarda stavka shu yerda.
        salaryType: true,
        fixedAmount: true,
        percentRate: true,
      },
    });
    return rows
      .filter((r) => {
        const s = new Date(r.startDate).getTime();
        const e = r.endDate ? new Date(r.endDate).getTime() : Infinity;
        return s <= monthEnd && e > monthStart;
      })
      .map((r) => ({ ...r, _id: r.id }));
  }

  /** O'qituvchi hozir dars berayotgan guruh ID'lari. */
  async activeGroupIdsForTeacher(
    teacherId: string,
    onDate: Date | string | null = null,
  ): Promise<string[]> {
    const t = (onDate ? toUtcMidnight(onDate) : localTodayMidnight()).getTime();
    const rows = await this.prisma.teacherGroupPeriod.findMany({
      where: { teacherId: String(teacherId), isDeleted: false },
      select: { groupId: true, startDate: true, endDate: true },
    });
    const ids: string[] = [];
    for (const r of rows) {
      const s = new Date(r.startDate).getTime();
      const e = r.endDate ? new Date(r.endDate).getTime() : Infinity;
      if (t >= s && t < e) ids.push(r.groupId);
    }
    return ids;
  }

  /** Guruhning barcha davrlari (timeline) — o'qituvchi ma'lumoti bilan. */
  async listByGroup(groupId: string) {
    const rows = await this.prisma.teacherGroupPeriod.findMany({
      where: { groupId: String(groupId), isDeleted: false },
      include: {
        teacher: {
          select: { id: true, firstName: true, lastName: true, username: true },
        },
      },
      orderBy: { startDate: 'desc' },
    });
    return withLegacyIds(rows);
  }
}
