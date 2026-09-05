import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { ROLES } from '../../common/constants/permissions.js';
import {
  OPENING_MAX_AMOUNT,
  OPENING_PENDING,
} from '../../common/constants/opening-balance.js';
import { localTodayMidnight, toUtcMidnight } from '../../common/utils/date.js';
import { branchFilter } from '../../common/als/branch-context.js';
import { BranchAccessService } from '../../common/rbac/branch-access.service.js';
import { withLegacyId, withLegacyIds } from '../../common/utils/serialize.js';
import { DepositsService } from '../deposits/index.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * BOSHLANG'ICH QOLDIQ — `openingBalance/services/openingBalance.service.js`.
 *
 * Markaz boshqa tizimdan ko'chib kelganda har bir odamning eski qarzi yoki
 * avansi shu yerda yoziladi va HAQIQIY moliyaviy qatorlarga aylantiriladi
 * ("materializatsiya").
 *
 * ── IDEMPOTENTLIK HIKOYASI ──
 *
 * `OpeningBalance.userId` UNIQUE — importning butun kafolati shunda.
 * `create` ATAYLAB `upsert` EMAS: `upsert` o'zgarmas moliyaviy yozuvni
 * jimgina qayta yozib yuborardi; `create` esa P2002 beradi va biz uni
 * "takror" deb qaytaramiz (409, xato emas).
 *
 * ── IKKI QADAM: LANGAR → MATERIALIZATSIYA ──
 *
 * 1) LANGAR yoziladi (unique). Bu qator o'tsa — pul yozish huquqi FAQAT
 *    shu chaqiruvda.
 * 2) MATERIALIZATSIYA (depozit / oylik plan / maosh qatori / payroll
 *    tuzatishi). Yiqilsa LANGAR QOLADI (qayta import pulni ikki marta
 *    yozmasin), xato esa yozib qo'yiladi va `repairPending` tuzatadi.
 * ═══════════════════════════════════════════════════════════════════════════
 */
@Injectable()
export class OpeningBalanceService {
  private readonly logger = new Logger('OpeningBalance');

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly branchAccess: BranchAccessService,
    private readonly deposits: DepositsService,
  ) {}

  private actorId(u: any): string | null {
    return u?.id || u?._id || null;
  }

  private prevPeriod(year: number, month: number) {
    return month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 };
  }

  private periodOfDate(d: Date) {
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 };
  }

  /**
   * BOSHLANG'ICH QARZ QAYSI OYGA YOZILADI.
   *
   * ⚠ Javob HAR DOIM "eng eski oydan ham OLDINGI oy" bo'lishi SHART.
   * Sabab to'lovni taqsimlash mantig'i: `transaction.buildAllocationOrder`
   * va `deposits.autoApply` ikkalasi ham `{year, month}` bo'yicha saralab,
   * ENG ESKI qarzdan boshlab yopadi. Boshlang'ich qarz eng eski bo'lmasa,
   * o'quvchi to'lagan pul avval YANGI oylarni yopib, eski qarz abadiy
   * osilib qolardi.
   */
  async resolveOpeningPeriod({
    student,
    group,
    joinedAt,
  }: { student?: string | null; group?: string | null; joinedAt?: Date | string | null }) {
    let anchor: { year: number; month: number } | null = null;

    // 1) Mavjud eng eski oylik plan.
    if (student && group) {
      const oldest = await this.prisma.studentPayment.findFirst({
        where: { studentId: String(student), groupId: String(group) },
        select: { year: true, month: true },
        orderBy: [{ year: 'asc' }, { month: 'asc' }],
      });
      if (oldest) anchor = { year: oldest.year, month: oldest.month };
    }

    // 2) Plan hali yo'q bo'lsa — a'zolik sanasidan.
    if (!anchor && joinedAt) {
      const d = toUtcMidnight(joinedAt as any);
      if (d) anchor = this.periodOfDate(d);
    }

    // 3) Ikkalasi ham yo'q — bugundan.
    if (!anchor) anchor = this.periodOfDate(localTodayMidnight());

    return this.prevPeriod(anchor.year, anchor.month);
  }

  /**
   * Rol + ISHORADAN materializatsiya turini aniqlaydi.
   *
   * Kirish summasi HAR DOIM "party" konvensiyasida (+ = markaz qarzdor),
   * shuning uchun qoida rolga qarab o'zgarmaydi.
   */
  resolveKind(role: string, amount: number): string {
    const positive = Number(amount) > 0;
    if (role === ROLES.STUDENT) return positive ? 'student_credit' : 'student_debt';
    if (role === ROLES.TEACHER) return positive ? 'teacher_credit' : 'teacher_debt';
    return positive ? 'staff_credit' : 'staff_debt';
  }

  /**
   * SAQLANGAN summani "party" konvensiyasiga keltiradi (+ = markaz qarzdor).
   *
   * ⚠ Balansni O'QIYDIGAN HAR BIR joy SHU funksiyadan o'tishi shart —
   * `ob.amount` ni to'g'ridan-to'g'ri ishlatish ESKI (`flow`) yozuvlarda
   * o'qituvchi/xodim ISHORASINI TESKARI ko'rsatadi.
   */
  partyAmount(ob: any): number {
    const amt = Number(ob?.amount) || 0;
    if (!amt) return 0;
    if (ob?.signConvention === 'party') return amt;
    // Eski (flow): o'quvchida ikkala qoida mos tushadi, o'qituvchi/xodimda
    // teskari (u yerda +X "biz ortiqcha berdik" = u bizga qarz degani edi).
    return ob?.role === ROLES.STUDENT ? amt : -amt;
  }

  async existsFor(userId: string): Promise<boolean> {
    return Boolean(
      await this.prisma.openingBalance.findUnique({
        where: { userId: String(userId) },
        select: { id: true },
      }),
    );
  }

  async existingUserIds(userIds: string[]): Promise<Set<string>> {
    if (!userIds?.length) return new Set();
    const rows = await this.prisma.openingBalance.findMany({
      where: { userId: { in: userIds.map(String) } },
      select: { userId: true },
    });
    return new Set(rows.map((r) => String(r.userId)));
  }

  // ══════════════════════════════════════════════════════════════════
  // MATERIALIZATSIYA
  // ══════════════════════════════════════════════════════════════════

  /**
   * O'QUVCHI, AVANS (+X). Depozitga tushadi va darhol mavjud qarzlarni
   * ENG ESKISIDAN boshlab yopadi.
   */
  private async materializeStudentCredit(ob: any, { currentUser }: { currentUser: any }) {
    // `paidAt` — boshlang'ich davr oxiri. Kelajakda bo'lmasligi shart
    // (`topup` tekshiradi), shuning uchun bugundan oshsa bugunga tushiramiz.
    const periodEnd = new Date(Date.UTC(ob.year, ob.month, 0));
    const today = localTodayMidnight();
    const paidAt = periodEnd.getTime() > today.getTime() ? today : periodEnd;

    const deposit: any = await this.deposits.topup(
      ob.userId,
      {
        amount: ob.amount, // musbat
        method: 'cash',
        paidAt,
        note: "Boshlang'ich avans (tizimga o'tishda kiritilgan)",
        isOpening: true,
      },
      currentUser,
    );

    const refs: any[] = [{ model: 'StudentDeposit', docId: deposit.id }];
    if (deposit.$lastTransactionId) {
      refs.push({ model: 'DepositTransaction', docId: deposit.$lastTransactionId });
    }
    return refs;
  }

  /**
   * O'QUVCHI, QARZ (−X). Sintetik oylik plan qatori.
   *
   * ⚠ `isOpening = true` bo'lgani uchun `recalc()` unga TEGMAYDI va
   * hisobotda "hisoblangan daromad" ga kirmaydi — lekin qarzdorlar
   * ro'yxatida va to'lov taqsimotida NORMAL qator kabi ishtirok etadi,
   * ya'ni keyingi to'lov uni BIRINCHI bo'lib yopadi.
   */
  private async materializeStudentDebt(ob: any) {
    const branchId =
      ob.branchId || (await this.branchAccess.resolveBranchFromGroup(ob.groupId));
    if (!branchId) {
      throw new ApiError(400, "O'quvchi guruhining filiali aniqlanmadi");
    }

    const amount = Math.abs(ob.amount);

    // IDEMPOTENTLIK: (studentId, groupId, year, month, isOpening) unique.
    let doc: any;
    try {
      doc = await this.prisma.studentPayment.create({
        data: {
          branchId,
          studentId: ob.userId,
          groupId: ob.groupId,
          membershipId: null,
          year: ob.year,
          month: ob.month,
          baseFee: amount,
          prorationFactor: 1,
          discountApplied: 0,
          expectedAmount: amount,
          paidAmount: 0,
          status: 'unpaid',
          isOpening: true,
          recalculatedAt: new Date(),
        },
      });
    } catch (err: any) {
      if (err?.code !== 'P2002') throw err;
      doc = await this.prisma.studentPayment.findUnique({
        where: {
          studentId_groupId_year_month_isOpening: {
            studentId: ob.userId,
            groupId: ob.groupId,
            year: ob.year,
            month: ob.month,
            isOpening: true,
          },
        },
      });
      if (!doc) throw err;
    }

    // O'quvchining depozitida pul bo'lsa — yangi qarzni darhol qoplaymiz.
    // Best-effort: qoplanmasa qarz shunchaki ochiq qoladi, buzilish yo'q.
    try {
      await this.deposits.autoApply(ob.userId, null);
    } catch (err: any) {
      this.logger.warn(
        `Boshlang'ich qarzdan keyin depozit avto-qoplash bajarilmadi ` +
          `(student=${ob.userId}): ${err?.message}`,
      );
    }

    return [{ model: 'StudentPayment', docId: doc.id }];
  }

  /**
   * O'QITUVCHI. Ikkala yo'nalish ham BITTA qator: `kind="opening"`,
   * ishorasi `expectedAmount` da.
   *
   * ⚠ `isLocked = true` — modelda AYNAN shu holat uchun mavjud himoya
   * ("markaz boshqa tizimdan ko'chib kelganda"): hech qanday avtomatik
   * qayta hisob bu qatorga tegmaydi.
   */
  private async materializeTeacher(ob: any) {
    // GURUH IXTIYORIY: qoldiq markaz darajasidagi majburiyat.
    let branchId = ob.branchId;
    if (!branchId && ob.groupId) {
      branchId = await this.branchAccess.resolveBranchFromGroup(ob.groupId);
    }
    if (!branchId) {
      const teacher = await this.prisma.user.findUnique({
        where: { id: ob.userId },
        select: { homeBranchId: true },
      });
      branchId = teacher?.homeBranchId || null;
    }
    if (!branchId) throw new ApiError(400, "O'qituvchining filiali aniqlanmadi");

    // ── DUBLIKATDAN HIMOYA — KODDA, CHUNKI BAZADA INDEKS YO'Q ──
    //
    // Qisman unique indekslar FAQAT `kind='group'` va `kind='base'` uchun.
    // `kind='opening'` qatorlari ATAYLAB cheklanmagan, ya'ni
    // `repairPending()` ikki marta ishlasa IKKINCHI qator yozilib,
    // o'qituvchi IKKI MARTA qarzdor bo'lardi.
    const existing = await this.prisma.teacherSalary.findFirst({
      where: {
        teacherId: ob.userId,
        groupId: ob.groupId || null,
        year: ob.year,
        month: ob.month,
        kind: 'opening',
      },
      select: { id: true },
    });
    if (existing) return [{ model: 'TeacherSalary', docId: existing.id }];

    // ⚠ ISHORA SAQLANADI — `Math.abs` bilan "tuzatish" qarzni AVANSGA
    // aylantirardi.
    const expectedAmount =
      ob.kind === 'teacher_credit' ? Math.abs(ob.amount) : -Math.abs(ob.amount);

    const doc = await this.prisma.teacherSalary.create({
      data: {
        branchId,
        teacherId: ob.userId,
        groupId: ob.groupId || null,
        year: ob.year,
        month: ob.month,
        kind: 'opening',
        expectedAmount,
        paidAmount: 0,
        status: 'unpaid',
        isOpening: true,
        isLocked: true,
        source: 'manual',
        reason: "Boshlang'ich qoldiq (tizimga o'tishda kiritilgan)",
      } as any,
    });

    return [{ model: 'TeacherSalary', docId: doc.id }];
  }

  /**
   * XODIM. Alohida tuzatish qatori.
   *
   * `opening_debt` oylikdan katta bo'lsa qoldig'i keyingi oyga
   * ko'chiriladi (`staffPayroll.carryOverOpeningDebt`) — shuning uchun bu
   * yerda hech narsa QIRQILMAYDI.
   */
  private async materializeStaff(ob: any) {
    const employee = await this.prisma.user.findUnique({
      where: { id: ob.userId },
      select: { homeBranchId: true },
    });

    const kind = ob.kind === 'staff_credit' ? 'opening_credit' : 'opening_debt';

    // Qisman unique indeks BOR: (employeeId, year, month, kind).
    let doc: any;
    try {
      doc = await this.prisma.staffPayrollAdjustment.create({
        data: {
          employeeId: ob.userId,
          branchId: ob.branchId || employee?.homeBranchId || null,
          year: ob.year,
          month: ob.month,
          kind,
          amount: Math.abs(ob.amount),
          reason: "Boshlang'ich qoldiq (tizimga o'tishda kiritilgan)",
        } as any,
      });
    } catch (err: any) {
      if (err?.code !== 'P2002') throw err;
      doc = await this.prisma.staffPayrollAdjustment.findFirst({
        where: { employeeId: ob.userId, year: ob.year, month: ob.month, kind } as any,
      });
      if (!doc) throw err;
    }

    // ⚠⚠ KO'CHIRILMAGAN YON TA'SIR — JIMGINA O'TKAZIB YUBORILMAYDI.
    //
    // Express shu nuqtada `staffPayroll.computePayroll` ni chaqiradi
    // (best-effort). Sabablari:
    //   1) egasi natijani shu zahoti ko'radi;
    //   2) MUHIMROQ — ko'chirish zanjiri `StaffPayroll` qatoriga tayanadi
    //      (`openingDebtTotal` / `openingDebtApplied`). Qator bo'lmasa
    //      qarz o'sha oyda MUZLAB qolardi va keyingi oyga o'tmasdi.
    //
    // `staff-payroll` moduli hali ko'chirilmagan (Nest'da faqat
    // `payroll-audit.service.ts` bor). Uni BU YERDA qayta yozish
    // "ikkinchi buxgalteriya implementatsiyasi" bo'lardi — TAQIQLANGAN.
    //
    // ⚠ JAVOB TANASIGA TA'SIR QILMAYDI: Express'da ham bu chaqiruv
    // `try/catch` ichida va natijasi javobga chiqmaydi — paritet
    // BUZILMAYDI. Farq faqat hosila qatorda va u belgili WARN bilan
    // ko'rinib turadi.
    this.logger.warn(
      `DEFERRED_EFFECT staffPayroll.computePayroll — FAZA 8.2 ko'chmagan. ` +
        `Kontekst: ${JSON.stringify({
          employeeId: String(ob.userId),
          year: ob.year,
          month: ob.month,
        })}`,
    );

    return [{ model: 'StaffPayrollAdjustment', docId: doc.id }];
  }

  private materializer(kind: string) {
    const map: Record<string, (ob: any, ctx: any) => Promise<any[]>> = {
      student_credit: (ob, ctx) => this.materializeStudentCredit(ob, ctx),
      student_debt: (ob) => this.materializeStudentDebt(ob),
      teacher_credit: (ob) => this.materializeTeacher(ob),
      teacher_debt: (ob) => this.materializeTeacher(ob),
      staff_credit: (ob) => this.materializeStaff(ob),
      staff_debt: (ob) => this.materializeStaff(ob),
    };
    return map[kind];
  }

  // ══════════════════════════════════════════════════════════════════
  // UMUMIY YO'L
  // ══════════════════════════════════════════════════════════════════

  /**
   * @returns `{ status: "created" | "duplicate", opening }`
   *   `duplicate` — bu odamda allaqachon boshlang'ich qoldiq bor.
   *   XATO EMAS: import qayta yuklanganda KUTILGAN holat.
   */
  async create(
    {
      user,
      role,
      amount,
      group = null,
      branchId = null,
      joinedAt = null,
      note = '',
    }: {
      user: string;
      role: string;
      amount: number;
      group?: string | null;
      branchId?: string | null;
      joinedAt?: Date | string | null;
      note?: string;
    },
    { currentUser = null, importJob = null }: { currentUser?: any; importJob?: any } = {},
  ): Promise<{ status: 'created' | 'duplicate'; opening: any }> {
    const amt = Number(amount);
    if (!Number.isInteger(amt) || amt === 0) {
      throw new ApiError(
        400,
        "Boshlang'ich summa nolga teng bo'lmagan butun son bo'lishi kerak",
      );
    }
    if (Math.abs(amt) > OPENING_MAX_AMOUNT) {
      throw new ApiError(
        400,
        `Boshlang'ich summa ${OPENING_MAX_AMOUNT.toLocaleString('ru-RU')} so'mdan oshmasligi kerak`,
      );
    }

    const userId = String(user);
    const groupId = group ? String(group) : null;
    const kind = this.resolveKind(role, amt);

    /**
     * ⚠ O'QUVCHI QARZI GURUHSIZ: yozuv YARATILADI, lekin
     * MATERIALIZATSIYA KUTIB TURADI. `StudentPayment` guruhsiz mavjud
     * bo'lolmaydi, o'quvchi esa guruhga qo'shilishidan OLDIN yaratiladi —
     * va uning eski qarzi aynan shu daqiqada ma'lum bo'ladi.
     *
     * Xato QAYTARILMAYDI: qarz ledgerda darhol ko'rinadi (ledger
     * `OpeningBalance` yozuvining O'ZIDAN o'qiydi), guruhga qo'shilganda
     * esa qator avtomatik yoziladi.
     */
    const awaitingGroup = kind === 'student_debt' && !groupId;

    // DAVR. O'quvchida — eng eski oydan oldingi oy. Boshqalarda — o'tgan
    // oy: xodimda ko'chirish zanjiri aynan o'tgan oydan boshlanadi.
    const today = this.periodOfDate(localTodayMidnight());
    const period =
      role === ROLES.STUDENT
        ? await this.resolveOpeningPeriod({ student: userId, group: groupId, joinedAt })
        : this.prevPeriod(today.year, today.month);

    // ── 1-QADAM: LANGAR ──
    let opening: any;
    try {
      opening = await this.prisma.openingBalance.create({
        data: {
          userId,
          role,
          amount: amt,
          branchId,
          groupId,
          year: period.year,
          month: period.month,
          kind,
          // ⚠ OCHIQ yoziladi: ustun standarti `flow` va unga tayanish
          // o'qituvchi/xodim qoldig'ining ISHORASINI TESKARI o'girib
          // yuborardi.
          signConvention: 'party',
          pendingReason: awaitingGroup
            ? OPENING_PENDING.AWAITING_GROUP
            : OPENING_PENDING.NONE,
          note,
          importJobId: importJob ? String(importJob) : null,
          createdById: this.actorId(currentUser),
        } as any,
      });
    } catch (err: any) {
      if (err?.code === 'P2002') {
        const existing = await this.prisma.openingBalance.findUnique({
          where: { userId },
        });
        return {
          status: 'duplicate',
          opening: existing ? withLegacyId(existing) : null,
        };
      }
      throw err;
    }

    // ── 2-QADAM: MATERIALIZATSIYA ──
    if (awaitingGroup) return { status: 'created', opening: withLegacyId(opening) };

    try {
      const refs = await this.materializer(kind)(opening, { currentUser });
      const saved = await this.prisma.openingBalance.update({
        where: { id: opening.id },
        data: {
          materializedRefs: refs,
          materializedAt: new Date(),
          materializeError: '',
        } as any,
      });
      return { status: 'created', opening: withLegacyId(saved) };
    } catch (err: any) {
      // ⚠ LANGAR QOLADI (qayta import pulni ikki marta yozmasin), lekin
      // xato yozib qo'yiladi va `repairPending()` bilan tuzatiladi.
      await this.prisma.openingBalance
        .update({
          where: { id: opening.id },
          data: { materializeError: String(err?.message || err).slice(0, 500) } as any,
        })
        .catch(() => null);
      this.logger.error(
        `Boshlang'ich qoldiqni materializatsiya qilib bo'lmadi ` +
          `(user=${userId}, kind=${kind}): ${err?.message}`,
      );
      throw err;
    }
  }

  /**
   * YARIM QOLGANLARNI TUZATISH.
   *
   * ⚠ BU FUNKSIYA PUL YOZADI. Faqat OCHIQ (owner) chaqiruv bilan
   * ishlaydi — avtomatik job'ga ULANMAGAN, chunki takroriy avtomatik
   * urinish doimiy yiqilayotgan yozuvda log'ni to'ldirardi va, eng
   * yomoni, YARIM TUZATILGAN holatni ko'zdan yashirardi.
   */
  async repairPending({
    limit = 200,
    currentUser = null,
  }: { limit?: number; currentUser?: any } = {}) {
    // `pendingReason` "none" bo'lganlar — ya'ni HAQIQATAN yiqilganlar.
    // Guruh kutayotgan o'quvchilar bu yerga TUSHMAYDI.
    const pending = await this.prisma.openingBalance.findMany({
      where: { materializedAt: null, pendingReason: OPENING_PENDING.NONE } as any,
      take: limit,
      orderBy: { createdAt: 'asc' },
    });

    let repaired = 0;
    const failed: { user: string; message: string }[] = [];

    for (const ob of pending as any[]) {
      try {
         
        const refs = await this.materializer(ob.kind)(ob, { currentUser });
         
        await this.prisma.openingBalance.update({
          where: { id: ob.id },
          data: {
            materializedRefs: refs,
            materializedAt: new Date(),
            materializeError: '',
          } as any,
        });
        repaired += 1;
      } catch (err: any) {
        failed.push({ user: String(ob.userId), message: err?.message || 'xato' });
      }
    }

    return { total: pending.length, repaired, failed };
  }

  /**
   * GURUH KUTAYOTGAN BOSHLANG'ICH QARZNI YOZIB QO'YISH.
   *
   * O'quvchi BIRINCHI guruhga qo'shilganda chaqiriladi.
   *
   * IDEMPOTENT: faqat `materializedAt: null` VA
   * `pendingReason: "awaiting_group"` olinadi — muvaffaqiyatdan keyin
   * ikkala shart ham buziladi, ya'ni ikkinchi guruhga qo'shilish yana bir
   * qarz qatori YARATMAYDI.
   *
   * BEST-EFFORT: bu yerdagi xato guruhga qo'shishni BEKOR QILMAYDI.
   */
  async materializePendingForStudent(studentId: string, groupId: string) {
    if (!studentId || !groupId) return null;

    const ob: any = await this.prisma.openingBalance.findFirst({
      where: {
        userId: String(studentId),
        kind: 'student_debt',
        materializedAt: null,
        pendingReason: OPENING_PENDING.AWAITING_GROUP,
      } as any,
    });
    if (!ob) return null;

    // ⚠ DAVR QAYTA HISOBLANMAYDI — va SHART EMAS. Yaratilishda davr
    // `enrolledAt` dan bir oy OLDIN qo'yilgan, a'zolik esa ro'yxatga
    // olingan sanadan oldin boshlana olmaydi. Demak guruhning eng eski
    // oylik plani HAR DOIM shu davrdan keyin turadi.
    const withGroup = {
      ...ob,
      groupId: String(groupId),
      branchId:
        ob.branchId || (await this.branchAccess.resolveBranchFromGroup(groupId)),
    };

    try {
      const refs = await this.materializeStudentDebt(withGroup);
      const saved = await this.prisma.openingBalance.update({
        where: { id: ob.id },
        data: {
          groupId: withGroup.groupId,
          branchId: withGroup.branchId,
          materializedRefs: refs,
          materializedAt: new Date(),
          materializeError: '',
          pendingReason: OPENING_PENDING.NONE,
        } as any,
      });
      return withLegacyId(saved);
    } catch (err: any) {
      // ⚠ Kutish holatidan CHIQARILADI: sabab endi "guruh yo'q" emas,
      // HAQIQIY xato. Shu bilan yozuv `repairPending()` ko'rish maydoniga
      // o'tadi.
      await this.prisma.openingBalance
        .update({
          where: { id: ob.id },
          data: {
            groupId: withGroup.groupId,
            branchId: withGroup.branchId,
            pendingReason: OPENING_PENDING.NONE,
            materializeError: String(err?.message || err).slice(0, 500),
          } as any,
        })
        .catch(() => null);
      this.logger.error(
        `Guruhga qo'shilgandan keyin boshlang'ich qarzni yozib bo'lmadi ` +
          `(student=${studentId}, group=${groupId}): ${err?.message}`,
      );
      return null;
    }
  }

  /** Bitta odamning boshlang'ich qoldig'i (profil kartochkasi uchun). */
  async getForUser(userId: string) {
    const row = await this.prisma.openingBalance.findUnique({
      where: { userId: String(userId) },
    });
    return row ? withLegacyId(row) : null;
  }

  /**
   * Ro'yxat — owner nazorati uchun (yarim qolganlar birinchi).
   *
   * ⚠ FILIAL KO'LAMI: bu marshrut owner-only EMAS
   * (`finance.opening_balance`), ya'ni filial direktori ham kiradi —
   * filtrsiz u butun markazning qarz/avans summalarini ko'rardi.
   */
  async list({
    page = 1,
    limit = 50,
    pendingOnly = false,
  }: { page?: number; limit?: number; pendingOnly?: boolean } = {}) {
    const where: any = {
      ...branchFilter(),
      ...(pendingOnly ? { materializedAt: null } : {}),
    };
    const skip = (Math.max(1, page) - 1) * limit;
    const [rows, total] = await Promise.all([
      this.prisma.openingBalance.findMany({
        where,
        orderBy: [{ materializedAt: 'asc' }, { createdAt: 'desc' }],
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              username: true,
              role: true,
            },
          },
          group: { select: { id: true, name: true } },
        },
      }),
      this.prisma.openingBalance.count({ where }),
    ]);
    return { rows: withLegacyIds(rows), total, page, limit };
  }

  /** Import ko'rib chiqishi uchun umumiy yig'indi (avans / qarz alohida). */
  summarize(rows: any[]) {
    let credit = 0;
    let debt = 0;
    for (const r of rows) {
      const a = Number(r?.openingAmount) || 0;
      if (a > 0) credit += a;
      else debt += Math.abs(a);
    }
    return { credit, debt };
  }
}
