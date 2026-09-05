import { Inject, Injectable, Logger } from '@nestjs/common';
import { ModuleRef } from '@nestjs/core';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { ROLES } from '../../common/constants/permissions.js';
import type { FreezeWindow } from '../../common/utils/proration.js';
import { toUtcMidnight, localTodayMidnight } from '../../common/utils/date.js';
import { withLegacyId, withLegacyIds } from '../../common/utils/serialize.js';
import { assertTargetInScope } from '../../common/rbac/branch-access.service.js';
import { CorrelationCacheService } from '../../common/helpers/correlation-cache.service.js';
import { StudentPaymentService } from '../finance/index.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O'QUVCHI MUZLATISHI — ⚠ QISMAN KO'CHIRILGAN.
 *
 * ── TO'LIQ (3/3 marshrut) ──
 * Ilgari bu yerda faqat `users` ro'yxatiga kerak bo'lgan ikki O'QISH
 * metodi bor edi; yozuv amallari (`freeze` / `unfreeze`) to'lov
 * proratsiyasiga tegadi va `finance` bilan BIRGA ko'chirilishi kerak
 * edi — u ko'chgach bu modul ham yopildi.
 *
 * ⚠ `StudentPaymentService` `ModuleRef` orqali KECH izlanadi:
 * `FinanceModule` O'ZI `StudentFreezeModule` ni import qiladi
 * (muzlatilgan kunda o'quvchi TO'LAMAYDI), ya'ni teskari yo'nalishda
 * ochiq import modul AYLANASI bo'lardi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

export interface ActiveFreeze {
  studentId: string;
  startDate: Date;
  reason: string | null;
}

@Injectable()
export class StudentFreezeService {
  private readonly logger = new Logger('StudentFreezeService');

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly moduleRef: ModuleRef,
    private readonly correlationCache: CorrelationCacheService,
  ) {}

  /** ⚠ Kech izlash — modul aylanasi (izoh fayl boshida). */
  private paymentsRef?: StudentPaymentService;

  private get payments(): StudentPaymentService {
    this.paymentsRef ??= this.moduleRef.get(StudentPaymentService, { strict: false });
    return this.paymentsRef;
  }

  /** HOZIR muzlatilgan barcha o'quvchilarning id'lari (ro'yxat filtri uchun). */
  async getActiveFrozenStudentIds(): Promise<string[]> {
    const rows = await this.prisma.studentFreeze.findMany({
      where: { endDate: null, isDeleted: false },
      select: { studentId: true },
      distinct: ['studentId'],
    });
    return rows.map((r) => r.studentId);
  }

  /**
   * Berilgan o'quvchilardan qaysilari HOZIR muzlatilgan.
   * `Map(studentId → { startDate, reason })`.
   */
  async getActiveFreezeMap(studentIds: string[]): Promise<Map<string, ActiveFreeze>> {
    if (!studentIds || studentIds.length === 0) return new Map();
    const rows = await this.prisma.studentFreeze.findMany({
      where: {
        studentId: { in: studentIds.map(String) },
        endDate: null,
        isDeleted: false,
      },
      select: { studentId: true, startDate: true, reason: true },
    });
    const map = new Map<string, ActiveFreeze>();
    for (const r of rows) map.set(String(r.studentId), r as ActiveFreeze);
    return map;
  }

  // ═══════════════════════════════════════════════════════════════════
  // DAVOMAT INTEGRATSIYASI — `helpers/studentFreeze.helper.js` dan.
  //
  // ⚠ FAQAT DAVOMATGA TEGISHLI IKKI FUNKSIYA KO'CHIRILDI.
  // `loadFreezeWindows` / `loadFreezeWindowsByStudent` / `isFrozenOn`
  // TO'LOV proratsiyasi uchun va ular `finance` moduli bilan BIRGA
  // ko'chadi — hozir ko'chirilsa ishlatilmaydigan nusxa qolib, vaqt
  // o'tib asl nusxadan ajralib ketardi.
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Muzlatish oynasini davomat "exemption" shakliga aylantiradi.
   *
   * ⚠⚠ CHEGARA SEMANTIKASI BIR KUNGA FARQ QILADI ⚠⚠
   *   muzlatish : `[startDate, endDate)` — endDate EXCLUSIVE
   *               (chiqarish kuni ARTIQ muzlatilmagan)
   *   exemption : `[startDate, endDate]` — endDate INCLUSIVE
   *
   * Shu sababli oxirgi muzlatilgan kun = `endDate - 1 kun`. Ayirilmasa
   * o'quvchi muzlatishdan CHIQQAN kuni ham "exempt" bo'lib qolardi va
   * o'sha kun davomat foizidan tushib ketardi.
   *
   * `daysOfWeek: []` = HAMMA kun (to'liq muzlatish).
   */
  freezeToExemption(f: { studentId: string; startDate: Date; endDate: Date | null }) {
    const DAY_MS = 24 * 60 * 60 * 1000;
    return {
      // Prisma ustuni `studentId`; chaqiruvchilar (attendance) eski
      // `student` nomini o'qiydi — IKKALASI ham beriladi.
      studentId: f.studentId,
      student: f.studentId,
      isActive: true,
      startDate: f.startDate,
      endDate: f.endDate
        ? new Date(toUtcMidnight(f.endDate).getTime() - DAY_MS)
        : null,
      daysOfWeek: [] as string[],
      __source: 'freeze',
    };
  }

  /**
   * HAQIQIY exemption'lar + muzlatishdan olingan PSEUDO-exemption'lar.
   *
   * ⚠ BO'SH RO'YXAT = "HECH KIM" (fail-closed), `undefined` EMAS.
   * `{ studentId: { in: [] } }` hech nima qaytaradi; filtrni tushirib
   * qoldirish esa BUTUN jadvalni qaytarardi — ya'ni bir o'quvchining
   * muzlatishi hammaga qo'llanardi.
   */
  async loadExemptionsWithFreezes(studentIds: string | string[]) {
    const ids = (Array.isArray(studentIds) ? studentIds : [studentIds])
      .filter(Boolean)
      .map(String);
    const where =
      ids.length === 1 ? { studentId: ids[0] } : { studentId: { in: ids } };

    const [exemptions, freezes] = await Promise.all([
      this.prisma.attendanceExemption.findMany({
        where: { ...where, isActive: true },
      }),
      this.prisma.studentFreeze.findMany({ where: { ...where, isDeleted: false } }),
    ]);

    // Haqiqiy exemption'da ham `student` taxallusi kerak — chaqiruvchi
    // `ex.student` bo'yicha guruhlaydi.
    const normalized = exemptions.map((e) => ({ ...e, student: e.studentId }));
    return [
      ...normalized,
      ...freezes.map((f) => this.freezeToExemption(f)),
    ] as Record<string, any>[];
  }

  // ═══════════════════════════════════════════════════════════════════
  // TO'LOV PRORATSIYASI — `helpers/studentFreeze.helper.js` dan.
  //
  // ⚠ MUZLATILGAN KUN UCHUN O'QUVCHI TO'LAMAYDI. Oyna chegarasi
  // `[start, end)` — chiqish kuni ARTIQ muzlatilmagan. Bu semantika
  // `freezeToExemption` dagidan FARQ QILADI (u davomat uchun bir kun
  // ayiradi) va ikkalasi ATAYLAB alohida.
  // ═══════════════════════════════════════════════════════════════════

  /**
   * BITTA o'quvchining muzlatish oynalari — to'lov hisobi uchun.
   *
   * ⚠ Oynalar BITTA ro'yxatga qo'shiladi, ya'ni bu funksiya faqat BIR
   * o'quvchi uchun. Ko'p o'quvchida `loadFreezeWindowsByStudent`
   * ishlatiladi — aks holda bir o'quvchining muzlatishi boshqasiga ham
   * qo'llanardi.
   */
  async loadFreezeWindows(studentId: string): Promise<FreezeWindow[]> {
    const rows = await this.prisma.studentFreeze.findMany({
      where: { studentId: String(studentId), isDeleted: false },
      select: { startDate: true, endDate: true },
    });
    return rows.map((r) => ({
      start: toUtcMidnight(r.startDate).getTime(),
      end: r.endDate ? toUtcMidnight(r.endDate).getTime() : Infinity,
    }));
  }

  /**
   * Muzlatish oynalari O'QUVCHI BO'YICHA: `Map<studentId, windows[]>`.
   *
   * ⚠ BITTADA BITTA SO'ROV: har o'quvchi uchun alohida chaqirilsa 500
   * o'quvchida 500 ta so'rov ketardi (kunlik joblar).
   */
  async loadFreezeWindowsByStudent(
    studentIds: string | string[],
  ): Promise<Map<string, FreezeWindow[]>> {
    const ids = (Array.isArray(studentIds) ? studentIds : [studentIds]).map(String);
    const map = new Map<string, FreezeWindow[]>();
    if (!ids.length) return map;

    const rows = await this.prisma.studentFreeze.findMany({
      where: { studentId: { in: ids }, isDeleted: false },
      select: { studentId: true, startDate: true, endDate: true },
    });

    for (const r of rows) {
      const key = String(r.studentId);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push({
        start: toUtcMidnight(r.startDate).getTime(),
        end: r.endDate ? toUtcMidnight(r.endDate).getTime() : Infinity,
      });
    }
    return map;
  }

  // ══════════════════════════════════════════════════════════════════
  // MARSHRUTLAR ORTIDAGI MANTIQ (`/api/student-freezes`)
  // ══════════════════════════════════════════════════════════════════

  /**
   * ═══════════════════════════════════════════════════════════════════
   * FILIAL HIMOYASI.
   *
   * Ilgari bu modul butunlay `requireRole(OWNER)` bilan qulflangan edi.
   * Endi muzlatish `students.freeze` ruxsatiga ochilgan (filial
   * direktori uchun KUNDALIK amal), shuning uchun chegara SHU YERDA.
   *
   * `scope` berilmasa (job / ichki chaqiruv) tekshirilmaydi.
   *
   * ⚠ `branchAssignments` ATAYLAB YUKLANADI: `assertTargetInScope`
   * o'quvchining filiallarini `homeBranchId` VA `branchAssignments[]`
   * dan yig'adi. Prisma relation'ni so'ralmasa qaytarmaydi — ya'ni
   * ro'yxat bo'sh bo'lib qolardi va qo'shimcha filialga biriktirilgan
   * o'quvchi "kirish huquqingiz yo'q" xatosini olardi (JIMGINA
   * fail-closed regressiya).
   * ═══════════════════════════════════════════════════════════════════
   */
  private async ensureStudent(
    studentId: string,
    scope: { allowedBranchIds?: string[]; canSeeAllBranches?: boolean } | null = null,
  ) {
    const u = await this.prisma.user.findUnique({
      where: { id: String(studentId) },
      select: {
        id: true,
        role: true,
        isActive: true,
        enrolledAt: true,
        homeBranchId: true,
        branchAssignments: { select: { branchId: true } },
      },
    });
    if (!u || u.role !== ROLES.STUDENT) {
      throw new ApiError(404, "O'quvchi topilmadi");
    }
    if (scope) {
      assertTargetInScope(scope.allowedBranchIds, scope.canSeeAllBranches, u as never);
    }
    return u;
  }

  /** Ochiq (hozir amaldagi) muzlatish yoki `null`. */
  private findActiveFreeze(studentId: string) {
    return this.prisma.studentFreeze.findFirst({
      where: { studentId: String(studentId), endDate: null, isDeleted: false },
    });
  }

  /**
   * Muzlatish/chiqarishdan keyin: to'lovlar QAYTA HISOBLANADI
   * (muzlatilgan darslar accrual qilinmaydi) va davomat foizi keshi
   * tozalanadi. BEST-EFFORT — Express'da ham `try/catch`.
   */
  private async afterFreezeChange(studentId: string): Promise<void> {
    try {
      await this.payments.recalcForStudent(studentId);
    } catch (err) {
      this.logger.warn(
        `Muzlatishda o'quvchi to'lovlari qayta hisoblanmadi (${studentId}): ` +
          `${(err as Error).message}`,
      );
    }
    this.correlationCache.invalidate();
  }

  /** O'quvchini MUZLATISH. `startDate` berilmasa — bugun. */
  async freeze(
    studentId: string,
    { startDate, reason, by, scope }: {
      startDate?: Date | string | null;
      reason?: string;
      by?: any;
      scope?: { allowedBranchIds?: string[]; canSeeAllBranches?: boolean } | null;
    } = {},
  ) {
    const student = await this.ensureStudent(studentId, scope ?? null);
    if (!student.isActive) {
      throw new ApiError(
        400, "Arxivlangan o'quvchini muzlatib bo'lmaydi. Avval uni tiklang.",
      );
    }

    const existing = await this.findActiveFreeze(studentId);
    if (existing) throw new ApiError(400, "O'quvchi allaqachon muzlatilgan");

    const start = startDate ? toUtcMidnight(startDate) : localTodayMidnight();
    if (start.getTime() > localTodayMidnight().getTime()) {
      throw new ApiError(400, "Muzlatish sanasi kelajakda bo'lishi mumkin emas");
    }

    // ⚠ Muzlatish sanasi o'quvchi GURUHGA QO'SHILGAN kundan oldin
    // bo'lmasin. Bir nechta faol guruh bo'lsa — ENG ERTA qo'shilgan
    // sana; faol a'zolik bo'lmasa — ro'yxatga olingan sana.
    const firstJoin = await this.prisma.groupMembership.findFirst({
      where: { studentId: student.id, leftAt: null, isDeleted: false },
      select: { joinedAt: true },
      orderBy: { joinedAt: 'asc' },
    });
    const joinBound = firstJoin
      ? toUtcMidnight(firstJoin.joinedAt)
      : student.enrolledAt
        ? toUtcMidnight(student.enrolledAt)
        : null;
    if (joinBound && start.getTime() < joinBound.getTime()) {
      throw new ApiError(
        400,
        "Muzlatish sanasi o'quvchi guruhga qo'shilgan kundan oldin bo'lishi mumkin emas",
      );
    }

    const created = await this.prisma.studentFreeze.create({
      data: {
        studentId: student.id,
        startDate: start,
        endDate: null,
        reason: reason || '',
        createdById: by?.id || by?._id || null,
      },
    });

    await this.afterFreezeChange(student.id);
    return withLegacyId(created);
  }

  /**
   * MUZLATISHDAN CHIQARISH. `endDate` berilmasa — bugun.
   *
   * ⚠ `endDate` EXCLUSIVE: shu kundan boshlab o'quvchi yana FAOL.
   */
  async unfreeze(
    studentId: string,
    { endDate, by, scope }: {
      endDate?: Date | string | null;
      by?: any;
      scope?: { allowedBranchIds?: string[]; canSeeAllBranches?: boolean } | null;
    } = {},
  ) {
    const student = await this.ensureStudent(studentId, scope ?? null);

    const active = await this.findActiveFreeze(student.id);
    if (!active) throw new ApiError(400, "O'quvchi muzlatilmagan");

    const end = endDate ? toUtcMidnight(endDate) : localTodayMidnight();
    if (end.getTime() > localTodayMidnight().getTime()) {
      throw new ApiError(400, "Chiqarish sanasi kelajakda bo'lishi mumkin emas");
    }
    if (end.getTime() < toUtcMidnight(active.startDate).getTime()) {
      throw new ApiError(
        400, "Chiqarish sanasi muzlatish sanasidan oldin bo'lishi mumkin emas",
      );
    }

    const updated = await this.prisma.studentFreeze.update({
      where: { id: active.id },
      data: { endDate: end, endedById: by?.id || by?._id || null },
    });

    await this.afterFreezeChange(student.id);
    return withLegacyId(updated);
  }

  /** Bitta o'quvchining muzlatish TARIXI (yangi → eski). */
  async listForStudent(
    studentId: string,
    scope: { allowedBranchIds?: string[]; canSeeAllBranches?: boolean } | null = null,
  ) {
    const student = await this.ensureStudent(studentId, scope);
    const items = await this.prisma.studentFreeze.findMany({
      where: { studentId: student.id, isDeleted: false },
      orderBy: { startDate: 'desc' },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
        endedBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    return { items: withLegacyIds(items) };
  }

  /** Bitta o'quvchining HOZIRGI (ochiq) muzlatishi yoki `null`. */
  async getActiveFreeze(studentId: string) {
    const row = await this.prisma.studentFreeze.findFirst({
      where: { studentId: String(studentId), endDate: null, isDeleted: false },
      select: {
        id: true, studentId: true, startDate: true, reason: true, createdAt: true,
      },
    });
    return row ? withLegacyId(row) : null;
  }
}

/**
 * Berilgan sana biror muzlatish oynasiga tushadimi (`start <= d < end`).
 *
 * ⚠ SOF FUNKSIYA — servisdan TASHQARIDA: u bazaga tegmaydi va issiq
 * sikllarda (har bir dars sanasi uchun) chaqiriladi.
 */
export const isFrozenOn = (windows: FreezeWindow[], dateMs: number): boolean =>
  windows.some((w) => dateMs >= w.start && dateMs < w.end);
