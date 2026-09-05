import { Inject, Injectable } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { withLegacyId, withLegacyIds } from '../../common/utils/serialize.js';
import { toUtcMidnight, localTodayMidnight } from '../../common/utils/date.js';
import { scheduleActiveOn, type ScheduleSlot } from '../../common/utils/attendance.js';
import { ROLES } from '../../common/constants/permissions.js';
import { APPROVAL_KINDS } from '../../common/constants/approvals.js';
import { assertPeriodInvariants } from '../../common/utils/period.js';
import { assertGroupActive } from '../../common/helpers/group-state.js';
import { assertNotSelfSalary } from '../../common/rbac/self-salary.guard.js';
import {
  branchFilter,
  userBranchCondition,
  runWithBranchContext,
} from '../../common/als/branch-context.js';
import { BranchAccessService } from '../../common/rbac/branch-access.service.js';
import { ExpenseApprovalsService } from '../expense-approvals/expense-approvals.service.js';

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
 * ── YOZISH AMALLARI ──
 * `create` / `update` / `remove` / `handover` / `requestSalaryTerms` /
 * `executeApprovedSalaryTerms` SHU FAYLDA — ikkinchi manba
 * YARATILMAYDI. Ular uchta bog'liqlikni talab qiladi va uchalasi ham
 * endi ko'chirilgan: `self-salary.guard`, `ExpenseApprovalsService`
 * va `TeacherSalaryService` (maosh qayta hisobi).
 *
 * ✅ `assignTeacher` / `unassignTeacher` / `reopenPeriod` ENDI SHU
 * FAYLDA: ularni HTTP marshruti chaqirmaydi, faqat `groups` servisining
 * YOZISH yo'llari (`create`, `update`, `reconcileGroupEnd`) — va o'sha
 * to'lqin endi ko'chirildi. Ilgari ular ataylab qoldirilgan edi:
 * chaqiruvchisiz ko'chirish ISHLATILMAYDIGAN ikkinchi manba yaratardi.
 *
 * ⚠ MAOSH SERVISI `ModuleRef` ORQALI, OCHIQ IMPORT EMAS.
 * `TeacherSalaryModule` `GroupsModule` NI IMPORT QILADI — teskari
 * yo'nalishda ochiq import qo'yilsa modul aylanasi paydo bo'lardi.
 * Express ham aynan shu joyda dinamik `import()` ishlatadi va izohda
 * sababi shu deb yozilgan.
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

/** `currentUser` ikki shaklda kelishi mumkin — ikkalasi ham qabul qilinadi. */
export interface Actor { id?: string | null; _id?: string | null }
const actorId = (u?: Actor | null): string | null => u?.id || u?._id || null;

/**
 * `assertNotSelfSalary` maydonlarni `string | undefined` deb e'lon
 * qilgan, bizda esa `null` ham bo'lishi mumkin (Express `req.user` shu
 * shaklda beradi). Funksiya ikkalasini ham FALSY deb qaraydi —
 * shuning uchun bu FAQAT tur moslashtiruvi, xatti-harakat
 * o'zgarmaydi. Umumiy faylni kengaytirmaslik uchun shu yerda.
 */
const asGuardActor = (u?: Actor | null) =>
  u as { id?: string; _id?: string } | null | undefined;

/** Guruh jadvali BILAN o'qiladigan maydonlar (yozish yo'llari uchun). */
const GROUP_WITH_SCHEDULE = {
  id: true,
  name: true,
  isActive: true,
  isDeleted: true,
  startDate: true,
  endDate: true,
  schedule: GROUP_SCHEDULE_SELECT,
} as const;

/**
 * ⚠ `salaryType` ga qarab QARAMA-QARSHI maydon NOLLANADI: "percent"
 * davrda `fixedAmount` qolib ketsa, keyingi tahrirda u yana
 * "fixed" ga o'tganda eski summa jimgina tirilardi.
 */
const normalizeRate = (
  salaryType?: string, fixedAmount?: unknown, percentRate?: unknown,
) => ({
  salaryType: salaryType || 'fixed',
  fixedAmount: salaryType === 'percent' ? 0 : Number(fixedAmount) || 0,
  percentRate: salaryType === 'fixed' ? 0 : Number(percentRate) || 0,
});

const DAY_MS = 24 * 60 * 60 * 1000;

const fmtDate = (d: Date | string | number): string => {
  const x = new Date(d);
  const dd = String(x.getUTCDate()).padStart(2, '0');
  const mm = String(x.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${x.getUTCFullYear()}`;
};

/**
 * Dars davri guruhning kurs oynasidan chiqmasligini ta'minlaydi:
 *  • davr boshlanishi >= guruh boshlanish sanasi;
 *  • davr boshlanishi <= guruh tugash sanasi;
 *  • davr tugashi (EKSKLYUZIV) guruh tugash sanasi + 1 kundan oshmaydi
 *    (guruh `endDate` INKLYUZIV oxirgi kun, davr `endDate` EKSKLYUZIV).
 *
 * `group.startDate`/`endDate` bo'sh bo'lsa (eski guruhlar) — tegishli
 * chegara tekshirilmaydi.
 */
const assertWithinGroupBounds = (
  candidate: { startDate: Date; endDate: Date | null },
  group: { startDate?: Date | null; endDate?: Date | null } | null,
): void => {
  if (group?.startDate) {
    const gStart = toUtcMidnight(group.startDate)!.getTime();
    if (candidate.startDate.getTime() < gStart) {
      throw new ApiError(
        400,
        `Dars davri guruh boshlanish sanasidan (${fmtDate(gStart)}) oldin bo'lishi mumkin emas`,
      );
    }
  }
  if (group?.endDate) {
    const gEndIncl = toUtcMidnight(group.endDate)!.getTime();
    if (candidate.startDate.getTime() > gEndIncl) {
      throw new ApiError(
        400,
        `Dars davri guruh tugash sanasidan (${fmtDate(gEndIncl)}) keyin boshlanishi mumkin emas`,
      );
    }
    if (candidate.endDate && candidate.endDate.getTime() > gEndIncl + DAY_MS) {
      throw new ApiError(
        400,
        `Dars davri guruh tugash sanasidan (${fmtDate(gEndIncl)}) keyin tugashi mumkin emas`,
      );
    }
  }
};

const monthIdx = (d: Date) => d.getUTCFullYear() * 12 + d.getUTCMonth();

/**
 * Davr qamragan oylar (year/month).
 *
 * ⚠ OXIRI JORIY OYGACHA cheklanadi — kelajak OYLAR uchun maosh plani
 * yaratilmaydi (ular oylik jobda paydo bo'ladi), lekin joriy oyning
 * kelajak KUNIDA boshlangan davr ham joriy oyni qayta hisoblaydi.
 * `endDate` EKSKLYUZIV: oxirgi kun = `endDate - 1 kun`.
 */
const monthsSpanned = (
  startDate: Date | string, endDateExcl: Date | string | null,
): { year: number; month: number }[] => {
  const curIdx = monthIdx(localTodayMidnight()!);
  const startIdx = monthIdx(new Date(startDate));
  let endIdx: number;
  if (endDateExcl) {
    endIdx = monthIdx(new Date(new Date(endDateExcl).getTime() - DAY_MS));
  } else {
    endIdx = curIdx; // ochiq davr → joriy oygacha
  }
  endIdx = Math.min(endIdx, curIdx); // kelajak oylar yo'q
  if (startIdx > endIdx) return [];
  const months: { year: number; month: number }[] = [];
  for (let idx = startIdx; idx <= endIdx; idx += 1) {
    months.push({ year: Math.floor(idx / 12), month: (idx % 12) + 1 });
  }
  return months;
};

/**
 * Subyekt qulfi kaliti: bitta o'qituvchining bitta guruhdagi stavkasi
 * uchun bir vaqtda faqat BITTA kutilayotgan so'rov bo'lsin.
 *
 * ⚠ "create" va "update" BIR XIL kalitni beradi — aks holda bir
 * direktor yangi davr, ikkinchisi mavjud davrni o'zgartirishni so'rab,
 * IKKALASI ham tasdiqlanardi.
 */
const salaryTermsSubjectKey = (group: string, teacher: string) =>
  `salary_terms:${String(group)}:${String(teacher)}`;

@Injectable()
export class TeacherGroupPeriodService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
    private readonly branchAccess: BranchAccessService,
    private readonly approvals: ExpenseApprovalsService,
  ) {}

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
    // FILIAL: guruh `listByGroup` bilan AYNI naqsh bo'yicha ko'lamlanadi —
    // begona filial guruhining jadvali bu yerdan ochilmasin.
    // ⚠ 404, 403 EMAS: guruh MAVJUDLIGI ham oshkor qilinmaydi.
    const group = await this.prisma.group.findFirst({
      where: { id: String(groupId), ...branchFilter() },
      select: { id: true, schedule: GROUP_SCHEDULE_SELECT },
    });
    if (!group) throw new ApiError(404, 'Guruh topilmadi');
    const slots = scheduleActiveOn(group.schedule || []);

    // FILIAL: o'qituvchilar ro'yxati ko'lamsiz edi — begona filial
    // o'qituvchilarining ismi ochilar va ular guruhga biriktirish uchun
    // tanlanadigan bo'lib qolardi. `userBranchCondition()` `AND` ichida:
    // u OR qaytaradi (homeBranchId / branchAssignments).
    const branchCond = userBranchCondition();
    const teachers = await this.prisma.user.findMany({
      where: {
        role: ROLES.TEACHER,
        isActive: true,
        isDeleted: false,
        ...(branchCond ? { AND: [branchCond] } : {}),
      },
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

  /**
   * Guruhning barcha davrlari (timeline) — o'qituvchi ma'lumoti bilan.
   *
   * XAVFSIZLIK TUZATISHI — FILIAL KO'LAMI QO'SHILDI (ikkala stekda
   * BIR VAQTDA: `server/src/modules/groups/services/`).
   *
   * Ilgari ko'lam UMUMAN yo'q edi: `groups.read` ruxsatli xodim BEGONA
   * FILIAL guruhining o'qituvchi timeline'ini o'qiy olardi.
   *
   * O'LCHANDI, bitta aktyor va bitta guruh ID'si bilan:
   *   GET /groups/<begona>                  → 404
   *   GET /groups/<begona>/teacher-periods  → 200
   *
   * Ya'ni guruhning O'ZI rad etilar, ichki timeline'i ochiq turardi.
   * `GroupsService.getById` AYNI `branchFilter()` + 404 naqshini
   * ALLAQACHON qo'llaydi — bu qoldirib ketilgan joy edi.
   *
   * ⚠ 404, 403 EMAS — guruh MAVJUDLIGI ham oshkor qilinmaydi.
   * ⚠ Kontekstsiz chaqiruvda `branchFilter()` `{}` qaytaradi.
   */
  async listByGroup(groupId: string) {
    const owner = await this.prisma.group.findFirst({
      where: { id: String(groupId), ...branchFilter() },
      select: { id: true },
    });
    if (!owner) throw new ApiError(404, 'Guruh topilmadi');

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

  // ══════════════════════ YOZISH: UMUMIY QISMLAR ══════════════════════

  /**
   * `Group.teachers` ni davrlardan HOSILA kesh sifatida yangilaydi.
   *
   * ⚠ MANBA — DAVRLAR. `teachers` faqat so'rov tezligi uchun
   * denormalizatsiya. Prisma'da ko'p-ko'pga bog'lanish `set` bilan
   * TO'LIQ almashtiriladi: join jadvalidagi eski qatorlar o'chib,
   * yangilari yoziladi.
   */
  async syncGroupTeachersCache(groupId: string): Promise<string[]> {
    const ids = await this.activeTeacherIdsForGroup(groupId);
    await this.prisma.group.update({
      where: { id: String(groupId) },
      data: { teachers: { set: ids.map((id) => ({ id: String(id) })) } },
    });
    return ids;
  }

  /**
   * Oraliqdagi har bir oy uchun maosh planini YARATADI (yo'q bo'lsa) va
   * qayta hisoblaydi.
   *
   * ⚠ `ModuleRef` bilan KECH BOG'LASH — fayl boshidagi izohga qarang.
   * `strict: false` butun ilova bo'ylab qidiradi, ya'ni `GroupsModule`
   * `TeacherSalaryModule` ni import qilishi SHART EMAS.
   */
  private async recomputeForRange(
    teacherId: string,
    groupId: string,
    startDate: Date | string,
    endDate: Date | string | null,
  ): Promise<void> {
    const months = monthsSpanned(startDate, endDate);
    if (!months.length) return;
    const { TeacherSalaryService } = await import(
      '../teacher-salary/teacher-salary.service.js'
    );
    const salaryService = this.moduleRef.get(TeacherSalaryService, { strict: false });
    for (const { year, month } of months) {
      // eslint-disable-next-line no-await-in-loop
      const sal = await salaryService.ensureSalaryForTeacherGroup(
        teacherId, groupId, year, month,
      );
      // eslint-disable-next-line no-await-in-loop
      if (sal) await salaryService.recalc(String((sal as { id: string }).id));
    }
  }

  private async assertTeacher(teacherId: string) {
    // FILIAL: o'qituvchi joriy ko'lamda bo'lsin. Aks holda A filial
    // direktori B filial o'qituvchisini o'z guruhiga davr bilan
    // biriktirib, o'sha odamning maoshini harakatga keltirardi.
    // ⚠ `AND` ichida: `userBranchCondition()` o'zi `OR` ishlatadi.
    const teacherCond = userBranchCondition();
    const doc = await this.prisma.user.findFirst({
      where: {
        id: String(teacherId),
        role: ROLES.TEACHER,
        isDeleted: false,
        ...(teacherCond ? { AND: [teacherCond] } : {}),
      } as never,
      select: { id: true, firstName: true, lastName: true, hiredAt: true, isActive: true },
    });
    if (!doc) throw new ApiError(400, "O'qituvchi topilmadi");
    return doc;
  }

  private loadScope(teacherId: string, groupId: string, excludeId?: string) {
    return this.prisma.teacherGroupPeriod.findMany({
      where: {
        teacherId: String(teacherId),
        groupId: String(groupId),
        isDeleted: false,
        ...(excludeId ? { id: { not: String(excludeId) } } : {}),
      },
      select: { id: true, startDate: true, endDate: true },
    });
  }

  /**
   * ⚠ KO'LAMLANGAN: `create` / `update` / `remove` HAMMASI shu yerdan
   * guruhni oladi, ya'ni bu yozish yo'lining yagona darvozasi.
   * Filtrsiz begona filial guruhiga dars berish davri (va u orqali
   * MAOSH SHARTI) yozib qo'yish mumkin edi.
   */
  private loadGroup(groupId: string) {
    return this.prisma.group.findFirst({
      where: { id: String(groupId), ...branchFilter() },
      select: GROUP_WITH_SCHEDULE,
    });
  }

  /**
   * Davrni GURUH orqali kesish (`teacherGroupPeriod` reyestrda
   * VIA_GROUP — unda `branchId` ustuni YO'Q).
   * Owner va kontekstsiz chaqiruvda bo'sh obyekt qaytadi.
   */
  private periodScope(): Record<string, unknown> {
    const bf = branchFilter();
    return Object.keys(bf).length ? { group: { is: bf } } : {};
  }

  // ══════════════════════ YOZISH: CRUD ══════════════════════

  /**
   * Yangi dars berish davri.
   *
   * ⚠ `inheritStandardRate` — STAVKANI MEROS QILISH. `true` bo'lsa
   * davrga stavka YOZILMAYDI (barcha maydonlar `null`) va
   * `rateResolver` o'qituvchining STANDART stavkasiga
   * (`TeacherCompensation`) tushadi.
   *
   * NEGA ALOHIDA BAYROQ KERAK: `normalizeRate()` stavka berilmasa ham
   * `salaryType:"fixed", fixedAmount:0` yozadi, `rateResolver` esa
   * `salaryType != null` ni USTUNLIK deb biladi. Ya'ni stavkasiz
   * yaratilgan davr o'qituvchini shu guruhda NOL maoshga qulflab
   * qo'yardi.
   */
  async create(
    {
      teacher, group, startDate, endDate = null,
      salaryType, fixedAmount, percentRate,
      inheritStandardRate = false,
    }: {
      teacher: string; group: string;
      startDate: Date | string; endDate?: Date | string | null;
      salaryType?: string; fixedAmount?: unknown; percentRate?: unknown;
      inheritStandardRate?: boolean;
    },
    currentUser: Actor | null,
  ) {
    const teacherDoc = await this.assertTeacher(teacher);
    const grp = await this.loadGroup(group);
    assertGroupActive(grp as never);

    // ⚠ O'ZIGA O'ZI STAVKA QO'YISH TAQIQI — faqat stavka HAQIQATAN
    // yozilayotgan bo'lsa. `inheritStandardRate` da davrga hech qanday
    // summa yozilmaydi, ya'ni bu yerda taqiqlaydigan narsa yo'q — aks
    // holda guruhni boshqa o'qituvchiga topshirish kabi oddiy amal ham
    // to'silib qolardi.
    if (!inheritStandardRate) {
      assertNotSelfSalary(asGuardActor(currentUser), teacher);
    }

    const candidate = {
      startDate: toUtcMidnight(startDate)!,
      endDate: endDate ? toUtcMidnight(endDate)! : null,
    };
    const existing = await this.loadScope(teacher, group);
    assertPeriodInvariants(candidate, existing as never, 'date');
    assertWithinGroupBounds(candidate, grp as never);

    // Davr o'qituvchi ishga olingan sanadan OLDIN boshlanmasin.
    if (teacherDoc.hiredAt) {
      const hire = toUtcMidnight(teacherDoc.hiredAt)!.getTime();
      if (candidate.startDate.getTime() < hire) {
        throw new ApiError(
          400,
          `Dars davri o'qituvchining ishga olingan sanasidan (${fmtDate(hire)}) oldin boshlanishi mumkin emas`,
        );
      }
    }
    // O'qituvchining boshqa guruhdagi darsi bilan bir vaqtga tushmasin.
    await this.assertTeacherScheduleFree(teacher, (grp as never as {
      schedule: ScheduleSlot[] }).schedule, group);

    const doc = await this.prisma.teacherGroupPeriod.create({
      data: {
        teacherId: String(teacher),
        groupId: String(group),
        startDate: candidate.startDate,
        endDate: candidate.endDate,
        ...(inheritStandardRate
          ? { salaryType: null, fixedAmount: null, percentRate: null }
          : normalizeRate(salaryType, fixedAmount, percentRate)),
        createdById: actorId(currentUser),
        updatedById: actorId(currentUser),
      } as never,
    });
    await this.syncGroupTeachersCache(group);
    await this.recomputeForRange(teacher, group, candidate.startDate, candidate.endDate);
    return withLegacyId(doc);
  }

  /**
   * ═══════════════════════════════════════════════════════════════════
   * O'QITUVCHINI GURUHGA BIRIKTIRISH (ochiq davr ochadi).
   *
   * ⚠ IDEMPOTENT: ochiq davr ALLAQACHON bo'lsa o'sha qaytariladi va
   * YANGISI YARATILMAYDI — aks holda bitta o'qituvchining bir guruhda
   * ikkita ochiq davri paydo bo'lib, maosh IKKI MARTA hisoblanardi.
   *
   * ⚠ `inheritStandardRate: true` — davrga stavka YOZILMAYDI. Sababi
   * `create()` izohida: stavkasiz yaratilgan davr `salaryType:"fixed",
   * fixedAmount:0` bilan yozilsa o'qituvchi shu guruhda NOL maoshga
   * qulflanib qolardi.
   * ═══════════════════════════════════════════════════════════════════
   */
  async assignTeacher(
    group: string,
    teacher: string,
    { startDate }: { startDate?: Date | string | null } = {},
    currentUser: Actor | null = null,
  ) {
    const open = await this.prisma.teacherGroupPeriod.findFirst({
      where: {
        teacherId: String(teacher),
        groupId: String(group),
        endDate: null,
        isDeleted: false,
      },
    });
    if (open) return withLegacyId(open); // allaqachon aktiv

    const grp = await this.prisma.group.findUnique({
      where: { id: String(group) },
      select: { startDate: true },
    });
    const start = startDate
      ? toUtcMidnight(startDate)
      : grp?.startDate
        ? toUtcMidnight(grp.startDate)
        : localTodayMidnight();
    return this.create(
      { group, teacher, startDate: start, inheritStandardRate: true },
      currentUser,
    );
  }

  /**
   * ARXIVDAN CHIQARISHDA: arxiv YOPGAN davrni qayta ochadi
   * (`endDate = null`).
   *
   * ⚠ BITTA OCHIQ DAVR INVARIANTI: shu (o'qituvchi, guruh) juftida
   * boshqa ochiq davr bo'lsa HECH NARSA qilinmaydi — ikki ochiq davr
   * maoshni ikki marta hisoblardi.
   */
  async reopenPeriod(id: string, currentUser: Actor | null = null) {
    const doc = await this.prisma.teacherGroupPeriod.findUnique({
      where: { id: String(id) },
    });
    if (!doc || doc.isDeleted || doc.endDate === null) {
      return doc ? withLegacyId(doc) : null;
    }
    const open = await this.prisma.teacherGroupPeriod.findFirst({
      where: {
        teacherId: doc.teacherId,
        groupId: doc.groupId,
        endDate: null,
        isDeleted: false,
      },
      select: { id: true },
    });
    if (open) return withLegacyId(doc);

    const saved = await this.prisma.teacherGroupPeriod.update({
      where: { id: doc.id },
      data: { endDate: null, updatedById: actorId(currentUser) },
    });
    await this.syncGroupTeachersCache(doc.groupId);
    await this.recomputeForRange(doc.teacherId, doc.groupId, doc.startDate, null);
    return withLegacyId(saved);
  }

  /**
   * O'QITUVCHINI GURUHDAN CHIQARADI (ochiq davrni `endDate` da yopadi).
   *
   * ⚠ `endDate` EXCLUSIVE — chaqiruvchi (`prorateTeachersOnEnd`) unga
   * `end + 1 kun` beradi, shunda oxirgi ISH KUNI `end` bo'lib qoladi.
   * Bir kunlik siljish maoshda bir dars soatiga teng.
   *
   * @returns yopilgan davr yoki `null` (ochiq davr yo'q edi)
   */
  async unassignTeacher(
    group: string,
    teacher: string,
    { endDate }: { endDate?: Date | string | null } = {},
    currentUser: Actor | null = null,
  ) {
    const open = await this.prisma.teacherGroupPeriod.findFirst({
      where: {
        teacherId: String(teacher),
        groupId: String(group),
        endDate: null,
        isDeleted: false,
      },
    });
    if (!open) return null;

    const end = endDate ? toUtcMidnight(endDate) : localTodayMidnight();
    const saved = await this.prisma.teacherGroupPeriod.update({
      where: { id: open.id },
      data: { endDate: end, updatedById: actorId(currentUser) },
    });
    await this.syncGroupTeachersCache(group);
    await this.recomputeForRange(teacher, group, open.startDate, end);
    return withLegacyId(saved);
  }

  async update(
    id: string,
    patch: {
      startDate?: Date | string; endDate?: Date | string | null;
      salaryType?: string; fixedAmount?: unknown; percentRate?: unknown;
    },
    currentUser: Actor | null,
  ) {
    const doc = await this.prisma.teacherGroupPeriod.findFirst({
      // FILIAL: davr GURUHI orqali kesiladi — `list()` (:480) allaqachon
      // shunday, YOZISH yo'li esa yalang'och `findUnique` edi.
      where: { id: String(id), ...this.periodScope() } as never });
    if (!doc || doc.isDeleted) throw new ApiError(404, 'Dars berish davri topilmadi');
    const grp = await this.loadGroup(doc.groupId);
    assertGroupActive(grp as never);

    // ⚠ O'ZIGA O'ZI STAVKA QO'YISH TAQIQI — faqat patch STAVKAGA tegsa.
    // Sanani surish yoki davrni yopish stavkani o'zgartirmaydi, ya'ni
    // o'qituvchi o'z davrining sanasini tuzata olishi kerak.
    const touchesRate =
      patch.salaryType !== undefined ||
      patch.fixedAmount !== undefined ||
      patch.percentRate !== undefined;
    if (touchesRate) {
      assertNotSelfSalary(asGuardActor(currentUser), doc.teacherId);
    }

    const next = {
      startDate: patch.startDate ? toUtcMidnight(patch.startDate)! : doc.startDate,
      endDate:
        patch.endDate === undefined
          ? doc.endDate
          : patch.endDate
            ? toUtcMidnight(patch.endDate)!
            : null,
    };
    const existing = await this.loadScope(doc.teacherId, doc.groupId, doc.id);
    assertPeriodInvariants(next, existing as never, 'date');
    assertWithinGroupBounds(next, grp as never);

    const oldStart = doc.startDate;
    const oldEnd = doc.endDate;

    const data: Record<string, unknown> = {
      startDate: next.startDate,
      endDate: next.endDate,
      updatedById: actorId(currentUser),
    };
    // Maosh stavkasi — berilgan bo'lsa yangilanadi.
    if (patch.salaryType !== undefined) {
      Object.assign(
        data, normalizeRate(patch.salaryType, patch.fixedAmount, patch.percentRate));
    }

    const saved = await this.prisma.teacherGroupPeriod.update({
      where: { id: doc.id },
      data: data as never,
    });

    await this.syncGroupTeachersCache(doc.groupId);
    // ⚠ IKKI MARTA: eski VA yangi oraliq. Davr surilganda eski oylar
    // ham qayta hisoblanishi kerak — aks holda o'qituvchi endi dars
    // bermaydigan oyda maosh qatori eski summa bilan qolib ketardi.
    await this.recomputeForRange(doc.teacherId, doc.groupId, oldStart, oldEnd);
    await this.recomputeForRange(doc.teacherId, doc.groupId, next.startDate, next.endDate);
    return withLegacyId(saved);
  }

  async remove(id: string) {
    // FILIAL: `update()` bilan ayni kesish — o'chirish ham maosh
    // hisobini qayta yurgizadi.
    const doc = await this.prisma.teacherGroupPeriod.findFirst({
      where: { id: String(id), ...this.periodScope() } as never });
    if (!doc || doc.isDeleted) throw new ApiError(404, 'Dars berish davri topilmadi');
    assertGroupActive((await this.loadGroup(doc.groupId)) as never);

    // ⚠ TO'LOV QO'RIQLOVCHISI: davr qamragan oylarda maosh to'lovi
    // bo'lsa — o'chirib bo'lmaydi. Aks holda to'langan pul ortida
    // hech qanday asos qolmasdi.
    const months = monthsSpanned(doc.startDate, doc.endDate);
    if (months.length) {
      const paid = await this.prisma.salaryTransaction.findFirst({
        where: {
          teacherId: doc.teacherId,
          groupId: doc.groupId,
          isDeleted: false,
          OR: months,
        } as never,
        select: { id: true },
      });
      if (paid) {
        throw new ApiError(
          400,
          "Bu davrga oid maosh to'lovi mavjud. Avval to'lovlarni o'chiring.",
        );
      }
    }

    await this.prisma.teacherGroupPeriod.update({
      where: { id: doc.id },
      data: { isDeleted: true, deletedAt: new Date() },
    });
    await this.syncGroupTeachersCache(doc.groupId);
    await this.recomputeForRange(doc.teacherId, doc.groupId, doc.startDate, doc.endDate);
    return { id: doc.id, _id: doc.id };
  }

  // ══════════════════════ OMMAVIY TOPSHIRISH ══════════════════════

  /**
   * Ketayotgan o'qituvchining guruhlarini BIR AMALDA bir nechta
   * o'qituvchiga taqsimlaydi.
   *
   * MAOSH O'ZI TO'G'RI BO'LINADI — bu yerda hech qanday pul
   * hisoblanmaydi. Eski davr `endDate = topshirish sanasi` (EKSKLYUZIV)
   * bilan yopiladi, yangisi o'sha sanadan ochiladi; `salaryCompute` har
   * davrni oy ichidagi KUNLARIGA proratsiya qiladi.
   *
   * ⚠ BARCHA TEKSHIRUVLAR YOZISHDAN OLDIN. `create`/`update` har biri
   * o'z ichida maosh qayta hisobini yuritadi va ular bitta
   * tranzaksiyaga o'ralmagan. Yarim bajarilgan topshirish eng yomon
   * holat bo'lardi — guruh o'qituvchisiz qolib ketardi.
   */
  async handover(
    { teacher, handoverDate, assignments = [] }: {
      teacher: string;
      handoverDate: Date | string;
      assignments?: {
        toTeacher: string; groups?: string[];
        salaryType?: string; fixedAmount?: unknown; percentRate?: unknown;
      }[];
    },
    currentUser: Actor | null,
  ) {
    const outgoing = await this.assertTeacher(teacher);
    const cutoff = toUtcMidnight(handoverDate) as Date;
    if (!cutoff || Number.isNaN(cutoff.getTime())) {
      throw new ApiError(400, "Topshirish sanasi noto'g'ri");
    }

    // ── 1. Topshirish sanasida hali AMALDA bo'lgan davrlar ──
    const cutTs = cutoff.getTime();
    // FILIAL: ikki filialda dars beradigan o'qituvchi uchun A filial
    // direktori B FILIALDAGI davrlarni ham yopib, guruhlarini boshqa
    // odamga topshirib yuborardi (va u orqali B ning maoshini
    // o'zgartirardi). Davr GURUH orqali kesiladi (VIA_GROUP).
    const allPeriods = await this.prisma.teacherGroupPeriod.findMany({
      where: {
        teacherId: outgoing.id,
        isDeleted: false,
        ...this.periodScope(),
      } as never,
      select: { id: true, groupId: true, startDate: true, endDate: true },
    });
    const live = allPeriods.filter(
      (p) => !p.endDate || new Date(p.endDate).getTime() > cutTs,
    );

    if (!live.length) {
      throw new ApiError(
        400,
        "Bu o'qituvchida topshirish sanasida amaldagi guruh yo'q - topshiradigan narsa yo'q.",
      );
    }

    // Kelajakda boshlanadigan davrni "yopib" bo'lmaydi (tugash sanasi
    // boshlanishidan oldin bo'lib qolardi).
    const notStarted = live.filter((p) => new Date(p.startDate).getTime() >= cutTs);
    if (notStarted.length) {
      const names = await this.prisma.group.findMany({
        where: { id: { in: notStarted.map((p) => p.groupId) } },
        select: { name: true },
      });
      throw new ApiError(
        400,
        `Quyidagi guruhlarda dars davri topshirish sanasidan keyin boshlanadi ` +
          `(${names.map((g) => g.name).join(', ')}). Avval o'sha davrlarni o'chiring.`,
      );
    }

    const liveGroupIds = [...new Set(live.map((p) => String(p.groupId)))];
    const groups = await this.prisma.group.findMany({
      where: { id: { in: liveGroupIds }, isDeleted: false },
      select: GROUP_WITH_SCHEDULE,
    });
    const groupById = new Map(groups.map((g) => [String(g.id), g]));

    // ── 2. Taqsimotni tekshirish ──
    const targetByGroup = new Map<string, typeof assignments[number]>();
    for (const a of assignments) {
      if (!a?.toTeacher) throw new ApiError(400, "Qabul qiluvchi o'qituvchi ko'rsatilmagan");
      if (String(a.toTeacher) === String(outgoing.id)) {
        throw new ApiError(400, "Guruhni o'qituvchining o'ziga topshirib bo'lmaydi");
      }
      for (const g of a.groups || []) {
        const key = String(g);
        if (!groupById.has(key)) {
          throw new ApiError(
            400,
            "Ro'yxatdagi guruhlardan biri bu o'qituvchining topshirish sanasidagi guruhi emas",
          );
        }
        if (targetByGroup.has(key)) {
          const g1 = groupById.get(key)!;
          throw new ApiError(
            400,
            `"${g1.name}" guruhi bir necha o'qituvchiga berilgan - har guruh bitta qabul qiluvchiga tegishli bo'lishi kerak`,
          );
        }
        targetByGroup.set(key, a);
      }
    }

    // Qabul qiluvchilar haqiqiy va faol o'qituvchi bo'lsin.
    const targetIds = [...new Set([...targetByGroup.values()].map((a) => String(a.toTeacher)))];
    const targets = await this.prisma.user.findMany({
      where: { id: { in: targetIds }, role: ROLES.TEACHER, isDeleted: false },
      select: { id: true, firstName: true, lastName: true, isActive: true },
    });
    const targetById = new Map(targets.map((t) => [String(t.id), t]));
    for (const id of targetIds) {
      const t = targetById.get(id);
      if (!t) throw new ApiError(400, "Qabul qiluvchi o'qituvchi topilmadi");
      if (t.isActive === false) {
        throw new ApiError(
          400,
          `${t.firstName} ${t.lastName} arxivlangan - unga guruh berib bo'lmaydi`,
        );
      }
    }

    // ── 3. ENG MUHIM QOIDA: guruh o'qituvchisiz qolmasin ──
    const orphans: string[] = [];
    for (const gid of liveGroupIds) {
      if (targetByGroup.has(gid)) continue;
      const grp = groupById.get(gid);
      if (!grp || grp.isActive === false) continue; // arxiv guruh — muhim emas
      // eslint-disable-next-line no-await-in-loop
      const activeIds = await this.activeTeacherIdsForGroup(gid, cutoff);
      const others = activeIds.filter((id) => String(id) !== String(outgoing.id));
      if (!others.length) orphans.push(grp.name);
    }
    if (orphans.length) {
      throw new ApiError(
        400,
        `Quyidagi guruhlar o'qituvchisiz qolib ketadi: ${orphans.join(', ')}. ` +
          `Ularni ham boshqa o'qituvchiga taqsimlang.`,
      );
    }

    // ── 4. Yozishdan OLDIN quruq tekshiruv (yarim topshirish bo'lmasin) ──
    for (const [gid, a] of targetByGroup) {
      const grp = groupById.get(gid)!;
      const candidate = { startDate: cutoff, endDate: null };
      assertWithinGroupBounds(candidate, grp as never);
      // eslint-disable-next-line no-await-in-loop
      const existing = await this.loadScope(a.toTeacher, gid);
      assertPeriodInvariants(candidate, existing as never, 'date');
      // eslint-disable-next-line no-await-in-loop
      await this.assertTeacherScheduleFree(
        a.toTeacher, (grp as never as { schedule: ScheduleSlot[] }).schedule, gid);
    }

    // ── 5. Yozish: eski davrni yopish, yangisini ochish ──
    const closed: { group: string; period: string }[] = [];
    const opened: { group: string; teacher: string; period: string }[] = [];
    for (const p of live) {
      const gid = String(p.groupId);
      // eslint-disable-next-line no-await-in-loop
      await this.update(p.id, { endDate: cutoff }, currentUser);
      closed.push({ group: gid, period: p.id });
    }
    for (const [gid, a] of targetByGroup) {
      // eslint-disable-next-line no-await-in-loop
      const doc = await this.create(
        {
          teacher: a.toTeacher,
          group: gid,
          startDate: cutoff,
          endDate: null,
          // Stavka berilmasa — qabul qiluvchining O'Z standart shartnomasi.
          ...(a.salaryType
            ? {
                salaryType: a.salaryType,
                fixedAmount: a.fixedAmount,
                percentRate: a.percentRate,
              }
            : { inheritStandardRate: true }),
        },
        currentUser,
      );
      opened.push({
        group: gid,
        teacher: String(a.toTeacher),
        period: String((doc as { id: string }).id),
      });
    }

    return {
      teacher: String(outgoing.id),
      handoverDate: cutoff,
      closed: closed.length,
      opened: opened.length,
      groups: liveGroupIds.length,
      details: { closed, opened },
    };
  }

  // ══════════════════════ MAOSH STAVKASI TASDIG'I ══════════════════════

  /**
   * Maosh stavkasi o'zgarishini TASDIQQA yuboradi (yozuv YARATMAYDI).
   *
   * ⚠ TASDIQLANMAGUNCHA `TeacherGroupPeriod` YARATILMAYDI. Davr
   * yozuvining MAVJUDLIGI o'zi maosh hisobiga (`periodsForMonth` →
   * `recalc`) darhol kirib ketardi, ya'ni tasdiqlanmagan stavka
   * to'lanadigan summaga aylanardi. So'rov ma'lumoti faqat
   * `Approval.payload` ichida yashaydi.
   *
   * Bu yerda faqat YENGIL tekshiruv bor — to'liq invariantlar
   * (kesishuv, jadval to'qnashuvi, guruh chegaralari) ATAYLAB
   * tasdiqlash paytida qayta tekshiriladi, chunki so'rov va tasdiq
   * orasida holat o'zgarishi mumkin.
   */
  async requestSalaryTerms(
    { op, group, periodId, body }: {
      op: string; group?: string; periodId?: string;
      body: Record<string, unknown>;
    },
    currentUser: Actor | null,
  ) {
    let teacher: string;
    let groupId = group as string;
    if (op === 'update') {
      // FILIAL: tasdiq SO'RASH ham begona davrga tegmasin.
      const period = await this.prisma.teacherGroupPeriod.findFirst({
        where: { id: String(periodId), ...this.periodScope() } as never,
        select: { teacherId: true, groupId: true, isDeleted: true },
      });
      if (!period || period.isDeleted) {
        throw new ApiError(404, 'Dars berish davri topilmadi');
      }
      teacher = period.teacherId;
      groupId = period.groupId;
    } else {
      teacher = String(body.teacher);
    }

    const grp = await this.loadGroup(groupId);
    assertGroupActive(grp as never);
    const teacherDoc = await this.assertTeacher(teacher);

    // ⚠ O'ZIGA O'ZI STAVKA: so'rov ham YARATILMAYDI. Tasdiqlash
    // bosqichida `approve()` o'zini-o'zi tasdiqlashni to'sardi, lekin
    // so'rov owner navbatiga tushib, u e'tiborsiz tasdiqlab yuborishi
    // mumkin edi.
    assertNotSelfSalary(asGuardActor(currentUser), teacher);

    const branchId = await this.branchAccess.resolveBranchFromGroup(groupId);

    return this.approvals.createRequest({
      branchId,
      kind: APPROVAL_KINDS.SALARY_TERMS,
      payload: {
        op,
        group: String(groupId),
        teacher: String(teacher),
        periodId: periodId ? String(periodId) : undefined,
        startDate: body.startDate,
        endDate: body.endDate,
        salaryType: body.salaryType,
        fixedAmount: body.fixedAmount,
        percentRate: body.percentRate,
      } as never,
      subjectKey: salaryTermsSubjectKey(groupId, teacher),
      subjectName: [teacherDoc.firstName, teacherDoc.lastName].filter(Boolean).join(' '),
      contextName: (grp as { name?: string } | null)?.name || '',
      requestNote: body.requestNote as string | undefined,
      currentUser: currentUser as never,
    });
  }

  /**
   * Tasdiqlangan maosh stavkasi so'rovini BAJARADI.
   *
   * `create`/`update` NING O'ZINI chaqiradi — ya'ni barcha invariantlar
   * (kesishuv, guruh oynasi, ishga olingan sana, jadval to'qnashuvi)
   * shu yerda QAYTA ishlaydi. Ular yiqilsa `approve()` so'rovni FAILED
   * qiladi va owner sababni ko'radi.
   *
   * ⚠ CRON POYGASI shu yerda yopiladi: `create`/`update` ichidagi
   * `recomputeForRange` o'sha oy uchun maosh planini ENSURE qilib
   * qayta hisoblaydi. Oylik job 1-sanada eski stavka bilan qator
   * yaratgan bo'lsa ham, 20-sanadagi tasdiq o'sha MAVJUD qatorni
   * yangilaydi — kelajak oyga surilmaydi.
   */
  async executeApprovedSalaryTerms(approval: {
    payload?: Record<string, unknown>;
    requestedById?: string | null;
    requestedBy?: string | null;
    branchId?: string | null;
  }) {
    const p = (approval?.payload || {}) as Record<string, unknown>;
    // Amalni SO'RAGAN odam nomidan bajariladi (createdBy/updatedBy
    // tarixda tasdiqlovchi emas, so'rovchi bo'lib qolsin).
    const requesterId = approval?.requestedById || approval?.requestedBy || null;
    const actor = { id: requesterId, _id: requesterId } as Actor;

    const rate = {
      salaryType: p.salaryType as string | undefined,
      fixedAmount: p.fixedAmount,
      percentRate: p.percentRate,
    };

    // ═════════════════════════════════════════════════════════════════
    // ⚠ FILIAL KONTEKSTI MAJBURAN O'RNATILADI — `executeApprovedGroupFee`
    // va `executeApprovedDiscount` dagi bilan AYNI sabab.
    //
    // `create()`/`update()` endi guruhni va davrni `branchFilter()` bilan
    // kesadi, va o'sha filtr TASDIQLOVCHINING joriy ko'rinishidan
    // hisoblanadi. Owner "Toshkent" ni tanlab turib Buxoro so'rovini
    // tasdiqlasa, guruh topilmay so'rov bekordan-bekorga FAILED bo'lardi.
    //
    // So'rovning O'Z filiali — yagona to'g'ri kontekst. `Approval.branchId`
    // sxemada MAJBURIY (NOT NULL), ya'ni bu qiymat doim bor.
    // ═════════════════════════════════════════════════════════════════
    const branchId = String(approval?.branchId);

    return runWithBranchContext(
      {
        branchId,
        allowedBranchIds: [branchId],
        canSeeAllBranches: false,
        userId: requesterId ? String(requesterId) : null,
      },
      async () => {
        if (p.op === 'create') {
          return this.create(
            {
              teacher: String(p.teacher),
              group: String(p.group),
              startDate: p.startDate as string,
              endDate: (p.endDate as string) ?? null,
              ...rate,
            },
            actor,
          );
        }

        if (p.op === 'update') {
          if (!p.periodId) throw new ApiError(400, "So'rovda davr identifikatori yo'q");
          return this.update(
            String(p.periodId),
            { startDate: p.startDate as string, endDate: p.endDate as string, ...rate },
            actor,
          );
        }

        throw new ApiError(400, `Noma'lum maosh sharti amali: ${p.op}`);
      },
    );
  }
}
