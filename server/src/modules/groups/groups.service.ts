import { Inject, Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { withLegacyId, withLegacyIds } from '../../common/utils/serialize.js';
import { branchFilter } from '../../common/als/branch-context.js';
import { BranchAccessService } from '../../common/rbac/branch-access.service.js';
import { BOT_STATUS, botStatusOf } from '../../common/rbac/bot-status.js';
import { toUtcMidnight, localTodayMidnight } from '../../common/utils/date.js';
import { scheduleActiveOn } from '../../common/utils/attendance.js';
import { ROLES } from '../../common/constants/permissions.js';
import { APPROVAL_KINDS } from '../../common/constants/approvals.js';
import { assertPeriodInvariants } from '../../common/utils/period.js';
import { FINANCE_TXN_OPTIONS } from '../../common/utils/finance-txn.js';
import { UserRelationsService } from '../../common/helpers/user-relations.service.js';
import { StudentCompletionService } from '../../common/helpers/student-completion.service.js';
import { ExpenseApprovalsService } from '../expense-approvals/expense-approvals.service.js';
import { SystemNotificationsService } from '../system-notifications/system-notifications.service.js';
import { TeacherGroupPeriodService } from './teacher-group-period.service.js';
// ⚠ Quyidagi TO'RTTASI faqat `ModuleRef` TOKENI sifatida ishlatiladi —
// modul grafiga qo'shilmaydi (izoh `lazy()` ustida). ESM aylanasi YO'Q:
// ularning birortasi `groups.service.ts` ni import qilmaydi.
import { GroupFeeService } from '../finance/group-fee.service.js';
import { StudentPaymentService } from '../finance/student-payment.service.js';
import { TeacherSalaryService } from '../teacher-salary/teacher-salary.service.js';
import { DepositsService } from '../deposits/deposits.service.js';
import { OpeningBalanceService } from '../opening-balance/opening-balance.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GURUHLAR — `modules/groups/services/groups.service.js` NING O'QISH QISMI.
 *
 * ── FAZA 5a + 5b: TO'LIQ (o'qish + yozish) ──
 * 5a da faqat o'qish yo'llari ko'chirilgan edi; yozish amallari
 * `finance/groupFee`, `finance/studentPayment`, `teacherSalary`,
 * `deposits`, `openingBalance` va `expenseApprovals` servislariga
 * tayanadi va ular ko'chirilgach 5b qo'shildi.
 *
 * Bu `users` moduli uchun qo'llanilgan 2.5a/2.5b NAQSHINING AYNAN
 * O'ZI: bog'liqligi yo'q marshrutlar oldin ko'chadi, moliyaga
 * tegadiganlari moliya modullaridan KEYIN.
 *
 * ⚠ UCHTA TUB MONGO→PRISMA FARQI (Express izohidan saqlangan):
 *
 * 1) `Group.teachers` — MASSIV emas, KO'P-KO'PGA bog'lanish.
 *    `(group.teachers || []).map(String)` har element uchun
 *    "[object Object]" berardi va jadval to'qnashuvi tekshiruvi
 *    JIMGINA o'tib ketardi.
 *
 * 2) `Group.schedule` — EMBEDDED massiv emas, ALOHIDA JADVAL.
 *    Har o'qishda ochiq `include` SHART: unutilsa `scheduleActiveOn()`
 *    bo'sh massiv ko'radi va "guruhda dars yo'q" degan JIMGINA
 *    noto'g'ri natija chiqadi — soatbay maosh 0 ga tushadi.
 *
 * 3) `archivedClosedPeriods` — SKALYAR `String[]`, relation EMAS.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Javobga chiqadigan foydalanuvchi maydonlari — parol/token YO'Q. */
export const safeUserProjection = {
  id: true,
  firstName: true,
  lastName: true,
  username: true,
  phone: true,
  role: true,
  isActive: true,
} as const;

/** `scheduleActiveOn()` va `getClassDaysInRange()` AYNAN shunga tayanadi. */
const SCHEDULE_SELECT = {
  select: { day: true, startTime: true, endTime: true, effectiveFrom: true },
} as const;

/**
 * Guruhni to'liq o'qish uchun STANDART shakl.
 *
 * ⚠ `schedule` va `teachers` HAR DOIM shu yerdan keladi — ularni
 * unutish jimgina buzadi (yuqoridagi 1 va 2-izoh).
 */
const GROUP_INCLUDE = {
  schedule: { ...SCHEDULE_SELECT, orderBy: { effectiveFrom: 'asc' } },
  teachers: { select: safeUserProjection },
} as const;

/** Dars kuni yorliqlari — to'qnashuv xabarida foydalanuvchi ko'radi. */
const DAY_LABELS_FULL_UZ: Record<string, string> = {
  mon: 'Dushanba',
  tue: 'Seshanba',
  wed: 'Chorshanba',
  thu: 'Payshanba',
  fri: 'Juma',
  sat: 'Shanba',
  sun: 'Yakshanba',
};

/**
 * Ikki vaqt oralig'i kesishadimi ("HH:mm" nol to'ldirilgani uchun satr
 * solishtiruvi yetarli).
 *
 * ⚠ YOPIQ-OCHIQ: `14:00-15:00` va `15:00-16:00` KESISHMAYDI.
 */
const timesOverlap = (aStart: string, aEnd: string, bStart: string, bEnd: string) =>
  aStart < bEnd && bStart < aEnd;

/** A jadvalidagi slot B dagi slot bilan bir kun + kesishuvchi vaqtga tushsa. */
const findSlotConflicts = (slotsA: any[], slotsB: any[]): any[] => {
  const out: any[] = [];
  for (const a of slotsA) {
    for (const b of slotsB) {
      if (a.day === b.day && timesOverlap(a.startTime, a.endTime, b.startTime, b.endTime)) {
        out.push(b);
      }
    }
  }
  return out;
};

@Injectable()
export class GroupsService {
  private readonly logger = new Logger('GroupsService');

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly branchAccess: BranchAccessService,
    private readonly moduleRef: ModuleRef,
    private readonly periods: TeacherGroupPeriodService,
    private readonly approvals: ExpenseApprovalsService,
    private readonly userRelations: UserRelationsService,
    private readonly completion: StudentCompletionService,
    private readonly systemNotifications: SystemNotificationsService,
  ) {}

  /** Guruh javobini eski (Mongoose) shakliga keltiradi. */
  private shapeGroup<T>(group: T): T {
    if (!group) return group;
    // Klient `group.teachers[i]._id` o'qiydi — `withLegacyId` ichkariga
    // ham kiradi.
    return withLegacyId(group);
  }

  /**
   * O'QISH amallari uchun: guruh mavjud + FILIAL KO'LAMIDA bo'lishi
   * shart. Kurs tugagan/arxivlangan bo'lishi MUHIM EMAS.
   *
   * ⚠⚠ NEGA BU ALOHIDA FUNKSIYA — B13 (2026-08-22) ⚠⚠
   *
   * Ilgari `history()` `ensureGroup()` dan o'tardi, ya'ni YOZUV
   * qo'riqchisidan. Natijada tugagan kursning TARIXI 400 berardi,
   * `GET /groups/:id` esa AYNI guruh uchun 200 — ochiq ziddiyat.
   * Tarix o'qish amali; tugagan kursning tarixi AYNIQSA kerak.
   *
   * ⚠ TUZOQ: `ensureGroup` ning ikkita VAZIFASI bor edi — filial
   * ko'lami VA "aktivmi" tekshiruvi. Ularni ajratmasdan `history()`
   * dan `ensureGroup` ni olib tashlash FILIALLARARO SIZISH ochardi:
   * A filial direktori B filial guruhining a'zolik tarixini —
   * ya'ni o'quvchilar ro'yxatini — o'qiy olardi.
   *
   * Shuning uchun bu yerda `branchFilter()` SAQLANADI va faqat
   * "aktivmi" sharti tushiriladi. `test/groups-history-scope.test.mjs`
   * ikkalasini ham qulflaydi.
   */
  private async readGroup(groupId: string) {
    const group = await this.prisma.group.findFirst({
      where: { id: String(groupId), ...branchFilter() },
      include: GROUP_INCLUDE,
    });
    if (!group || group.isDeleted) throw new ApiError(404, 'Guruh topilmadi');
    return group;
  }

  /**
   * YOZUV amallari uchun: guruh mavjud + AKTIV bo'lishi shart.
   *
   * ⚠ O'QISH yo'llari (`getById`, `list`, `history`) guruhni
   * TO'G'RIDAN-TO'G'RI o'qiydi (`readGroup`) — arxivlangan guruhni
   * KO'RISH mumkin.
   *
   * FILIAL KO'LAMI shu YAGONA nuqtada (va `readGroup` da).
   */
  private async ensureGroup(groupId: string) {
    const group = await this.prisma.group.findFirst({
      where: { id: String(groupId), ...branchFilter() },
      include: GROUP_INCLUDE,
    });
    if (!group || group.isDeleted) throw new ApiError(404, 'Guruh topilmadi');
    // Tugagan kurs (`isActive=false` yoki `endDate` o'tgan — kunlik
    // job'gacha bo'lgan oyna).
    const ended =
      group.endDate &&
      toUtcMidnight(group.endDate).getTime() <= localTodayMidnight().getTime();
    if (!group.isActive || ended) {
      throw new ApiError(
        400,
        "Kurs tugagan. Davom ettirish uchun tugash sanasini o'zgartiring.",
      );
    }
    return group;
  }

  /**
   * Foydalanuvchi obyektlariga Telegram ma'lumoti VA yetkazish
   * holatini BITTA so'rovda biriktiradi (`attachBotStatus`).
   *
   * ⚠ HOLAT HAM QAYTISHI SHART: o'qituvchi guruh ro'yxatida KIMGA
   * xabar yetmasligini ko'rishi kerak. Ilgari faqat "bog'langanmi"
   * qaytardi va botni BLOKLAGAN o'quvchi bog'langanlar qatorida
   * turaverardi.
   */
  private async attachTelegram(userObjs: Record<string, unknown>[]): Promise<void> {
    const idOf = (u: Record<string, unknown>) => (u?.id ?? u?._id) as string;
    const ids = [...new Set((userObjs || []).map(idOf).map(String))].filter(Boolean);
    if (!ids.length) return;

    const bots = await this.prisma.botUser.findMany({
      where: { userId: { in: ids } },
      select: {
        userId: true,
        telegramId: true,
        username: true,
        firstName: true,
        lastName: true,
        isBlocked: true,
        lastSeenAt: true,
      },
    });
    const map = new Map(
      bots.map((b) => [String(b.userId), { ...b, status: botStatusOf(b) }]),
    );

    for (const u of userObjs) {
      if (!u) continue;
      const bot = map.get(String(idOf(u)));
      u.telegram = bot
        ? {
            // ⚠ `telegramId` Postgres'da BigInt — `JSON.stringify` uni
            // seriyalay OLMAYDI va javob 500 bilan yiqilardi.
            telegramId: Number(bot.telegramId),
            username: bot.username || null,
            firstName: bot.firstName || '',
            lastName: bot.lastName || '',
            isBlocked: !!bot.isBlocked,
            lastSeenAt: bot.lastSeenAt || null,
            status: bot.status,
          }
        : null;
      u.botStatus = bot?.status || BOT_STATUS.NOT_LINKED;
    }
  }

  async list({
    search,
    teacherId,
    archived = false,
    page = 1,
    limit = 20,
  }: {
    search?: string;
    teacherId?: string;
    archived?: boolean;
    page?: number;
    limit?: number;
  }) {
    const where: Record<string, unknown> = {
      ...branchFilter(),
      isActive: archived ? false : true,
      isDeleted: false,
    };
    // KO'P-KO'PGA: Mongo'da bu `{ teachers: id }` edi.
    if (teacherId) where.teachers = { some: { id: String(teacherId) } };
    if (search && search.trim()) {
      where.name = { contains: search.trim(), mode: 'insensitive' };
    }

    const skip = (page - 1) * limit;

    // Joriy oy — kartochkada oylik to'lovni ko'rsatish uchun.
    const today = localTodayMidnight();
    const curYear = today.getUTCFullYear();
    const curMonth = today.getUTCMonth() + 1;

    // Mongo'da bu uchta `$lookup` bo'lgan aggregation quvuri edi:
    //   • o'qituvchilar        → `include`
    //   • faol o'quvchilar soni → filtrlangan `_count` (bitta so'rovda)
    //   • joriy oy narxi        → alohida BITTA so'rov (N+1 EMAS)
    const [rows, total] = await Promise.all([
      this.prisma.group.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          ...GROUP_INCLUDE,
          _count: {
            select: { memberships: { where: { leftAt: null, isDeleted: false } } },
          },
        },
      }),
      this.prisma.group.count({ where }),
    ]);

    const ids = rows.map((g) => g.id);
    const fees = ids.length
      ? await this.prisma.groupFee.findMany({
          where: { groupId: { in: ids }, year: curYear, month: curMonth },
          select: { groupId: true, amount: true },
        })
      : [];
    const feeByGroup = new Map(fees.map((f) => [f.groupId, f.amount]));

    const items = rows.map((g) => {
      const { _count, ...rest } = g;
      return this.shapeGroup({
        ...rest,
        // ⚠ `has()` bilan tekshiriladi, `|| null` bilan EMAS: tarifi
        // ATAYLAB 0 qilingan guruh aks holda "belgilanmagan" bo'lib
        // ko'rinardi.
        monthlyFee: feeByGroup.has(g.id) ? feeByGroup.get(g.id) : null,
        studentsCount: _count.memberships,
      });
    });

    return { items, total, page, limit };
  }

  /**
   * ⚠ FILIAL: boshqa filial guruhining to'liq tafsiloti (o'quvchilar,
   * telefon, Telegram ID) ochilib ketmasin. 404 — mavjudligini ham
   * oshkor QILMAYMIZ.
   */
  async getById(id: string) {
    const group = await this.prisma.group.findFirst({
      where: { id: String(id), ...branchFilter() },
      include: GROUP_INCLUDE,
    });
    if (!group) throw new ApiError(404, 'Guruh topilmadi');

    const memberships = await this.prisma.groupMembership.findMany({
      where: { groupId: group.id, leftAt: null, isDeleted: false },
      include: { student: { select: safeUserProjection } },
      orderBy: { joinedAt: 'asc' },
    });

    const students = memberships
      .filter((m) => m.student)
      .map((m) => ({
        membershipId: m.id,
        joinedAt: m.joinedAt,
        ...(withLegacyId(m.student) as Record<string, unknown>),
      }));

    const groupJson = this.shapeGroup(group) as Record<string, unknown>;

    await Promise.all([
      this.attachTelegram(students as Record<string, unknown>[]),
      this.attachTelegram((groupJson.teachers || []) as Record<string, unknown>[]),
    ]);

    return { ...groupJson, students, studentsCount: students.length };
  }

  /** A'zolik TARIXI (chiqib ketganlar ham). */
  async history(groupId: string, { page = 1, limit = 20 } = {}) {
    // ⚠ B13: `ensureGroup` EMAS — `readGroup`. Tarix o'qish amali,
    // tugagan kursniki AYNIQSA kerak. Filial ko'lami saqlanadi.
    const group = await this.readGroup(groupId);
    const where = { groupId: group.id };
    const skip = (page - 1) * limit;

    const [items, total] = await Promise.all([
      this.prisma.groupMembership.findMany({
        where,
        orderBy: { joinedAt: 'desc' },
        skip,
        take: limit,
        include: {
          student: { select: safeUserProjection },
          transferredTo: { select: { id: true, name: true } },
        },
      }),
      this.prisma.groupMembership.count({ where }),
    ]);

    return { items: withLegacyIds(items), total, page, limit };
  }

  /** ⚠ `limit: 100` — Express'dagi bilan bir xil (sahifalanmaydi). */
  async listForTeacher(teacherId: string) {
    const { items } = await this.list({ teacherId, limit: 100, page: 1 });
    return items;
  }

  /**
   * O'quvchining ENG SO'NGGI faol a'zoligi.
   *
   * ⚠ FILIAL: o'quvchi BOSHQA filialda ham guruhda bo'lsa, uning
   * guruhi shu filial ko'rinishiga chiqib ketmasin.
   */
  async findActiveForStudent(studentId: string) {
    const membership = await this.prisma.groupMembership.findFirst({
      where: {
        studentId: String(studentId),
        leftAt: null,
        isDeleted: false,
        ...(await this.branchAccess.branchGroupFilter('groupId')),
      },
      include: { group: { include: GROUP_INCLUDE } },
      orderBy: { joinedAt: 'desc' },
    });

    if (!membership || !membership.group) return null;
    return {
      joinedAt: membership.joinedAt,
      group: this.shapeGroup(membership.group),
    };
  }

  /** O'quvchining BARCHA faol a'zoliklari (multi-active). */
  async findAllActiveForStudent(studentId: string) {
    const memberships = await this.prisma.groupMembership.findMany({
      where: {
        studentId: String(studentId),
        leftAt: null,
        isDeleted: false,
        ...(await this.branchAccess.branchGroupFilter('groupId')),
      },
      include: { group: { include: GROUP_INCLUDE } },
      orderBy: { joinedAt: 'asc' },
    });

    return memberships
      .filter((m) => m.group)
      .map((m) => ({
        membershipId: m.id,
        joinedAt: m.joinedAt,
        group: this.shapeGroup(m.group),
      }));
  }

  /** Bitta o'quvchining shu guruhdagi BARCHA o'qish davrlari. */
  async listMemberships(groupId: string, studentId: string) {
    // FILIAL: guruh ko'lamda bo'lmasa BO'SH natija (404 emas —
    // Express'da ham shunday).
    const scope = await this.branchAccess.branchGroupFilter('groupId');
    const rows = await this.prisma.groupMembership.findMany({
      where: {
        groupId: String(groupId),
        studentId: String(studentId),
        isDeleted: false,
        ...scope,
      },
      orderBy: { joinedAt: 'desc' },
    });
    return withLegacyIds(rows);
  }

  /**
   * Guruhdan chiqarilgan o'quvchiga login qilganda BIR MARTA
   * ko'rsatiladigan xabar.
   *
   * Eng oxirgi "removed" a'zolikni qaytaradi, agar:
   *   • hali ko'rilmagan bo'lsa (`removalNoticeSeenAt = null`), VA
   *   • o'quvchi o'sha guruhga HOZIR qayta a'zo bo'lmagan bo'lsa.
   */
  async findPendingRemovalNotice(studentId: string) {
    const membership = await this.prisma.groupMembership.findFirst({
      where: {
        studentId: String(studentId),
        leftReason: 'removed',
        leftAt: { not: null },
        removalNoticeSeenAt: null,
        isDeleted: false,
      },
      include: { group: { select: { id: true, name: true } } },
      orderBy: { leftAt: 'desc' },
    });

    if (!membership || !membership.group) return null;

    // Qayta a'zo bo'lgan bo'lsa xabar BERMAYMIZ — ammo `seen` ham
    // QILMAYMIZ, chunki bu BOSHQA a'zolik yozuvi.
    const rejoined = await this.prisma.groupMembership.findFirst({
      where: {
        studentId: String(studentId),
        groupId: membership.group.id,
        leftAt: null,
        isDeleted: false,
      },
      select: { id: true },
    });
    if (rejoined) return null;

    return {
      membershipId: String(membership.id),
      groupName: membership.group.name,
      reasonTitle: membership.leftReasonTitle || '',
      leftAt: membership.leftAt,
    };
  }

  /**
   * Xabar ko'rilgan deb belgilaydi (modal yopilganda).
   *
   * ⚠ FILIAL FILTRI YO'Q — ATAYLAB. Amal o'quvchining O'Z yozuviga
   * tegadi (`studentId` = aktyorning o'zi) va u faqat o'zi ko'rgan
   * modalni yopadi. Bu Express bilan aynan bir xil.
   */
  async markRemovalNoticesSeen(studentId: string): Promise<void> {
    await this.prisma.groupMembership.updateMany({
      where: {
        studentId: String(studentId),
        leftReason: 'removed',
        removalNoticeSeenAt: null,
      },
      data: { removalNoticeSeenAt: new Date() },
    });
  }

  // ══════════════════════════════════════════════════════════════════
  // ⚠⚠ FAZA 5b — YOZISH AMALLARI
  //
  // ── UPWARD BOG'LIQLIKLAR `ModuleRef` ORQALI, OCHIQ IMPORT EMAS ──
  //
  // `FinanceModule` → `TeacherSalaryModule` → `GroupsModule` zanjiri
  // allaqachon mavjud, ya'ni bu servisdan moliyaga OCHIQ import qo'yish
  // modul AYLANASI bo'lardi. Express aynan shu joyda ESM ko'tarilishiga
  // tayanadi; NestJS'da ekvivalenti — KECH IZLASH.
  //
  // ⚠ MANTIQ NUSXA KO'CHIRILMAYDI: tarif (`GroupFeeService`), billing
  // (`StudentPaymentService`), maosh (`TeacherSalaryService`), depozit
  // va boshlang'ich qoldiq — har biri O'Z modulida qoladi.
  //
  // `TeacherGroupPeriodService` esa SHU modulda, ya'ni oddiy injeksiya.
  // ══════════════════════════════════════════════════════════════════

  /**
   * `moduleRef.get(..., { strict: false })` — BUTUN ilova konteyneridan
   * izlaydi, ya'ni modul GRAFIGA umuman tegmaydi.
   *
   * ⚠ NEGA `forwardRef` EMAS: bu yerda beshta yuqori modul kerak
   * (`finance`, `teacher-salary`, `deposits`, `opening-balance`) va
   * har biri uchun IKKI TOMONLAMA `forwardRef` yozish grafni o'qib
   * bo'lmaydigan qilardi. `TeacherGroupPeriodService` da AYNI naqsh
   * allaqachon qo'llangan va sababi o'sha faylda yozilgan.
   *
   * ⚠ SINF nomlari OCHIQ import qilinadi (dinamik `import()` EMAS):
   * ESM aylanasi YO'Q — `finance`/`teacher-salary`/`deposits`
   * servislarining birortasi `groups.service.ts` ni import qilmaydi
   * (o'lchandi). Aylana faqat MODUL darajasida, u esa `ModuleRef`
   * bilan chetlab o'tiladi.
   */
  private resolved = new Map<unknown, unknown>();

  private lazy<T>(token: new (...a: any[]) => T): T {
    if (!this.resolved.has(token)) {
      this.resolved.set(token, this.moduleRef.get(token, { strict: false }));
    }
    return this.resolved.get(token) as T;
  }

  private get fees(): GroupFeeService {
    return this.lazy(GroupFeeService);
  }

  private get payments(): StudentPaymentService {
    return this.lazy(StudentPaymentService);
  }

  private get salaries(): TeacherSalaryService {
    return this.lazy(TeacherSalaryService);
  }

  private get deposits(): DepositsService {
    return this.lazy(DepositsService);
  }

  private get openingBalance(): OpeningBalanceService {
    return this.lazy(OpeningBalanceService);
  }

  private actorId(u: any): string | null {
    return u?.id || u?._id || null;
  }

  /** Ko'p-ko'pga bog'lanishdan ID ro'yxati (Mongo'da oddiy massiv edi). */
  private teacherIdsOf(group: any): string[] {
    return (group?.teachers || []).map((t: any) => t.id ?? t).map(String);
  }

  /**
   * Ichki: guruhni to'liq shakl bilan o'qish.
   *
   * ⚠ FILIAL FILTRI YO'Q — chaqiruvchi ko'lamni ALLAQACHON tekshirgan
   * (`ensureGroup` yoki ochiq `branchFilter()` bilan `findFirst`).
   */
  private loadGroup(id: string) {
    return this.prisma.group.findUnique({
      where: { id: String(id) },
      include: GROUP_INCLUDE,
    });
  }

  private async ensureStudent(studentId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: String(studentId) },
      select: {
        id: true, role: true, isActive: true, isDeleted: true,
        enrolledAt: true, firstName: true, lastName: true,
      },
    });
    if (!user || user.role !== ROLES.STUDENT || !user.isActive || user.isDeleted) {
      throw new ApiError(400, "O'quvchi topilmadi");
    }
    return user;
  }

  /**
   * ⚠ GURUHDA KO'PI BILAN BITTA O'QITUVCHI. O'qituvchi faqat
   * "Almashtirish" orqali o'zgartiriladi, QO'SHILMAYDI.
   */
  private async ensureTeachers(teacherIds?: string[] | null): Promise<void> {
    if (!teacherIds || teacherIds.length === 0) return;
    if (teacherIds.length > 1) {
      throw new ApiError(400, "Guruhda faqat bitta o'qituvchi bo'lishi mumkin");
    }
    const ids = teacherIds.map(String);
    const count = await this.prisma.user.count({
      where: { id: { in: ids }, role: ROLES.TEACHER, isActive: true, isDeleted: false },
    });
    if (count !== ids.length) {
      throw new ApiError(400, "Bir yoki bir nechta o'qituvchi noto'g'ri");
    }
  }

  // ─────────────────────────── JADVAL ───────────────────────────

  private normalizeSchedule(
    schedule: any[] | null | undefined,
    { dropEffective = false }: { dropEffective?: boolean } = {},
  ) {
    return (schedule || []).map((s: any) => ({
      day: s.day,
      startTime: s.startTime,
      endTime: s.endTime,
      effectiveFrom:
        dropEffective || !s.effectiveFrom ? null : toUtcMidnight(s.effectiveFrom),
    }));
  }

  /** (kun+vaqt) to'plamini taqqoslash kaliti — `effectiveFrom` SIZ. */
  private slotSetKey(slots: any[] | null | undefined): string {
    return (slots || [])
      .map((s: any) => `${s.day}-${s.startTime}-${s.endTime}`)
      .sort()
      .join('|');
  }

  /**
   * ═══════════════════════════════════════════════════════════════════
   * JADVAL VERSIYALASH.
   *
   * Yangi jadval JORIY AMALDAGI versiyaga TENG bo'lsa — `null` qaytadi
   * ("o'zgarish yo'q") va chaqiruvchi jadvalga UMUMAN tegmaydi.
   *
   * ⚠ BU PRISMA'DA MUHIM: `deleteMany + create` bejiz ishga tushsa
   * qatorlarning ID'lari almashib, keraksiz yozuv sodir bo'lardi.
   *
   * Farq bo'lsa — ESKI (tarixiy) qatorlar SAQLANADI, yangi qatorlar
   * `effectiveFrom` (standart — bugun) bilan ustiga qo'shiladi. Shunday
   * qilib O'TGAN sanalar eski versiya, yangi sanalar yangi versiya
   * bo'yicha hisoblanadi — tarixiy dars soni SHISHMAYDI.
   *
   * ⚠ AYNAN SHU `effectiveFrom` ga ega eski qatorlar OLIB TASHLANADI:
   * bir kunda bir necha marta tahrirlansa yangi versiya eskisini
   * ALMASHTIRADI (aks holda (kun+vaqt+effectiveFrom) dublikat bo'lib
   * unique indeks rad etardi).
   * ═══════════════════════════════════════════════════════════════════
   */
  private mergeScheduleVersion(
    existing: any[] | null | undefined,
    incoming: any[] | null | undefined,
    effectiveFromInput?: Date | string | null,
  ): any[] | null {
    const incomingClean = this.normalizeSchedule(incoming, { dropEffective: true });
    const existingArr = existing || [];

    const currentActive = scheduleActiveOn(existingArr as never);
    if (this.slotSetKey(currentActive) === this.slotSetKey(incomingClean)) {
      return null; // o'zgarish yo'q — tarixga tegmaymiz
    }

    const effectiveFrom = effectiveFromInput
      ? toUtcMidnight(effectiveFromInput)
      : localTodayMidnight();
    const effTs = effectiveFrom.getTime();

    const kept = existingArr.filter((s: any) => {
      const ts = s.effectiveFrom ? toUtcMidnight(s.effectiveFrom).getTime() : null;
      return ts !== effTs;
    });

    const newVersion = incomingClean.map((s: any) => ({ ...s, effectiveFrom }));
    return [...kept, ...newVersion].map((s: any) => ({
      day: s.day,
      startTime: s.startTime,
      endTime: s.endTime,
      effectiveFrom: s.effectiveFrom ? toUtcMidnight(s.effectiveFrom) : null,
    }));
  }

  /** KURS — GLOBAL katalog: faqat mavjudligi va faolligi tekshiriladi. */
  private async assertCourseExists(courseId?: string | null): Promise<void> {
    if (!courseId) return;
    const course = await this.prisma.course.findUnique({
      where: { id: String(courseId) },
      select: { isActive: true },
    });
    if (!course) throw new ApiError(400, 'Kurs topilmadi');
    if (!course.isActive) {
      throw new ApiError(400, "Nofaol kursni biriktirib bo'lmaydi");
    }
  }

  /**
   * XONA — FILIAL resursi. Guruh bilan BIR filialda bo'lishi SHART.
   *
   * ⚠ Aks holda A filial guruhi B filialning xonasini "band qilib"
   * qo'yardi: B ning bandlik hisobi soxta band, A niki esa bo'sh
   * ko'rsatardi — IKKALA filialning ham utilization raqami yolg'on.
   */
  private async assertRoomInBranch(
    roomId: string | null | undefined, branchId: string | null,
  ): Promise<void> {
    if (!roomId) return;
    const room = await this.prisma.room.findFirst({
      where: { id: String(roomId), isDeleted: false },
      select: { branchId: true, isActive: true, name: true },
    });
    if (!room) throw new ApiError(400, 'Xona topilmadi');
    if (!room.isActive) {
      throw new ApiError(400, "Nofaol xonani biriktirib bo'lmaydi");
    }
    if (String(room.branchId) !== String(branchId)) {
      throw new ApiError(400, "Xona guruh bilan bir xil filialda bo'lishi kerak");
    }
  }

  // ═══════════════════════════ YARATISH ═══════════════════════════

  async create(body: any, currentUser: any) {
    await this.ensureTeachers(body.teachers);

    // O'qituvchining ISHGA OLINGAN sanasi guruh boshlanish sanasidan
    // KEYIN bo'lsa — biriktirib bo'lmaydi (guruh boshlanganda u hali
    // ishga qabul qilinmagan).
    const gStart = body.startDate ? toUtcMidnight(body.startDate) : null;
    if (gStart && body.teachers?.length) {
      const tDocs = await this.prisma.user.findMany({
        where: { id: { in: body.teachers.map(String) } },
        select: { hiredAt: true, firstName: true, lastName: true },
      });
      for (const t of tDocs) {
        if (t.hiredAt && toUtcMidnight(t.hiredAt).getTime() > gStart.getTime()) {
          const nm = `${t.firstName} ${t.lastName || ''}`.trim();
          throw new ApiError(
            400,
            `${nm}ning ishga olingan sanasi guruh boshlanish sanasidan keyin - bu o'qituvchini biriktirib bo'lmaydi`,
          );
        }
      }
    }

    // Jadval to'qnashuvi: o'qituvchi bir vaqtda ikkita guruhda dars
    // bera olmaydi.
    for (const teacherId of body.teachers || []) {
      // eslint-disable-next-line no-await-in-loop
      await this.periods.assertTeacherScheduleFree(teacherId, body.schedule, null);
    }

    // FILIAL: guruh filial ko'lamining ILDIZI — davomat/to'lov/maosh
    // shu guruh orqali filialga bog'lanadi.
    const branchId = await this.branchAccess.resolveBranchForWrite(
      currentUser, body.branchId,
    );

    await this.assertCourseExists(body.courseId);
    await this.assertRoomInBranch(body.roomId, branchId);

    const group = await this.prisma.group.create({
      data: {
        branchId,
        courseId: body.courseId || null,
        roomId: body.roomId || null,
        name: body.name.trim(),
        // Jadval ALOHIDA jadval — ichma-ich `create` bilan bitta amalda.
        schedule: {
          create: this.normalizeSchedule(body.schedule, { dropEffective: true }),
        },
        // ⚠ `teachers` — davrlardan HOSILA kesh; uni `assignTeacher`
        // (→ `syncGroupTeachersCache`) to'ldiradi.
        startDate: body.startDate ? toUtcMidnight(body.startDate) : null,
        endDate: body.endDate ? toUtcMidnight(body.endDate) : null,
        durationMonths: body.durationMonths ?? null,
        ...(body.entryBilling ? { entryBilling: body.entryBilling } : {}),
      } as never,
      include: GROUP_INCLUDE,
    });

    const today = localTodayMidnight();
    const year = today.getUTCFullYear();
    const month = today.getUTCMonth() + 1;

    // Joriy oy tarifi (best-effort) — aks holda Moliya sahifasida narx
    // o'quvchi qo'shilmaguncha "Belgilanmagan" bo'lib qolardi.
    try {
      if (body.monthlyPrice != null) {
        await this.fees.upsert({
          groupId: group.id, year, month, amount: body.monthlyPrice,
        });
      } else {
        await this.fees.ensureGroupFee(group.id, year, month);
      }
    } catch (err) {
      this.logger.warn(
        `Yangi guruh uchun oylik to'lov yaratilmadi: ${(err as Error).message}`,
      );
    }

    // O'qituvchilarni dars berish DAVRI sifatida biriktiramiz (manba
    // haqiqati). `assignTeacher` ochiq davr ochib, `teachers` keshini
    // sinxronlaydi.
    const startDate = group.startDate || today;
    for (const teacherId of body.teachers || []) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await this.periods.assignTeacher(group.id, teacherId, { startDate }, currentUser);
      } catch (err) {
        // ═══════════════════════════════════════════════════════════
        // ⚠ O'QITUVCHISIZ GURUH QOLIB KETMASIN.
        //
        // Ilgari bu xato faqat logga tushardi: server 201 qaytarib
        // "Guruh yaratildi" derdi, guruh esa o'qituvchisiz — davomat
        // ham, maosh ham ishlamaydigan holatda qolardi.
        //
        // Guruh yaratish — BITTA amal. Biriktirish yiqilsa endigina
        // yaratilgan guruhni BUTUNLAY orqaga qaytaramiz (u hali hech
        // qayerda ishlatilmagan) va xatoni AYNAN sababi bilan beramiz.
        // ═══════════════════════════════════════════════════════════
        try {
          // eslint-disable-next-line no-await-in-loop
          await this.userRelations.hardDeleteGroupData(group.id);
          // eslint-disable-next-line no-await-in-loop
          await this.prisma.groupScheduleItem.deleteMany({
            where: { groupId: group.id },
          });
          // eslint-disable-next-line no-await-in-loop
          await this.prisma.group.update({
            where: { id: group.id }, data: { teachers: { set: [] } },
          });
          // eslint-disable-next-line no-await-in-loop
          await this.prisma.group.delete({ where: { id: group.id } });
        } catch (cleanupErr) {
          // Tozalash yiqilsa ham ASL xatoni yashirmaymiz.
          this.logger.error(
            `Yiqilgan guruh yaratishni orqaga qaytarib bo'lmadi (${group.id}): ` +
              `${(cleanupErr as Error).message}`,
          );
        }
        throw err instanceof ApiError
          ? err
          : new ApiError(
              400,
              (err as Error)?.message || "O'qituvchini guruhga biriktirib bo'lmadi",
            );
      }

      // Maosh yozuvi — IKKILAMCHI: yiqilsa ham guruh yaroqli qoladi,
      // yozuv keyingi hisoblashda o'zi yaratiladi.
      try {
        // eslint-disable-next-line no-await-in-loop
        await this.salaries.ensureSalaryForTeacherGroup(
          teacherId, group.id, year, month,
        );
      } catch (err) {
        this.logger.warn(
          `Guruh o'qituvchisi uchun maosh yozuvi yaratilmadi: ${(err as Error).message}`,
        );
      }
    }

    // `endDate` berilgan bo'lsa hayot-tsiklni moslaymiz (o'tgan sana →
    // DARHOL arxiv).
    if (group.endDate) {
      await this.reconcileGroupEnd(await this.loadGroup(group.id));
    }

    return this.shapeGroup(await this.loadGroup(group.id));
  }

  // ═══════════════════════════ TAHRIRLASH ═══════════════════════════

  async update(id: string, body: any) {
    // ⚠ ARXIVLANGAN guruh ham yuklanadi — `endDate` ni tahrirlab
    // REACTIVATE qilish (kelajakka uzaytirish) SHU yo'l orqali bo'ladi.
    // FILIAL: boshqa filial guruhini tahrirlab bo'lmaydi.
    const group: any = await this.prisma.group.findFirst({
      where: { id: String(id), ...branchFilter() },
      include: GROUP_INCLUDE,
    });
    if (!group || group.isDeleted) throw new ApiError(404, 'Guruh topilmadi');

    if (body.teachers !== undefined) await this.ensureTeachers(body.teachers);

    // Jadval to'qnashuvi — O'ZGARTIRISHDAN OLDIN (toza rad etish uchun).
    {
      const scheduleForCheck =
        body.schedule !== undefined ? body.schedule : group.schedule;
      const currentTeacherIds = this.teacherIdsOf(group);
      const toCheck = new Set<string>();
      if (body.schedule !== undefined) {
        currentTeacherIds.forEach((t) => toCheck.add(t));
      }
      if (body.teachers !== undefined && group.isActive) {
        (body.teachers || [])
          .map(String)
          .filter((t: string) => !currentTeacherIds.includes(t))
          .forEach((t: string) => toCheck.add(t));
      }
      for (const teacherId of toCheck) {
        // eslint-disable-next-line no-await-in-loop
        await this.periods.assertTeacherScheduleFree(
          teacherId, scheduleForCheck, group.id,
        );
      }
    }

    const data: any = {};
    if (body.name !== undefined) data.name = body.name.trim();

    // ⚠ XONA uchun filial GURUHNIKI olinadi (body'dan EMAS): guruhning
    // filiali bu yerda o'zgarmaydi, ya'ni xona baribir shu filialda
    // bo'lishi shart.
    if (body.courseId !== undefined) {
      await this.assertCourseExists(body.courseId);
      data.courseId = body.courseId || null;
    }
    if (body.roomId !== undefined) {
      await this.assertRoomInBranch(body.roomId, group.branchId);
      data.roomId = body.roomId || null;
    }

    if (body.schedule !== undefined) {
      const merged = this.mergeScheduleVersion(
        group.schedule, body.schedule, body.scheduleEffectiveFrom,
      );
      // `null` = o'zgarish yo'q → jadvalga TEGMAYMIZ.
      if (merged) data.schedule = { deleteMany: {}, create: merged };
    }

    if (body.startDate !== undefined) {
      data.startDate = body.startDate ? toUtcMidnight(body.startDate) : null;
    }
    if (body.durationMonths !== undefined) {
      data.durationMonths = body.durationMonths ?? null;
    }

    const entryBillingChanged =
      body.entryBilling !== undefined && body.entryBilling !== group.entryBilling;
    if (body.entryBilling !== undefined) data.entryBilling = body.entryBilling;

    if (body.endDate !== undefined) {
      const newEnd = body.endDate ? toUtcMidnight(body.endDate) : null;
      // ⚠ Yangi `startDate` SHU chaqiruvda kelgan bo'lsa AYNAN o'shani
      // solishtiramiz (Mongoose hujjatni joyida mutatsiya qilardi).
      const nextStart =
        data.startDate !== undefined ? data.startDate : group.startDate;
      if (newEnd && nextStart &&
          newEnd.getTime() < toUtcMidnight(nextStart).getTime()) {
        throw new ApiError(
          400, "Kurs tugash sanasi boshlanish sanasidan oldin bo'lmasin",
        );
      }
      data.endDate = newEnd;
    }

    await this.prisma.group.update({ where: { id: group.id }, data });

    // ⚠ KIRISH SIYOSATI O'ZGARDI — joriy oy qarzlari DARHOL qayta
    // hisoblanadi. ATAYLAB FAQAT JORIY OY: o'tgan oylar odatda
    // to'langan va yopilgan, ularni qayta yozish tarixni buzardi.
    if (entryBillingChanged) {
      const today = localTodayMidnight();
      try {
        await this.payments.recalcForGroupMonth(
          group.id, today.getUTCFullYear(), today.getUTCMonth() + 1,
        );
      } catch (err) {
        this.logger.warn(
          `Kirish siyosati o'zgarishida qarz qayta hisoblanmadi: ${(err as Error).message}`,
        );
      }
    }

    if (body.endDate !== undefined) {
      await this.reconcileGroupEnd(await this.loadGroup(group.id));
    }

    // O'qituvchi o'zgarishi — faqat AKTIV guruhda (davrlardan derived
    // maosh). `reconcile` DAN KEYIN, `teachers` keshi yangilangach.
    if (body.teachers !== undefined) {
      const fresh: any = await this.loadGroup(group.id);
      if (fresh.isActive) {
        const oldIds = this.teacherIdsOf(fresh);
        const newIds = (body.teachers || []).map(String);
        const removed = oldIds.filter((t) => !newIds.includes(t));
        const added = newIds.filter((t: string) => !oldIds.includes(t));
        const today = localTodayMidnight();
        const year = today.getUTCFullYear();
        const month = today.getUTCMonth() + 1;
        for (const teacherId of removed) {
          try {
            // eslint-disable-next-line no-await-in-loop
            await this.periods.unassignTeacher(group.id, teacherId, { endDate: today });
          } catch (err) {
            this.logger.warn(
              `Chiqarilgan o'qituvchi davri yopilmadi: ${(err as Error).message}`,
            );
          }
        }
        for (const teacherId of added) {
          try {
            // eslint-disable-next-line no-await-in-loop
            await this.periods.assignTeacher(group.id, teacherId, { startDate: today });
            // eslint-disable-next-line no-await-in-loop
            await this.salaries.ensureSalaryForTeacherGroup(
              teacherId, group.id, year, month,
            );
          } catch (err) {
            this.logger.warn(
              `Qo'shilgan o'qituvchi biriktirilmadi / maosh yaratilmadi: ` +
                `${(err as Error).message}`,
            );
          }
        }
      }
    }

    return this.shapeGroup(await this.loadGroup(group.id));
  }

  // ═══════════════════ HAYOT TSIKLI (endDate) ═══════════════════

  /**
   * Guruh tugaganda AKTIV o'qituvchilarning davrini yopadi.
   *
   * ⚠ `endDate` EXCLUSIVE → `end + 1 kun` uzatiladi va oxirgi ish kuni
   * `end` bo'lib qoladi. Maosh shu oyda davrdan derived proratsiya
   * bilan hisoblanadi.
   *
   * @returns yopilgan davr ID'lari (arxivdan chiqarishda AYNAN shular
   *          qayta ochiladi)
   */
  private async prorateTeachersOnEnd(group: any, end: Date): Promise<string[]> {
    const endExclusive = new Date(toUtcMidnight(end).getTime() + 24 * 60 * 60 * 1000);
    const activeIds = await this.periods.activeTeacherIdsForGroup(group.id, end);
    const closedIds: string[] = [];
    for (const teacherId of activeIds) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const closed = await this.periods.unassignTeacher(
          group.id, teacherId, { endDate: endExclusive },
        );
        // ⚠ `archivedClosedPeriods` — SKALYAR `String[]`. `closed._id`
        // Prisma yozuvida `undefined` bo'lardi va massiv `undefined`
        // bilan to'lib, arxivdan chiqarishda HECH BIR davr qayta
        // ochilmasdi.
        if (closed?.id) closedIds.push(String(closed.id));
      } catch (err) {
        this.logger.warn(
          `Guruh tugashida o'qituvchi davri yopilmadi: ${(err as Error).message}`,
        );
      }
    }
    return closedIds;
  }

  /**
   * Kurs tugaganda OCHIQ o'quvchi a'zoliklarini tugash sanasida yopadi.
   * `leftAt` EXCLUSIVE → `end + 1 kun`, oxirgi aktiv kun = `end`.
   */
  private async closeMembershipsOnEnd(group: any, end: Date): Promise<string[]> {
    const endExclusive = new Date(toUtcMidnight(end).getTime() + 24 * 60 * 60 * 1000);
    const open = await this.prisma.groupMembership.findMany({
      where: { groupId: group.id, leftAt: null, isDeleted: false },
      select: { id: true, studentId: true },
    });
    const closedIds: string[] = [];
    for (const m of open) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await this.prisma.groupMembership.update({
          where: { id: m.id },
          data: { leftAt: endExclusive, leftReason: 'graduated' },
        });
        // eslint-disable-next-line no-await-in-loop
        await this.recalcFinanceOnLeave(group.id, m.studentId);
        // eslint-disable-next-line no-await-in-loop
        await this.completion.safeRecompute(m.studentId);
        closedIds.push(String(m.id));
      } catch (err) {
        this.logger.warn(
          `Kurs tugashida o'quvchi a'zoligi yopilmadi: ${(err as Error).message}`,
        );
      }
    }
    return closedIds;
  }

  /**
   * Kurs QAYTA AKTIVLASHGANDA yopilgan a'zolikni qayta ochadi
   * (`leftAt = null`) — agar shu o'quvchi+guruhda BOSHQA ochiq a'zolik
   * bo'lmasa (bitta-ochiq invarianti).
   */
  private async reopenMembership(membershipId: string): Promise<void> {
    const m = await this.prisma.groupMembership.findUnique({
      where: { id: String(membershipId) },
    });
    if (!m || m.isDeleted || m.leftAt === null) return;
    const openExists = await this.prisma.groupMembership.findFirst({
      where: {
        groupId: m.groupId, studentId: m.studentId,
        leftAt: null, isDeleted: false,
      },
      select: { id: true },
    });
    if (openExists) return;
    const reopened = await this.prisma.groupMembership.update({
      where: { id: m.id },
      data: {
        leftAt: null,
        leftReason: null,
        // ⚠ `transferredTo` — RELATION; ustun nomi `transferredToId`.
        // Relation nomini `data` ga yozish `connect/disconnect` degani
        // bo'lardi.
        transferredToId: null,
      },
    });
    await this.ensureFinanceForMembershipRange(m.groupId, reopened);
    await this.completion.safeRecompute(m.studentId);
  }

  /**
   * Guruh hayot-tsiklini `endDate` ga moslaydi (IDEMPOTENT).
   *
   * Avval kurs-tugashi yopgan davr/a'zoliklarni QAYTA OCHADI (toza
   * qayta yopish uchun), so'ng `endDate` o'tgan bo'lsa o'sha kunda
   * yopadi. `create`/`update` (endDate o'zgarsa) va KUNLIK JOB chaqiradi.
   */
  async reconcileGroupEnd(group: any) {
    const today = localTodayMidnight();
    const end = group.endDate ? toUtcMidnight(group.endDate) : null;
    const ended = !!end && end.getTime() <= today.getTime();

    const data: any = {};

    const hadClosed =
      (group.archivedClosedPeriods?.length || 0) +
        (group.archivedClosedMemberships?.length || 0) >
      0;
    if (hadClosed) {
      for (const pid of group.archivedClosedPeriods || []) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await this.periods.reopenPeriod(pid);
        } catch (err) {
          this.logger.warn(
            `Reactivate: o'qituvchi davri qayta ochilmadi: ${(err as Error).message}`,
          );
        }
      }
      for (const mid of group.archivedClosedMemberships || []) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await this.reopenMembership(mid);
        } catch (err) {
          this.logger.warn(
            `Reactivate: o'quvchi a'zoligi qayta ochilmadi: ${(err as Error).message}`,
          );
        }
      }
      data.archivedClosedPeriods = [];
      data.archivedClosedMemberships = [];
    }

    if (ended) {
      data.archivedClosedPeriods = await this.prorateTeachersOnEnd(group, end!);
      data.archivedClosedMemberships = await this.closeMembershipsOnEnd(group, end!);
      data.isActive = false;
    } else {
      data.isActive = true;
    }
    return this.prisma.group.update({
      where: { id: group.id }, data, include: GROUP_INCLUDE,
    });
  }

  /**
   * Tugash sanasi YETIB KELGAN, lekin hali aktiv guruhlarni AVTO
   * ARXIVLAYDI (kunlik job + boot catch-up). IDEMPOTENT.
   */
  async processDueGroupEnds() {
    const today = localTodayMidnight();
    const due = await this.prisma.group.findMany({
      where: { isActive: true, isDeleted: false, endDate: { not: null, lte: today } },
      include: GROUP_INCLUDE,
    });
    let archived = 0;
    for (const group of due) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await this.reconcileGroupEnd(group);
        archived += 1;
      } catch (err) {
        this.logger.warn(
          `Guruh avto-arxivlanmadi (${group.id}): ${(err as Error).message}`,
        );
      }
    }
    return { processed: due.length, archived };
  }

  // ═══════════════════ BUTUNLAY O'CHIRISH ═══════════════════

  async permanentRemove(
    id: string, currentUser: any, { confirmName }: { confirmName?: string } = {},
  ) {
    // FILIAL: bu QAYTARIB BO'LMAYDIGAN amal — guruh va uning butun
    // ma'lumoti (davomat, baho, to'lov tarixi) o'chadi.
    const group = await this.prisma.group.findFirst({
      where: { id: String(id), ...branchFilter() },
      select: { id: true, name: true, isActive: true, endDate: true },
    });
    if (!group) throw new ApiError(404, 'Guruh topilmadi');

    // O'chirish faqat: (a) guruhda AKTIV o'quvchi bo'lmasa YOKI
    // (b) kurs yakunlangan bo'lsa.
    const ended =
      group.endDate &&
      toUtcMidnight(group.endDate).getTime() <= localTodayMidnight().getTime();
    const finished = !group.isActive || ended;
    if (!finished) {
      const activeStudents = await this.prisma.groupMembership.count({
        where: { groupId: group.id, leftAt: null, isDeleted: false },
      });
      if (activeStudents > 0) {
        throw new ApiError(
          400,
          "Guruhda o'quvchilar bor. Avval o'quvchilarni chiqaring yoki kursni yakunlang, so'ngra o'chiring",
        );
      }
    }

    // ═══════════════════════════════════════════════════════════════
    // MOLIYAVIY TARIX — O'CHIRISHNI TO'SADI (ARXIVLASH BOR).
    //
    // Jurnalda izi bor guruh HECH QACHON o'chirilmaydi:
    // `journal_entries.groupId` — RESTRICT. Ilgari u `SET NULL` edi va
    // guruhni o'chirish jurnal yozuvining EGASINI jimgina o'chirib
    // yuborardi — summalar joyida qolgani uchun na muvozanat tekshiruvi,
    // na `reconcile()` buni topardi.
    //
    // ⚠ NEGA BU YERDA, FK'ning O'ZIGA TASHLAB QO'YILMAYDI: FK xatosi
    // tranzaksiyaning O'RTASIDA, depozitlar allaqachon qaytarilgandan
    // KEYIN chiqadi va foydalanuvchiga tushunarsiz bo'lib ko'rinadi.
    // Bu tekshiruv esa OLDINDAN, hech narsaga tegmasdan aniq sabab
    // va aniq yechim beradi.
    // ═══════════════════════════════════════════════════════════════
    const journalEntries = await this.prisma.journalEntry.count({
      where: { groupId: group.id },
    });
    if (journalEntries > 0) {
      throw new ApiError(
        409,
        `Bu guruhda moliyaviy tarix bor (${journalEntries} ta jurnal yozuvi) - ` +
          `uni butunlay o'chirib bo'lmaydi, chunki moliyaviy daftar o'zgarmas. ` +
          `Guruhni ARXIVLANG (kursni yakunlang): u faol ro'yxatdan chiqadi, ` +
          `tarixi esa to'liq saqlanadi`,
        { code: 'GROUP_HAS_FINANCIAL_HISTORY', details: { journalEntries } },
      );
    }

    const name = (group.name || '').trim();
    if (!confirmName || confirmName.trim() !== name) {
      throw new ApiError(400, "Tasdiqlash uchun guruh nomini to'g'ri kiriting");
    }

    // ⚠ Depozit qaytarish + fizik o'chirish BITTA tranzaksiyada — aks
    // holda depozit qaytarilib, guruh o'chmay qolishi mumkin edi va
    // o'quvchi pulni IKKI MARTA olardi.
    const studentIds: string[] = await this.prisma.$transaction(async (tx: any) => {
      // 1) MAJBURIY: depozitdan qoplangan to'lovlarni QAYTARAMIZ.
      const covers = await tx.paymentTransaction.findMany({
        where: { groupId: group.id, source: 'deposit', isDeleted: false },
        select: { studentId: true, amount: true },
      });
      const perStudent = new Map<string, number>();
      for (const c of covers) {
        if (!c.studentId) continue;
        const key = String(c.studentId);
        perStudent.set(key, (perStudent.get(key) || 0) + (Number(c.amount) || 0));
      }
      for (const [sid, total] of perStudent) {
        if (total > 0) {
          // eslint-disable-next-line no-await-in-loop
          await this.deposits.refundToDeposit(sid, total, {
            tx, note: "Guruh o'chirildi - to'lovga qaytarildi",
          });
        }
      }

      // 2) Guruhga oid BARCHA yozuvlar + guruhning O'ZI.
      const sids = await this.userRelations.hardDeleteGroupData(group.id, { tx });
      // ⚠ Jadval qatorlari `onDelete: Cascade` bilan o'zi ketadi, lekin
      // ko'p-ko'pga bog'lanish (`teachers`) join jadvalini OCHIQ
      // bo'shatamiz — aks holda o'chirish FK cheklovi bilan yiqilardi.
      await tx.group.update({
        where: { id: group.id }, data: { teachers: { set: [] } },
      });
      await tx.groupScheduleItem.deleteMany({ where: { groupId: group.id } });
      await tx.group.delete({ where: { id: group.id } });
      return sids;
    }, FINANCE_TXN_OPTIONS);

    // A'zolik o'chgani uchun yakunlash sanasini qayta hisoblaymiz.
    for (const sid of studentIds) {
      // eslint-disable-next-line no-await-in-loop
      await this.completion.safeRecompute(sid);
    }

    try {
      await this.systemNotifications.create({
        message: `${name} guruhi tizimdan butunlay o'chirildi`,
      });
    } catch {
      // bildirishnoma yozilmasa ham o'chirish buzilmasin
    }

    return { id: group.id, _id: group.id };
  }

  /**
   * O'CHIRILGAN (soft) guruhni QAYTARADI.
   *
   * ⚠ KASKAD SHU YERDA, ALOHIDA YORDAMCHIDA EMAS. Express'dagi
   * `helpers/cascadeDelete.helper.js` da 4 ta eksport bor, lekin
   * BUTUN kodbazada ulardan FAQAT `restoreGroup` chaqiriladi
   * (o'lchandi: `grep` bo'yicha 1 ta chaqiruvchi). Butun faylni
   * ko'chirish 3 ta O'LIK funksiyani ikkinchi manba sifatida olib
   * kelardi.
   *
   * ⚠ `StudentPayment` va `TeacherSalary` bu kaskadga KIRMAYDI —
   * ularda `isDeleted` ustuni YO'Q. Mongoose ularga ham yozardi, lekin
   * sxemada maydon bo'lmagani uchun JIMGINA tashlab yuborardi: ya'ni
   * "moliya yozuvlari ham yashiriladi" degan taassurot noto'g'ri edi.
   * Summalar a'zolik/davrlardan QAYTA HISOBLANADI.
   */
  async restoreDeleted(id: string) {
    const group = await this.prisma.group.findUnique({ where: { id: String(id) } });
    if (!group) throw new ApiError(404, 'Guruh topilmadi');

    const data = { isDeleted: false, deletedAt: null, deletedBy: null };
    await this.prisma.group.update({ where: { id: group.id }, data });
    const where = { groupId: String(group.id) };
    await Promise.all([
      this.prisma.groupMembership.updateMany({ where, data }),
      this.prisma.attendance.updateMany({ where, data }),
      this.prisma.teacherAbsence.updateMany({ where, data }),
      this.prisma.paymentTransaction.updateMany({ where, data }),
      this.prisma.salaryTransaction.updateMany({ where, data }),
    ]);

    return this.shapeGroup(await this.loadGroup(group.id));
  }

  // ═══════════════════ A'ZOLIK MOLIYASI ═══════════════════

  /**
   * A'zolikning `joinedAt` OYIDAN tugash oyigacha HAR BIR oy uchun
   * tarif (backfill) + proratsiyalangan to'lov + o'qituvchi maoshini
   * yaratadi/yangilaydi (BEST-EFFORT).
   *
   * Eski o'quvchi `joinedAt` o'tgan oyga qo'yilsa, o'tgan oylar qarzi
   * ham proratsiyalangan holda chiqadi.
   */
  private async ensureFinanceForMembershipRange(
    groupId: string, membership: any,
  ): Promise<void> {
    try {
      const today = localTodayMidnight();
      const endRef = membership.leftAt ? toUtcMidnight(membership.leftAt) : today;
      const endYear = endRef.getUTCFullYear();
      const endMonth = endRef.getUTCMonth() + 1;

      const join = new Date(membership.joinedAt);
      let year = join.getUTCFullYear();
      let month = join.getUTCMonth() + 1;

      while (year < endYear || (year === endYear && month <= endMonth)) {
        // eslint-disable-next-line no-await-in-loop
        await this.fees.ensureGroupFeeBackfill(groupId, year, month);
        // eslint-disable-next-line no-await-in-loop
        await this.payments.ensurePaymentForMembership(membership, year, month);
        // eslint-disable-next-line no-await-in-loop
        await this.salaries.recalcForGroupMonth(groupId, year, month);

        month += 1;
        if (month > 12) { month = 1; year += 1; }
      }
    } catch (err) {
      this.logger.warn(
        `A'zolik uchun oylik to'lovlar yaratilmadi: ${(err as Error).message}`,
      );
    }
  }

  /**
   * ORQAGA SANA QO'YISH TA'SIRINI OLDINDAN HISOBLAYDI (HECH NARSA
   * SAQLAMAYDI).
   *
   * ⚠ NEGA KERAK: `joinedAt` o'tgan oyga qo'yilsa
   * `ensureFinanceForMembershipRange` har bir oy uchun QARZ yaratadi —
   * o'quvchi hech qanday ogohlantirishsiz to'satdan 3 oylik qarzdor
   * bo'lib qolardi.
   */
  async previewBackdate(
    groupId: string,
    { joinedAt, leftAt }: { joinedAt?: Date | string; leftAt?: Date | string | null } = {},
  ) {
    const group = await this.ensureGroup(groupId);
    const today = localTodayMidnight();

    const groupStart = toUtcMidnight(group.startDate || group.createdAt);
    const join = joinedAt ? toUtcMidnight(joinedAt) : groupStart;
    const left = leftAt ? toUtcMidnight(leftAt) : null;
    const endRef = left || today;

    const months: { year: number; month: number; amount: number; isPast: boolean }[] = [];
    let year = join.getUTCFullYear();
    let month = join.getUTCMonth() + 1;
    const endYear = endRef.getUTCFullYear();
    const endMonth = endRef.getUTCMonth() + 1;

    // Joriy oy "orqaga" HISOBLANMAYDI (odatiy qo'shish).
    const currentKey = today.getUTCFullYear() * 100 + today.getUTCMonth() + 1;

    let estimatedDebt = 0;
    // ⚠ Cheksiz siklga qarshi qo'riqchi: 10 yildan uzun oraliq real
    // emas va noto'g'ri sana kiritilganda serverni OSIB QO'YARDI.
    let guard = 0;
    while ((year < endYear || (year === endYear && month <= endMonth)) && guard < 120) {
      guard += 1;
      // Tarif hali yaratilmagan bo'lsa o'sha vaqtda amalda bo'lgan ENG
      // YAQIN tarif bilan taxmin qilamiz — AYNAN `ensureGroupFeeBackfill`
      // ishlatadigan qiymat, ya'ni preview haqiqiy natijaga mos keladi.
      // eslint-disable-next-line no-await-in-loop
      const amount = Number(await this.fees.nearestFeeAmount(group.id, year, month)) || 0;
      const isPast = year * 100 + month < currentKey;
      months.push({ year, month, amount, isPast });
      if (isPast) estimatedDebt += amount;

      month += 1;
      if (month > 12) { month = 1; year += 1; }
    }

    return {
      months,
      monthCount: months.length,
      pastMonthCount: months.filter((m) => m.isPast).length,
      // Faqat O'TGAN oylar "yangi qarz" — joriy oy baribir yaratilardi.
      estimatedDebt,
      isBackdated: months.some((m) => m.isPast),
      groupStartDate: group.startDate || null,
    };
  }

  /**
   * ORQAGA SANA bilan qo'shishni TASDIQQA yuboradi (a'zolik yaratmaydi).
   *
   * ⚠ NEGA TASDIQ: o'tgan oyga qarz yozish — chegirma berishning
   * TESKARISI. Chegirma allaqachon tasdiqdan o'tadi (`DISCOUNT_SET`),
   * demak teskari yo'nalish ham o'tishi kerak; aks holda qarzni sun'iy
   * yaratib, keyin uni "yomon qarz" deb hisobdan chiqarish orqali pul
   * o'g'irlash yo'li ochilardi.
   */
  async requestBackdate(
    groupId: string, studentId: string, body: any, currentUser: any,
  ) {
    const group = await this.ensureGroup(groupId);
    const student = await this.ensureStudent(studentId);
    const preview = await this.previewBackdate(groupId, body);
    const branchId = await this.branchAccess.resolveBranchFromGroup(groupId);

    return this.approvals.createRequest({
      branchId,
      kind: APPROVAL_KINDS.MEMBERSHIP_BACKDATE,
      // Limit bilan solishtiriladigan qiymat — YARATILADIGAN QARZ.
      amount: Math.max(1, preview.estimatedDebt),
      payload: {
        group: String(group.id),
        student: String(student.id),
        joinedAt: body.joinedAt,
        leftAt: body.leftAt ?? null,
        previewDebt: preview.estimatedDebt,
        previewMonths: preview.pastMonthCount,
      },
      // Bir o'quvchi + bir guruh uchun BITTA kutilayotgan so'rov.
      subjectKey: `membership_backdate:${String(group.id)}:${String(student.id)}`,
      subjectName: `${student.firstName} ${student.lastName || ''}`.trim(),
      contextName:
        `${group.name} - ${preview.pastMonthCount} oy, ${preview.estimatedDebt} so'm qarz`,
      requestNote: body.requestNote,
      currentUser,
    });
  }

  /**
   * Tasdiqlangan orqaga-sana so'rovini BAJARADI.
   *
   * `addStudent` NING O'ZINI chaqiradi — barcha qo'riqchilar (guruh
   * boshlangan sana, ro'yxatga olingan sana, davrlar kesishuvi) SHU
   * YERDA QAYTA ishlaydi.
   */
  async executeApprovedBackdate(approval: any) {
    const p = approval?.payload || {};
    if (!p.group || !p.student) {
      throw new ApiError(400, "So'rovda guruh yoki o'quvchi ko'rsatilmagan");
    }
    return this.addStudent(p.group, p.student, {
      joinedAt: p.joinedAt,
      leftAt: p.leftAt ?? null,
    });
  }

  // ═══════════════════ DARS TO'QNASHUVI ═══════════════════

  /**
   * Berilgan o'quvchilardan qaysilari MAQSAD guruh jadvali bilan bir
   * kun/bir vaqtda to'qnashuvchi (boshqa AKTIV guruhdagi) darsga ega
   * ekanini aniqlaydi.
   */
  async checkStudentsScheduleConflicts(groupId: string, studentIds: string[]) {
    const ids = [...new Set((studentIds || []).map(String))];
    if (!ids.length) return [];

    const group = await this.prisma.group.findUnique({
      where: { id: String(groupId) },
      select: { id: true, schedule: SCHEDULE_SELECT },
    });
    if (!group) throw new ApiError(404, 'Guruh topilmadi');
    const targetSlots = scheduleActiveOn((group as any).schedule || []);
    // Maqsad guruhning jadvali bo'sh — to'qnashuv bo'lishi MUMKIN EMAS.
    if (!targetSlots.length) return [];

    const mems = await this.prisma.groupMembership.findMany({
      where: {
        studentId: { in: ids },
        groupId: { not: group.id },
        leftAt: null,
        isDeleted: false,
      },
      select: { studentId: true, groupId: true },
    });
    if (!mems.length) return [];

    const otherGroupIds = [...new Set(mems.map((m) => String(m.groupId)))];
    const otherGroups = await this.prisma.group.findMany({
      where: { id: { in: otherGroupIds }, isActive: true, isDeleted: false },
      select: { id: true, name: true, schedule: SCHEDULE_SELECT },
    });
    const groupById = new Map(otherGroups.map((g) => [String(g.id), g]));

    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, firstName: true, lastName: true, username: true },
    });
    const nameById = new Map(
      users.map((u) => [
        String(u.id),
        `${u.firstName} ${u.lastName || ''}`.trim() || `@${u.username}`,
      ]),
    );

    const byStudent = new Map<string, any[]>();
    for (const m of mems) {
      const g: any = groupById.get(String(m.groupId));
      if (!g) continue;
      const hits = findSlotConflicts(targetSlots, scheduleActiveOn(g.schedule || []));
      if (!hits.length) continue;
      const key = String(m.studentId);
      const arr = byStudent.get(key) || [];
      for (const h of hits) {
        arr.push({
          groupName: g.name,
          day: h.day,
          dayLabel: DAY_LABELS_FULL_UZ[h.day] || h.day,
          startTime: h.startTime,
          endTime: h.endTime,
        });
      }
      byStudent.set(key, arr);
    }

    return ids
      .filter((id) => byStudent.has(id))
      .map((id) => ({
        studentId: id,
        studentName: nameById.get(id) || '',
        conflicts: byStudent.get(id),
      }));
  }

  // ═══════════════════ O'QUVCHI QO'SHISH ═══════════════════

  /**
   * Bir nechta o'quvchini bitta guruhga qo'shadi.
   *
   * ⚠ `force=false` bo'lsa avval dars to'qnashuvi tekshiriladi —
   * to'qnashuv bo'lsa HECH KIM qo'shilmaydi va
   * `{ requiresConfirmation: true, conflicts }` qaytadi.
   *
   * ⚠ Har bir o'quvchi ALOHIDA qo'shiladi; bittasi xato bersa
   * qolganlari qo'shilaveradi (`failed` ro'yxatiga tushadi).
   */
  async addStudentsBulk(
    groupId: string,
    studentIds: string[],
    { joinedAt, leftAt, force = false }:
      { joinedAt?: any; leftAt?: any; force?: boolean } = {},
  ) {
    await this.ensureGroup(groupId);
    const ids = [...new Set((studentIds || []).map(String))];
    if (!ids.length) throw new ApiError(400, "O'quvchi tanlanmagan");

    if (!force) {
      const conflicts = await this.checkStudentsScheduleConflicts(groupId, ids);
      if (conflicts.length) {
        return { requiresConfirmation: true, conflicts, added: [], failed: [] };
      }
    }

    const added: { studentId: string; membershipId: string }[] = [];
    const failed: { studentId: string; message: string }[] = [];
    for (const studentId of ids) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const membership: any = await this.addStudent(groupId, studentId, {
          joinedAt, leftAt,
        });
        added.push({ studentId, membershipId: membership.id });
      } catch (err) {
        failed.push({
          studentId,
          message: (err as Error)?.message || "Qo'shib bo'lmadi",
        });
      }
    }
    return { requiresConfirmation: false, conflicts: [], added, failed };
  }

  async addStudent(
    groupId: string,
    studentId: string,
    { joinedAt, leftAt }: { joinedAt?: any; leftAt?: any } = {},
  ) {
    const group = await this.ensureGroup(groupId);
    const student = await this.ensureStudent(studentId);

    const existing = await this.prisma.groupMembership.findFirst({
      where: {
        groupId: group.id, studentId: student.id,
        leftAt: null, isDeleted: false,
      },
      select: { id: true },
    });
    if (existing) throw new ApiError(409, "O'quvchi allaqachon shu guruhda");

    // ⚠ STANDART BOSHLASH SANASI: guruh o'quvchi RO'YXATGA
    // OLINISHIDAN OLDIN boshlangan bo'lsa, standart sana ro'yxatga
    // olingan kun bo'ladi — aks holda "10-iyulda ro'yxatga olingan,
    // lekin 1-iyuldan o'qiyapti" degan BO'LMAGAN davr paydo bo'lardi.
    const groupStart = toUtcMidnight(group.startDate || group.createdAt);
    const enrolledStart = student.enrolledAt
      ? toUtcMidnight(student.enrolledAt) : null;
    const defaultJoin =
      enrolledStart && enrolledStart.getTime() > groupStart.getTime()
        ? enrolledStart
        : groupStart;
    const join = joinedAt ? toUtcMidnight(joinedAt) : defaultJoin;
    const left = leftAt ? toUtcMidnight(leftAt) : null;
    if (left && left.getTime() < join.getTime()) {
      throw new ApiError(
        400, "Tugatgan sana boshlash sanasidan oldin bo'lishi mumkin emas",
      );
    }
    if (join.getTime() < groupStart.getTime()) {
      throw new ApiError(
        400, "O'quvchini guruh boshlangan sanadan oldin qo'shib bo'lmaydi",
      );
    }
    if (enrolledStart && join.getTime() < enrolledStart.getTime()) {
      throw new ApiError(
        400, "O'quvchini ro'yxatga olingan sanadan oldin guruhga qo'shib bo'lmaydi",
      );
    }

    // A'zolik davrlari KESISHMASLIGI + BITTA ochiq bo'lishi SHART.
    const otherMems = await this.prisma.groupMembership.findMany({
      where: { groupId: group.id, studentId: student.id, isDeleted: false },
      select: { joinedAt: true, leftAt: true },
    });
    assertPeriodInvariants(
      { startDate: join, endDate: left } as never,
      otherMems.map((m) => ({ startDate: m.joinedAt, endDate: m.leftAt })) as never,
      'date',
    );

    const membership = await this.prisma.groupMembership.create({
      data: {
        groupId: group.id, studentId: student.id, joinedAt: join, leftAt: left,
      },
    });

    // `joinedAt` oyidan tugash oyigacha barcha oylar uchun qarz yoziladi.
    await this.ensureFinanceForMembershipRange(group.id, membership);

    // ═══════════════════════════════════════════════════════════════
    // BOSHLANG'ICH QARZNI YOZIB QO'YISH.
    //
    // O'quvchi guruhsiz yaratilgan bo'lsa, uning tizimga kirishidan
    // oldingi qarzi "guruh kutmoqda" holatida turadi (`StudentPayment`
    // qatori guruhsiz mavjud bo'lolmaydi). Guruh ANIQ bo'lgan birinchi
    // daqiqa — aynan shu yer.
    //
    // ⚠ `ensureFinanceForMembershipRange` DAN KEYIN: ichkarida
    // depozitdan avto-qoplash chaqiriladi va u eng eski qarzdan
    // boshlab yopadi.
    //
    // IDEMPOTENT va BEST-EFFORT.
    // ═══════════════════════════════════════════════════════════════
    await this.openingBalance.materializePendingForStudent(student.id, group.id);

    await this.completion.safeRecompute(student.id);

    return withLegacyId(membership);
  }

  // ═══════════════════ A'ZOLIK SANALARI ═══════════════════

  /**
   * O'quvchining guruhdagi a'zolik sanalarini tahrirlaydi.
   *
   * ⚠ QULF: `joinedAt` ni OLDINGA (kechroq sanaga) surishda, oradagi
   * davrda biror oy TO'LANGAN bo'lsa (`paidAmount > 0`) — RAD ETILADI.
   */
  private async applyMembershipDates(
    membership: any, { joinedAt, leftAt }: { joinedAt?: any; leftAt?: any } = {},
  ) {
    const groupId = membership.groupId;
    const studentId = membership.studentId;

    const oldJoin = toUtcMidnight(membership.joinedAt);
    const newJoin =
      joinedAt !== undefined && joinedAt !== null ? toUtcMidnight(joinedAt) : oldJoin;
    // `leftAt`: `undefined` → o'zgartirmaymiz; `null` → "o'qimoqda"ga qaytaramiz.
    const newLeft =
      leftAt === undefined
        ? membership.leftAt ? toUtcMidnight(membership.leftAt) : null
        : leftAt ? toUtcMidnight(leftAt) : null;

    if (newLeft && newLeft.getTime() < newJoin.getTime()) {
      throw new ApiError(
        400, "Tugatgan sana boshlash sanasidan oldin bo'lishi mumkin emas",
      );
    }

    const groupDoc = await this.prisma.group.findUnique({
      where: { id: groupId },
      select: { startDate: true, createdAt: true },
    });
    if (groupDoc) {
      const groupStart = toUtcMidnight(groupDoc.startDate || groupDoc.createdAt);
      if (newJoin.getTime() < groupStart.getTime()) {
        throw new ApiError(
          400, "A'zolik boshlanish sanasi guruh boshlangan sanadan oldin bo'lmasin",
        );
      }
    }

    const studentDoc = await this.prisma.user.findUnique({
      where: { id: studentId }, select: { enrolledAt: true },
    });
    if (studentDoc?.enrolledAt) {
      const enrolledStart = toUtcMidnight(studentDoc.enrolledAt);
      if (newJoin.getTime() < enrolledStart.getTime()) {
        throw new ApiError(
          400, "A'zolik boshlanish sanasi ro'yxatga olingan sanadan oldin bo'lmasin",
        );
      }
    }

    // QULF: `joinedAt` OLDINGA surilyaptimi?
    if (newJoin.getTime() > oldJoin.getTime()) {
      const paid = await this.payments.earliestPaidMonthBefore(studentId, groupId, {
        year: newJoin.getUTCFullYear(), month: newJoin.getUTCMonth() + 1,
      });
      if (paid) {
        throw new ApiError(
          409,
          `To'langan davrni o'zgartirib bo'lmaydi: ${paid.year}-yil ${paid.month}-oy uchun to'lov qilingan`,
        );
      }
    }

    const otherMems = await this.prisma.groupMembership.findMany({
      where: { groupId, studentId, id: { not: membership.id }, isDeleted: false },
      select: { joinedAt: true, leftAt: true },
    });
    assertPeriodInvariants(
      { startDate: newJoin, endDate: newLeft } as never,
      otherMems.map((m) => ({ startDate: m.joinedAt, endDate: m.leftAt })) as never,
      'date',
    );

    const saved = await this.prisma.groupMembership.update({
      where: { id: membership.id },
      data: { joinedAt: newJoin, leftAt: newLeft },
    });

    // Eski davrda bo'lib, YANGI davrga TUSHMAY qolgan oylarni 0 ga
    // tushirish uchun shu o'quvchi-guruhning BARCHA to'lovlari qayta
    // hisoblanadi, so'ng yangi davr oylari ta'minlanadi.
    try {
      await this.payments.recalcForStudentScope(studentId, groupId, {});
    } catch (err) {
      this.logger.warn(
        `A'zolik tahrirlanganda eski to'lovlar qayta hisoblanmadi: ${(err as Error).message}`,
      );
    }
    await this.ensureFinanceForMembershipRange(groupId, saved);
    await this.completion.safeRecompute(studentId);

    return withLegacyId(saved);
  }

  async updateMembership(
    groupId: string, studentId: string,
    { joinedAt, leftAt }: { joinedAt?: any; leftAt?: any } = {},
  ) {
    const group = await this.ensureGroup(groupId);
    const student = await this.ensureStudent(studentId);

    const membership = await this.prisma.groupMembership.findFirst({
      where: {
        groupId: group.id, studentId: student.id, leftAt: null, isDeleted: false,
      },
    });
    if (!membership) {
      throw new ApiError(404, "O'quvchining ushbu guruhda faol a'zoligi topilmadi");
    }
    return this.applyMembershipDates(membership, { joinedAt, leftAt });
  }

  /** O'qish davrini ID bo'yicha tahrirlash (TARIXIY davr ham). */
  async updateMembershipById(
    groupId: string, membershipId: string,
    { joinedAt, leftAt }: { joinedAt?: any; leftAt?: any } = {},
  ) {
    const group = await this.ensureGroup(groupId);
    const membership = await this.prisma.groupMembership.findFirst({
      where: { id: String(membershipId), groupId: group.id, isDeleted: false },
    });
    if (!membership) throw new ApiError(404, "O'qish davri topilmadi");
    return this.applyMembershipDates(membership, { joinedAt, leftAt });
  }

  /** O'qish davri QAMRAGAN oylar, oxiri JORIY oygacha. `leftAt` EXCLUSIVE. */
  private membershipMonths(joinedAt: any, leftAt: any) {
    const DAY = 24 * 60 * 60 * 1000;
    const today = localTodayMidnight();
    const curIdx = today.getUTCFullYear() * 12 + today.getUTCMonth();
    const s = new Date(joinedAt);
    const startIdx = s.getUTCFullYear() * 12 + s.getUTCMonth();
    let endIdx = curIdx;
    if (leftAt) {
      const e = new Date(new Date(leftAt).getTime() - DAY);
      endIdx = e.getUTCFullYear() * 12 + e.getUTCMonth();
    }
    endIdx = Math.min(endIdx, curIdx);
    const out: { year: number; month: number }[] = [];
    for (let i = startIdx; i <= endIdx; i += 1) {
      out.push({ year: Math.floor(i / 12), month: (i % 12) + 1 });
    }
    return out;
  }

  /** O'qish davrini o'chirish — TO'LOV QO'RIQCHISI bilan. */
  async removeMembershipById(groupId: string, membershipId: string) {
    const group = await this.ensureGroup(groupId);
    const membership = await this.prisma.groupMembership.findFirst({
      where: { id: String(membershipId), groupId: group.id, isDeleted: false },
    });
    if (!membership) throw new ApiError(404, "O'qish davri topilmadi");

    const months = this.membershipMonths(membership.joinedAt, membership.leftAt);
    if (months.length) {
      const paid = await this.prisma.studentPayment.findFirst({
        where: {
          studentId: membership.studentId,
          groupId: group.id,
          paidAmount: { gt: 0 },
          OR: months,
        },
        select: { id: true },
      });
      if (paid) {
        throw new ApiError(
          400, "Bu davrga oid to'lov mavjud. Avval to'lovlarni o'chiring.",
        );
      }
    }

    // Qarzli o'quvchining o'qish davrini o'chirib bo'lmaydi.
    if (await this.payments.hasOutstandingDebtInGroup(
      membership.studentId, group.id,
    )) {
      throw new ApiError(
        400, "O'quvchining bu guruhda qarzi bor. Avval qarzni to'lang.",
      );
    }

    await this.prisma.groupMembership.update({
      where: { id: membership.id },
      data: { isDeleted: true, deletedAt: new Date() },
    });
    try {
      await this.payments.recalcForStudentScope(membership.studentId, group.id, {});
    } catch (err) {
      this.logger.warn(
        `O'qish davri o'chirilganda to'lovlar qayta hisoblanmadi: ${(err as Error).message}`,
      );
    }
    await this.completion.safeRecompute(membership.studentId);
    return { id: membership.id, _id: membership.id };
  }

  // ═══════════════════ GURUHDAN CHIQARISH ═══════════════════

  /**
   * A'zolik yopilganda o'quvchining shu guruhdagi BARCHA oylik
   * to'lovlarini `leftAt` bo'yicha qayta proratsiya qiladi, so'ng
   * o'qituvchi FOIZ maoshini yangilaydi (BEST-EFFORT).
   */
  private async recalcFinanceOnLeave(groupId: string, studentId: string): Promise<void> {
    try {
      await this.payments.recalcForStudentScope(studentId, groupId, {});
      const today = localTodayMidnight();
      await this.salaries.recalcForGroupMonth(
        groupId, today.getUTCFullYear(), today.getUTCMonth() + 1,
      );
    } catch (err) {
      this.logger.warn(
        `A'zolik yopilganda to'lovlar qayta hisoblanmadi: ${(err as Error).message}`,
      );
    }
  }

  async removeStudent(
    groupId: string,
    studentId: string,
    { reasonId, writeOff = false }: { reasonId?: string; writeOff?: boolean } = {},
    currentUser: any = null,
  ) {
    const group = await this.ensureGroup(groupId);

    // ⚠ QARZLI O'QUVCHINI CHIQARISH: `writeOff=false` bo'lsa 409 bilan
    // qarz summasini qaytaramiz — frontend "Yomon qarz" tasdiq modalini
    // ko'rsatadi. `writeOff=true` (admin tasdiqladi) bo'lsa qarz YOMON
    // QARZ sifatida hisobdan chiqariladi.
    const debt = await this.payments.getOutstandingBreakdownInGroup(
      studentId, group.id,
    );
    if (debt.total > 0 && !writeOff) {
      throw new ApiError(409, "O'quvchida to'lanmagan qarz bor", {
        code: 'OUTSTANDING_DEBT',
        details: { amount: debt.total, breakdown: debt.items },
      });
    }

    const leftAt = toUtcMidnight(new Date());

    // Dinamik chiqish sababi — snapshot `title` bilan BIRGA yoziladi,
    // shunda sabab keyin o'chsa/o'zgarsa ham retention hisoboti buzilmaydi.
    const set: any = { leftAt, leftReason: 'removed' };
    let leftReasonTitle = '';
    if (reasonId) {
      const reason = await this.prisma.archiveReason.findUnique({
        where: { id: String(reasonId) },
        select: { id: true, title: true },
      });
      if (!reason) throw new ApiError(400, 'Chiqish sababi topilmadi');
      // `leftReasonDetail` — RELATION; ustun `leftReasonDetailId`.
      set.leftReasonDetailId = reason.id;
      // `leftReasonTitle` NOT NULL (`@default("")`) — `null` yozib bo'lmaydi.
      set.leftReasonTitle = reason.title || '';
      leftReasonTitle = set.leftReasonTitle;
    }

    // ⚠ Prisma'da `update` faqat UNIQUE kalit bo'yicha ishlaydi, shuning
    // uchun avval faol a'zolikni topamiz. Qisman unique indeks
    // `(groupId, studentId) WHERE leftAt IS NULL` kafolatlaydi: bunday
    // qator KO'PI BILAN BITTA.
    const open = await this.prisma.groupMembership.findFirst({
      where: {
        groupId: group.id, studentId: String(studentId),
        leftAt: null, isDeleted: false,
      },
      select: { id: true },
    });
    if (!open) throw new ApiError(404, "Faol a'zolik topilmadi");
    const membership = await this.prisma.groupMembership.update({
      where: { id: open.id }, data: set,
    });

    // ⚠ WRITE-OFF `recalcFinanceOnLeave` DAN OLDIN: aks holda `leftAt`
    // proratsiyasi qarz summasini o'zgartirib yuborardi. Write-off
    // qilingan to'lovlar keyingi `recalc` da MUZLAYDI.
    let writeOffResult: any = null;
    if (debt.total > 0 && writeOff) {
      writeOffResult = await this.payments.writeOffDebtInGroup(studentId, group.id, {
        membershipId: membership.id,
        currentUser,
        reasonTitle: leftReasonTitle,
      });
    }

    // Ketgan o'quvchi endi to'liq oy uchun hisoblanmasin.
    await this.recalcFinanceOnLeave(group.id, studentId);
    await this.completion.safeRecompute(studentId);

    return { membership: withLegacyId(membership), writeOff: writeOffResult };
  }
}
