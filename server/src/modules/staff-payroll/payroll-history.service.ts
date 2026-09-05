import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { withLegacyId } from '../../common/utils/serialize.js';
import { ROLES } from '../../common/constants/permissions.js';
import { parseLocalDay, localTodayMidnight } from '../../common/utils/date.js';
import { BranchAccessService } from '../../common/rbac/branch-access.service.js';
import { StaffPayrollService } from './staff-payroll.service.js';
import { PayrollAuditService, PAYROLL_AUDIT_ACTIONS } from './payroll-audit.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * MAOSH TARIXINI BOSHQARISH — HR va MOLIYA o'rtasidagi chegara.
 *
 * ⚠ ASOSIY QOIDA: ishga olingan sana (`hiredAt`) — HR ma'lumoti. Uni
 * o'zgartirish maosh YARATMAYDI, qayta hisoblamaydi va tarixni
 * o'zgartirmaydi. Maosh yaratish HAR DOIM alohida, ATAYLAB boshlangan
 * amal.
 *
 * NEGA: markaz boshqa CRM'dan ko'chib kelganda HR sanasi 2 yil orqaga
 * to'g'rilanadi. Bog'langan tizimda bu bir zumda 16 oylik maosh
 * yaratardi yoki allaqachon to'langan oylarni qayta yozardi — egasi
 * buni sezmasdi ham.
 *
 * Bu modul o'qituvchi maoshini HISOBLAMAYDI — u faqat mavjud servisni
 * chegaralangan oy oralig'ida chaqiradi va qulflangan qatorlarni
 * chetlab o'tadi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

interface Actor { id?: string | null; _id?: string | null; firstName?: string; lastName?: string }
const actorId = (u?: Actor | null): string | null => u?.id || u?._id || null;

/** `[from, to]` oralig'idagi oylar ro'yxati (kelajakka o'tmaydi). */
const monthsBetween = (from: Date, to: Date): { year: number; month: number }[] => {
  const months: { year: number; month: number }[] = [];
  const today = localTodayMidnight() as Date;
  const last = to > today ? today : to;

  let y = from.getUTCFullYear();
  let m = from.getUTCMonth() + 1;
  const lastY = last.getUTCFullYear();
  const lastM = last.getUTCMonth() + 1;

  // ⚠ Xavfsizlik cheklovi: bitta so'rov 36 oydan ko'p yaratmasin.
  while ((y < lastY || (y === lastY && m <= lastM)) && months.length < 36) {
    months.push({ year: y, month: m });
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return months;
};

const monthKey = (y: number, m: number) => y * 100 + m;

/** `getImpact` javobidagi oy yig'masi (ikkala maosh manbasi birlashgan). */
export interface MonthEntry {
  year: number;
  month: number;
  expected: number;
  paid: number;
  locked: boolean;
  sources: string[];
  /** Qulflash tugmasi uchun: qaysi qatorlarni ochish/yopish kerak. */
  rows: { kind: string; id: string; locked: boolean }[];
}

@Injectable()
export class PayrollHistoryService {
  private readonly logger = new Logger('PayrollHistory');

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly payroll: StaffPayrollService,
    private readonly audit: PayrollAuditService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  /**
   * MAOSH TARIXI HOLATI — "`hiredAt` ni o'zgartirsam nima bo'ladi?".
   *
   * Client shu javob asosida tasdiqlash oynasini ko'rsatadi. Tarix
   * bo'sh bo'lsa — oyna umuman ochilmaydi.
   */
  async getImpact(employeeId: string) {
    // ⚠ FILIAL QO'RIQCHISI — `employeeId` MIJOZDAN keladi.
    await this.branchAccess.assertUserInBranchScope(employeeId);
    const user = await this.prisma.user.findUnique({
      where: { id: String(employeeId) },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: true,
        hiredAt: true,
        payrollStartFrom: true,
      },
    });
    if (!user) throw new ApiError(404, 'Xodim topilmadi');

    const [teacherRows, staffRows] = await Promise.all([
      // O'qituvchi maoshi — MAVJUD modul qatorlari (faqat O'QILADI).
      this.prisma.teacherSalary.findMany({
        where: { teacherId: user.id },
        select: {
          id: true, year: true, month: true, kind: true,
          expectedAmount: true, paidAmount: true, status: true, isLocked: true,
        },
      }),
      this.prisma.staffPayroll.findMany({
        where: { employeeId: user.id },
        select: {
          id: true, year: true, month: true,
          finalAmount: true, paidAmount: true, status: true, lifecycle: true,
        },
      }),
    ]);

    // Oylar bo'yicha yig'ma ko'rinish (ikkala manba birlashtiriladi).
    const byMonth = new Map<number, MonthEntry>();
    const put = (row: Record<string, unknown>, kind: string) => {
      const year = row.year as number;
      const month = row.month as number;
      const key = monthKey(year, month);
      if (!byMonth.has(key)) {
        byMonth.set(key, {
          year, month, expected: 0, paid: 0, locked: false,
          sources: [],
          // Qulflash tugmasi uchun: qaysi qatorlarni ochish/yopish kerak.
          rows: [],
        });
      }
      const entry = byMonth.get(key)!;
      entry.expected +=
        ((kind === 'teacher' ? row.expectedAmount : row.finalAmount) as unknown as number) || 0;
      entry.paid += (row.paidAmount as unknown as number) || 0;
      const rowLocked = Boolean(row.isLocked) || row.lifecycle === 'finalized';
      entry.locked = entry.locked || rowLocked;
      entry.rows.push({ kind, id: String(row.id), locked: rowLocked });
      if (!entry.sources.includes(kind)) entry.sources.push(kind);
      return entry;
    };

    for (const r of teacherRows) put(r as never, 'teacher');
    for (const r of staffRows) put(r as never, 'staff');

    const months = [...byMonth.values()].sort(
      (a, b) => monthKey(b.year, b.month) - monthKey(a.year, a.month),
    );

    const lockedCount = months.filter((m) => m.locked).length;
    const paidCount = months.filter((m) => m.paid > 0).length;

    return {
      employee: {
        id: user.id,
        _id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        role: user.role,
        hiredAt: user.hiredAt,
        payrollStartFrom: user.payrollStartFrom,
      },
      hasHistory: months.length > 0,
      monthCount: months.length,
      lockedCount,
      paidCount,
      unlockedCount: months.length - lockedCount,
      firstMonth: months.length ? months[months.length - 1] : null,
      lastMonth: months.length ? months[0] : null,
      months: months.slice(0, 24),
    };
  }

  /**
   * TIZIM QAYSI SANADAN maosh hisoblaydi.
   *
   * "Oldingi maoshlar allaqachon to'langanmi?" → Ha bo'lsa, owner
   * ko'chish sanasini beradi va undan oldingi oylar UMUMAN yaratilmaydi.
   */
  async setPayrollStart(
    employeeId: string,
    payrollStartFrom: string | null | undefined,
    { currentUser, reason = '', confirm = false }: {
      currentUser?: Actor | null; reason?: string; confirm?: boolean;
    } = {},
  ) {
    // ⚠ FILIAL QO'RIQCHISI — `employeeId` MIJOZDAN keladi.
    await this.branchAccess.assertUserInBranchScope(employeeId);
    const user = await this.prisma.user.findUnique({
      where: { id: String(employeeId) },
      select: { id: true, payrollStartFrom: true },
    });
    if (!user) throw new ApiError(404, 'Xodim topilmadi');

    const parsed = payrollStartFrom ? parseLocalDay(payrollStartFrom) : null;
    if (payrollStartFrom && !parsed) {
      throw new ApiError(400, "Sana noto'g'ri");
    }

    const previous = user.payrollStartFrom;
    const changed = String(previous || '') !== String(parsed || '');
    if (!changed) return { id: user.id, _id: user.id, payrollStartFrom: previous };

    // ─── HIMOYA: birinchi maosh yaratilgandan keyin ───
    //
    // Aktivatsiya sanasi maosh YARATISH chegarasini belgilaydi. Tarix
    // paydo bo'lgach uni beparvo o'zgartirish "qaysi oylar bor edi"
    // savolini chalkashtiradi, shuning uchun ATAYLAB tasdiqlash va
    // SABAB talab qilinadi.
    const hasPayroll = await this.prisma.staffPayroll.findFirst({
      where: { employeeId: user.id },
      select: { id: true },
    });
    if (hasPayroll) {
      if (!confirm) {
        throw new ApiError(
          400,
          "Bu xodimda maosh tarixi bor. Aktivatsiya sanasini o'zgartirish tasdiqlanishi kerak.",
        );
      }
      if (!String(reason || '').trim()) {
        throw new ApiError(400, "O'zgartirish sababini ko'rsating");
      }
    }

    const saved = await this.prisma.user.update({
      where: { id: user.id },
      data: { payrollStartFrom: parsed },
      select: { id: true, payrollStartFrom: true },
    });

    await this.audit.record({
      employee: user.id,
      action: PAYROLL_AUDIT_ACTIONS.ACTIVATION_CHANGED,
      targetType: 'user',
      targetId: user.id,
      oldValue: { payrollStartFrom: previous },
      newValue: { payrollStartFrom: parsed },
      reason,
      actor: currentUser,
    });

    return { id: saved.id, _id: saved.id, payrollStartFrom: saved.payrollStartFrom };
  }

  /**
   * QURUQ YUGURISH (dry run) — DB'ga HECH NARSA yozilmaydi.
   *
   * Egasi "Hisoblash" tugmasini bosishdan OLDIN nima bo'lishini
   * ko'radi: qaysi oylar yaratiladi, qaysilari chetlab o'tiladi va nima
   * uchun. Bu ERP odati: moliyaviy amal ko'r-ko'rona bajarilmaydi.
   */
  async previewGenerate({ employeeId, from, to }: {
    employeeId: string; from: string; to: string;
  }) {
    // ⚠ FILIAL QO'RIQCHISI — `employeeId` MIJOZDAN keladi.
    await this.branchAccess.assertUserInBranchScope(employeeId);
    const user = await this.prisma.user.findUnique({
      where: { id: String(employeeId) },
      select: {
        id: true, firstName: true, lastName: true,
        role: true, payrollStartFrom: true,
      },
    });
    if (!user) throw new ApiError(404, 'Xodim topilmadi');

    const fromDate = parseLocalDay(from);
    const toDate = parseLocalDay(to);
    if (!fromDate || !toDate) throw new ApiError(400, "Davr sanalari noto'g'ri");

    const boundary = user.payrollStartFrom;
    const months = monthsBetween(fromDate, toDate);

    const existing = await this.prisma.staffPayroll.findMany({
      where: { employeeId: user.id },
      select: {
        year: true, month: true, lifecycle: true,
        paidAmount: true, finalAmount: true, source: true,
      },
    });
    const existingMap = new Map(
      existing.map((r) => [monthKey(r.year, r.month), r]),
    );

    const hasContract = await this.prisma.staffCompensation.findFirst({
      where: { employeeId: user.id, isDeleted: false },
      select: { id: true },
    });

    const rows: Record<string, unknown>[] = [];
    for (const { year, month } of months) {
      const monthEnd = new Date(Date.UTC(year, month, 1));
      const row = existingMap.get(monthKey(year, month));

      if (boundary && monthEnd <= boundary) {
        rows.push({ year, month, action: 'skip', why: 'Aktivatsiya sanasidan oldin' });
        continue;
      }
      if (row?.lifecycle === 'finalized') {
        rows.push({
          year, month, action: 'locked', why: 'Oy yopilgan', amount: row.finalAmount });
        continue;
      }
      if (((row?.paidAmount as unknown as number) || 0) > 0) {
        rows.push({
          year, month, action: 'locked', why: "To'lov qilingan",
          amount: row!.finalAmount });
        continue;
      }
      if (row) {
        rows.push({
          year, month, action: 'exists', why: 'Qator mavjud', amount: row.finalAmount });
        continue;
      }

      // Yozmasdan hisoblab ko'ramiz (`save: false`).
       
      const projected = (await this.payroll.computePayroll(user.id, year, month, {
        save: false,
      })) as { fixedAmount?: number } | null;
      rows.push({
        year,
        month,
        action: 'create',
        why: 'Yangi qator yaratiladi',
        amount: projected?.fixedAmount || 0,
      });
    }

    const warnings: string[] = [];
    if (!hasContract) warnings.push("Xodimda maosh shartnomasi yo'q");
    if (boundary && rows.some((r) => r.action === 'skip')) {
      warnings.push("Aktivatsiya sanasidan oldingi oylar yaratilmaydi");
    }
    if (rows.some((r) => r.action === 'locked')) {
      warnings.push("Qulflangan/to'langan oylar o'zgartirilmaydi");
    }

    return {
      employee: {
        id: user.id,
        _id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        payrollStartFrom: boundary || null,
      },
      rows,
      summary: {
        willCreate: rows.filter((r) => r.action === 'create').length,
        exists: rows.filter((r) => r.action === 'exists').length,
        locked: rows.filter((r) => r.action === 'locked').length,
        skipped: rows.filter((r) => r.action === 'skip').length,
      },
      warnings,
    };
  }

  /**
   * YETISHMAYDIGAN OYLARNI YARATISH — faqat ko'rsatilgan oraliqda.
   *
   * ⚠ MAVJUD qatorlar TEGILMAYDI: bu amal faqat qator YO'Q oylarni
   * to'ldiradi. Shuning uchun uni ikki marta bosish ham xavfsiz.
   */
  async generateRange(
    { employeeId, from, to }: { employeeId: string; from: string; to: string },
    currentUser: Actor | null,
  ) {
    // ⚠ FILIAL QO'RIQCHISI — `employeeId` MIJOZDAN keladi.
    await this.branchAccess.assertUserInBranchScope(employeeId);
    const user = await this.prisma.user.findUnique({
      where: { id: String(employeeId) },
      select: { id: true, role: true, payrollStartFrom: true },
    });
    if (!user) throw new ApiError(404, 'Xodim topilmadi');
    if (user.role === ROLES.STUDENT) {
      throw new ApiError(400, "O'quvchiga maosh hisoblanmaydi");
    }

    const fromDate = parseLocalDay(from);
    const toDate = parseLocalDay(to);
    if (!fromDate || !toDate) throw new ApiError(400, "Davr sanalari noto'g'ri");
    if (fromDate > toDate) throw new ApiError(400, 'Boshlanish sanasi tugashdan keyin');

    // MOLIYAVIY CHEGARA: ko'chishdan oldingi oylar yaratilmaydi.
    const boundary = user.payrollStartFrom;
    const effectiveFrom = boundary && boundary > fromDate ? boundary : fromDate;

    const months = monthsBetween(effectiveFrom, toDate);
    if (!months.length) {
      return { created: 0, skipped: 0, months: [], boundarySkipped: Boolean(boundary) };
    }

    // Shartnomasi yo'q oylarda hisoblash ma'nosiz — avval buni aytamiz.
    const hasContract = await this.prisma.staffCompensation.findFirst({
      where: { employeeId: user.id, isDeleted: false },
      select: { id: true },
    });
    if (!hasContract) {
      throw new ApiError(
        400,
        "Xodimda maosh shartnomasi yo'q - avval shartnoma belgilang",
      );
    }

    let created = 0;
    let skipped = 0;
    const details: { year: number; month: number; status: string }[] = [];

    for (const { year, month } of months) {
      // `(employeeId, year, month)` HAQIQIY unique kalit — `findUnique`.
       
      const existing = await this.prisma.staffPayroll.findUnique({
        where: { employeeId_year_month: { employeeId: user.id, year, month } },
        select: { id: true },
      });

      if (existing) {
        skipped += 1;
        details.push({ year, month, status: 'mavjud' });
        continue;
      }

      try {
         
        await this.payroll.computePayroll(user.id, year, month, {
          source: 'generated',
          actor: currentUser,
          reason: "Yetishmayotgan oy qo'lda yaratildi",
        });
        created += 1;
        details.push({ year, month, status: 'yaratildi' });
      } catch (err) {
        this.logger.warn(
          `Yetishmayotgan maoshni yaratib bo'lmadi (${String(user.id)} ${year}/${month}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        details.push({ year, month, status: 'xato' });
      }
    }

    return {
      created,
      skipped,
      months: details,
      boundarySkipped: Boolean(boundary && boundary > fromDate),
    };
  }

  /**
   * QULFLANMAGAN OYLARNI QAYTA HISOBLASH.
   *
   * ⚠ Qulflangan va yopilgan oylar CHETLAB O'TILADI — ular hisobotga
   * kirgan/topshirilgan davrlar.
   */
  async recalcUnlocked(
    { employeeId, from, to }: { employeeId: string; from?: string; to?: string },
    currentUser: Actor | null,
  ) {
    // ⚠ FILIAL QO'RIQCHISI — `employeeId` MIJOZDAN keladi.
    await this.branchAccess.assertUserInBranchScope(employeeId);
    const user = await this.prisma.user.findUnique({
      where: { id: String(employeeId) },
      select: { id: true },
    });
    if (!user) throw new ApiError(404, 'Xodim topilmadi');

    const where = { employeeId: user.id, lifecycle: { not: 'finalized' } };

    const fromDate = from ? parseLocalDay(from) : null;
    const toDate = to ? parseLocalDay(to) : null;
    const rows = await this.prisma.staffPayroll.findMany({
      where: where as never,
      select: { year: true, month: true },
    });

    const inRange = rows.filter((r) => {
      const rowStart = new Date(Date.UTC(r.year, r.month - 1, 1));
      if (
        fromDate &&
        rowStart <
          new Date(Date.UTC(fromDate.getUTCFullYear(), fromDate.getUTCMonth(), 1))
      ) {
        return false;
      }
      if (
        toDate &&
        rowStart > new Date(Date.UTC(toDate.getUTCFullYear(), toDate.getUTCMonth(), 1))
      ) {
        return false;
      }
      return true;
    });

    let recalculated = 0;
    for (const r of inRange) {
      try {
        // ⚠ `force` BERILMAYDI: yopilgan oy o'z-o'zidan ochilmasligi kerak.
         
        await this.payroll.computePayroll(user.id, r.year, r.month, {
          source: 'manual',
          actor: currentUser,
          reason: "Qulflanmagan oylar qayta hisoblandi",
        });
        recalculated += 1;
      } catch (err) {
        this.logger.warn(
          `Maoshni qayta hisoblab bo'lmadi (${String(user.id)} ${r.year}/${r.month}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    const lockedSkipped = await this.prisma.staffPayroll.count({
      where: { employeeId: user.id, lifecycle: 'finalized' },
    });

    return { recalculated, lockedSkipped };
  }

  /**
   * QULFLASH / OCHISH — IKKALA manba uchun.
   *
   * `kind`: "teacher" (`TeacherSalary`) | "staff" (`StaffPayroll`)
   *
   * ⚠ O'qituvchi qatorining qulfi shu yerdan qo'yiladi, lekin uning
   * HISOB-KITOBI o'zgarmaydi — `TeacherSalaryService` faqat `isLocked`
   * ni o'qib, qayta hisobni o'tkazib yuboradi.
   */
  async setLock(
    { kind, id, locked, reason = '' }: {
      kind: string; id: string; locked: boolean; reason?: string;
    },
    currentUser: Actor | null,
  ): Promise<unknown> {
    const now = new Date();
    const patch = locked
      ? { isLocked: true, lockedAt: now, lockedById: actorId(currentUser) }
      : { isLocked: false, lockedAt: null, lockedById: null };

    if (kind === 'teacher') {
      const before = await this.prisma.teacherSalary.findUnique({
        where: { id: String(id) },
        select: { id: true, teacherId: true, year: true, month: true, isLocked: true },
      });
      if (!before) throw new ApiError(404, 'Maosh qatori topilmadi');
      // ⚠ FILIAL QO'RIQCHISI — `id` params dan keladi.
      await this.branchAccess.assertUserInBranchScope(before.teacherId);
      if (before.isLocked && !locked && !String(reason || '').trim()) {
        throw new ApiError(400, "Qulfni ochish sababini ko'rsating");
      }

      const row = await this.prisma.teacherSalary.update({
        where: { id: before.id },
        data: patch as never,
      });
      await this.audit.record({
        employee: before.teacherId,
        year: before.year,
        month: before.month,
        action: locked
          ? PAYROLL_AUDIT_ACTIONS.LOCKED
          : PAYROLL_AUDIT_ACTIONS.UNLOCKED,
        targetType: 'teacherSalary',
        targetId: before.id,
        oldValue: { isLocked: Boolean(before.isLocked) },
        newValue: { isLocked: locked },
        reason,
        actor: currentUser,
      });
      return withLegacyId(row);
    }

    // ⚠ Xodim maoshida qulf `lifecycle` bilan ifodalanadi — ikkinchi
    // tushuncha kiritilsa ikkalasi bir-biriga ZID bo'lib qolardi.
    return this.payroll.setLifecycle(
      id, locked ? 'finalized' : 'draft', currentUser, { reason });
  }
}
