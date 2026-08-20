import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { withLegacyId, withLegacyIds } from '../../common/utils/serialize.js';
import { branchFilter } from '../../common/als/branch-context.js';
import { BranchAccessService } from '../../common/rbac/branch-access.service.js';
import { BOT_STATUS, botStatusOf } from '../../common/rbac/bot-status.js';
import { toUtcMidnight, localTodayMidnight } from '../../common/utils/date.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * GURUHLAR — `modules/groups/services/groups.service.js` NING O'QISH QISMI.
 *
 * ── FAZA 5a: FAQAT O'QISH ──
 * Yozish amallari (yaratish, tahrirlash, o'quvchi qo'shish/chiqarish,
 * a'zolik davrlarini tahrirlash, o'qituvchi davrlari) BU YERDA YO'Q.
 * Ular `finance/groupFee`, `finance/studentPayment`, `teacherSalary`,
 * `deposits`, `openingBalance` va `expenseApprovals` servislariga
 * tayanadi — ular hali ko'chirilmagan.
 *
 * Bu `users` moduli uchun qo'llanilgan 2.5a/2.5b NAQSHINING AYNAN
 * O'ZI: bog'liqligi yo'q marshrutlar oldin ko'chadi, moliyaga
 * tegadiganlari moliya modullaridan KEYIN. Trafik Express'da
 * qolgani uchun bu xavfsiz.
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

@Injectable()
export class GroupsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  /** Guruh javobini eski (Mongoose) shakliga keltiradi. */
  private shapeGroup<T>(group: T): T {
    if (!group) return group;
    // Klient `group.teachers[i]._id` o'qiydi — `withLegacyId` ichkariga
    // ham kiradi.
    return withLegacyId(group);
  }

  /**
   * YOZUV amallari uchun: guruh mavjud + AKTIV bo'lishi shart.
   *
   * ⚠ O'QISH yo'llari (`getById`, `list`) guruhni TO'G'RIDAN-TO'G'RI
   * o'qiydi — arxivlangan guruhni KO'RISH mumkin. `history` esa
   * Express'da AYNAN shu funksiyadan o'tadi, ya'ni tugagan kurs
   * tarixi 400 beradi. Bu G'ALATI, lekin KLIENT SHARTNOMASI —
   * o'zgartirilmadi (`MIGRATION-CHECKLIST.md`, B4).
   *
   * FILIAL KO'LAMI shu YAGONA nuqtada.
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
    const group = await this.ensureGroup(groupId);
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
}
