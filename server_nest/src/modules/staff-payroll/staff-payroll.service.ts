import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { ROLES } from '../../common/constants/permissions.js';
import { RolesHelperService } from '../../common/rbac/roles.helper.js';
import { BranchAccessService } from '../../common/rbac/branch-access.service.js';
import { userBranchCondition } from '../../common/als/branch-context.js';
import { daysInMonth, deriveStatus } from '../../common/utils/proration.js';
import { withLegacyId, withLegacyIds } from '../../common/utils/serialize.js';
import { KpiEngineService, type AppliedRule } from './kpi-engine.service.js';
import { PayrollAuditService, PAYROLL_AUDIT_ACTIONS } from './payroll-audit.service.js';
import { monthRange } from './kpi-triggers.service.js';
// Tranzaksiya klientining yagona ta'rifi `journal.service.ts` da —
// `applyPaidDelta` xom SQL ni AYNI o'sha klientda bajarishi shart
// (B20). Takroriy ta'rif ikki joyda ajralib ketardi.
import type { TxClient } from '../journal/journal.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * XODIMLAR MAOSHI — hisoblash yadrosi.
 *
 * ⚠ O'QITUVCHI MODULIGA UMUMAN TEGMAYDI: bu servis `TeacherSalary`,
 * `TeacherCompensation`, `SalaryTransaction` va `TeacherSalaryService` ni
 * na o'qiydi, na yozadi. Yagona umumiy narsa — `proration` dagi sof
 * matematik yordamchilar (`daysInMonth`, `deriveStatus`), ular hech
 * qanday o'qituvchi/guruh farazini olib yurmaydi.
 *
 * ⚠ ATOMIK TO'LOV: `applyPaidDelta` BITTA XOM `UPDATE`. "O'qi →
 * hisobla → yoz" naqshi YO'Q — u yo'qolgan to'lov demakdir.
 * ═══════════════════════════════════════════════════════════════════════════
 */

interface Actor { id?: string | null; _id?: string | null; firstName?: string; lastName?: string }
const actorId = (u?: Actor | null): string | null => u?.id || u?._id || null;

/** Xodim/filial ma'lumoti ro'yxat va tafsilotda bir xil bo'lsin. */
const EMPLOYEE_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  role: true,
  username: true,
};
const BRANCH_SELECT = { id: true, name: true, code: true };

/**
 * `branch` relation'ini eski `branchId` nomiga qaytaradi.
 *
 * ⚠ Mongoose `.populate("branchId")` maydonning O'ZINI obyektga
 * aylantirardi va client shunga tayanadi. Prisma esa `branchId` ni satr
 * qoldirib, obyektni `branch` deb alohida beradi.
 */
const shapePayroll = (row: Record<string, unknown> | null) => {
  if (!row) return row;
  const out = withLegacyId(row) as Record<string, unknown>;
  if (row.branch !== undefined) {
    out.branchId = row.branch ? withLegacyId(row.branch as Record<string, unknown>) : null;
    delete out.branch;
  }
  return out;
};

interface CompRow {
  id: string;
  salaryType: string;
  baseAmount: unknown;
  branchId: string | null;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

/** Oy ichida amal qilgan shartnoma bo'laklari (ishga kirish/bo'shash proratsiyasi). */
const compensationSegmentsForMonth = (comps: CompRow[], year: number, month: number) => {
  const { start, endExcl } = monthRange(year, month);
  const segments: { comp: CompRow; from: Date; toExcl: Date; days: number }[] = [];

  for (const c of comps) {
    const from = c.effectiveFrom > start ? c.effectiveFrom : start;
    // ⚠ `effectiveTo` EXCLUSIVE — loyihadagi barcha davrlar bilan bir xil.
    const toExcl = c.effectiveTo && c.effectiveTo < endExcl ? c.effectiveTo : endExcl;
    if (from >= toExcl) continue;

    const days = Math.round((toExcl.getTime() - from.getTime()) / 86400000);
    if (days <= 0) continue;
    segments.push({ comp: c, from, toExcl, days });
  }

  return segments;
};

export interface ComputeOptions {
  save?: boolean;
  force?: boolean;
  source?: string;
  actor?: Actor | null;
  reason?: string;
}

@Injectable()
export class StaffPayrollService {
  private readonly logger = new Logger('StaffPayroll');

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly kpi: KpiEngineService,
    private readonly audit: PayrollAuditService,
    private readonly roles: RolesHelperService,
    private readonly branchAccess: BranchAccessService,
  ) {}

  /**
   * Bitta xodimning bitta oyi. IDEMPOTENT — istalgan marta chaqirsa
   * bo'ladi.
   *
   * ⚠ TO'LANGAN OY: qayta hisoblash to'langan oyni ham yangilaydi,
   * lekin `finalAmount` to'langan summadan pastga tushsa holat "paid"
   * dan "partial"ga QAYTMAYDI, `overpaid` ko'rinadi. Bu ATAYLAB:
   * ma'lumot keyin to'g'rilangani uchun pulni qaytarib olish qarori
   * ODAMNIKI, tizimniki emas.
   */
  async computePayroll(
    employeeId: string,
    year: number,
    month: number,
    { save = true, force = false, source = 'auto', actor = null, reason = '' }: ComputeOptions = {},
  ): Promise<unknown> {
    const employee = await this.prisma.user.findUnique({
      where: { id: String(employeeId) },
      select: {
        id: true,
        role: true,
        homeBranchId: true,
        payrollStartFrom: true,
        firstName: true,
        lastName: true,
        username: true,
      },
    });
    if (!employee) throw new ApiError(404, 'Xodim topilmadi');
    if (employee.role === ROLES.STUDENT) {
      throw new ApiError(400, "O'quvchiga maosh hisoblanmaydi");
    }

    // ─── MOLIYAVIY CHEGARA ───
    //
    // `payrollStartFrom` — tizim qaysi sanadan boshlab maosh hisoblaydi.
    // Markaz boshqa CRM'dan ko'chib kelgan bo'lsa, undan oldingi oylar
    // ALLAQACHON to'langan va bu yerda qayta yaratilmasligi kerak.
    //
    // ⚠ Tekshiruv aynan SHU YERDA turadi — hamma yo'l (oylik job,
    // qo'lda hisoblash, shartnoma o'zgarishi, bonus qo'shish) shu
    // funksiyadan o'tadi. Uni yuqoriroq qatlamga qo'yish bitta yo'lni
    // ochiq qoldirardi.
    if (employee.payrollStartFrom) {
      const boundary = employee.payrollStartFrom;
      const monthEnd = new Date(Date.UTC(year, month, 1));
      if (monthEnd <= boundary) {
        const existing = await this.prisma.staffPayroll.findUnique({
          where: { employeeId_year_month: { employeeId: employee.id, year, month } },
        });
        // Mavjud qatorni O'CHIRMAYMIZ — u qo'lda kiritilgan bo'lishi mumkin.
        return existing ? withLegacyId(existing) : null;
      }
    }

    // ─── O'ZGARMAS DAVR ───
    //
    // Yopilgan YOKI to'lov qilingan oy qayta hisoblanmaydi.
    // `force` bu to'siqni faqat OCHIQ qaror bilan chetlab o'tadi
    // (`setLifecycle` — qulf ATAYLAB ochilgan).
    if (save) {
      const existing = await this.prisma.staffPayroll.findUnique({
        where: { employeeId_year_month: { employeeId: employee.id, year, month } },
        select: { id: true, lifecycle: true, paidAmount: true },
      });

      const immutable =
        existing &&
        (existing.lifecycle === 'finalized' ||
          ((existing.paidAmount as unknown as number) || 0) > 0);

      if (immutable && !force) {
        const row = await this.prisma.staffPayroll.findUnique({
          where: { id: existing.id } });
        return withLegacyId(row);
      }
    }

    const { start, endExcl } = monthRange(year, month);

    // Amal qilayotgan shartnomalar (oy bilan kesishganlari).
    //
    // ⚠ TARTIB `createdAt` bilan MUSTAHKAMLANGAN: bir xil
    // `effectiveFrom` bo'lgan ikki shartnomada oxirgi segment
    // (`lastComp`) qaysi biri ekani BARQAROR bo'lishi kerak, aks holda
    // `salaryType`/`branchId` har qayta hisoblanganda o'zgarib ketardi.
    const comps = (await this.prisma.staffCompensation.findMany({
      where: {
        employeeId: employee.id,
        isDeleted: false,
        effectiveFrom: { lt: endExcl },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: start } }],
      },
      orderBy: [{ effectiveFrom: 'asc' }, { createdAt: 'asc' }],
    })) as unknown as CompRow[];

    const segments = compensationSegmentsForMonth(comps, year, month);
    const totalDays = daysInMonth(year, month);

    // FIXED qism — bo'laklar bo'yicha proratsiya.
    let fixedAmount = 0;
    let payableDays = 0;
    for (const seg of segments) {
      if (seg.comp.salaryType === 'kpi_only') continue;
      payableDays += seg.days;
      fixedAmount += Math.round(
        ((seg.comp.baseAmount as unknown as number) * seg.days) / totalDays);
    }

    // Oxirgi amaldagi shartnoma — snapshot uchun (nima asosida hisoblandi).
    const lastComp = segments.length ? segments[segments.length - 1].comp : null;
    const salaryType = lastComp?.salaryType || 'fixed';
    const branchId = lastComp?.branchId || employee.homeBranchId || null;

    if (!save) {
      return { employee, salaryType, fixedAmount, payableDays, totalDays, branchId };
    }

    // Yaratilishidan OLDINGI holat — audit uchun ("nima edi").
    const before = await this.prisma.staffPayroll.findUnique({
      where: { employeeId_year_month: { employeeId: employee.id, year, month } },
      select: {
        finalAmount: true,
        fixedAmount: true,
        autoKpiTotal: true,
        manualBonusTotal: true,
        penaltyTotal: true,
      },
    });

    // ⚠ `@@unique([employeeId, year, month])` HAQIQIY unique kalit —
    // bir xodimga bir oyda ikkinchi maosh qatori JISMONAN yaratilmaydi.
    const payroll = await this.prisma.staffPayroll.upsert({
      where: { employeeId_year_month: { employeeId: employee.id, year, month } },
      update: {
        branchId, salaryType,
        baseAmount: ((lastComp?.baseAmount as unknown as number) || 0) as never,
      },
      create: {
        employeeId: employee.id,
        year,
        month,
        branchId,
        salaryType,
        baseAmount: ((lastComp?.baseAmount as unknown as number) || 0) as never,
        paidAmount: 0 as never,
      },
    });

    // AVTOMATIK KPI — shartnoma turi ruxsat bersagina.
    let autoKpiTotal = 0;
    let appliedRules: AppliedRule[] = [];
    if (salaryType === 'fixed_plus_kpi' || salaryType === 'kpi_only') {
      const res = await this.kpi.rebuildAutoKpi({ payroll, employee });
      autoKpiTotal = res.total;
      appliedRules = res.appliedRules || [];
    } else {
      // Tur "fixed"ga o'zgartirilgan bo'lsa eski KPI qatorlari qolib
      // ketmasin.
      await this.prisma.staffPayrollItem.deleteMany({
        where: { payrollId: payroll.id } });
    }

    // ⚠ QO'LDA kiritilgan bonus/jarima — qayta hisoblash ularga
    // TEGMAYDI, faqat yig'indisini oladi.
    const adjustments = await this.prisma.staffPayrollAdjustment.groupBy({
      by: ['kind'],
      where: { employeeId: employee.id, year, month, isDeleted: false },
      _sum: { amount: true },
    });
    const totalOf = (kind: string): number =>
      (adjustments.find((a) => a.kind === kind)?._sum.amount as unknown as number) || 0;
    const manualBonusTotal = totalOf('bonus');
    const penaltyTotal = totalOf('penalty');
    const openingCreditTotal = totalOf('opening_credit');
    const openingDebtTotal = totalOf('opening_debt');

    // ─── YAKUNIY FORMULA ───
    //
    // Jarima: manfiy chiqmaydi, ortiqchasi YO'QOLADI (eski qoida — buni
    // odam qo'lda hal qiladi).
    //
    // ⚠ Boshlang'ich qarz BOSHQACHA. U haqiqiy pul, shuning uchun shu
    // oyda ushlab qololmagan qismi yo'qolmaydi — `openingDebtApplied`
    // bilan qayd etiladi va farqi keyingi oyga ko'chiriladi.
    const gross =
      fixedAmount + autoKpiTotal + manualBonusTotal + openingCreditTotal - penaltyTotal;
    const availableForDebt = Math.max(0, gross);
    const openingDebtApplied = Math.min(openingDebtTotal, availableForDebt);
    const finalAmount = Math.max(0, gross - openingDebtApplied);

    // ─── SNAPSHOT ───
    //
    // Qator hisob KUNIDAGI holatni o'zida saqlaydi. Ertaga stavka
    // oshirilsa yoki KPI qoidasi o'zgartirilsa ham, bu oyni ochgan odam
    // raqam QANDAY chiqqanini ko'radi.
    const snapshot = {
      takenAt: new Date(),
      compensation: lastComp
        ? {
            id: String(lastComp.id),
            salaryType: lastComp.salaryType,
            baseAmount: lastComp.baseAmount,
            effectiveFrom: lastComp.effectiveFrom,
            effectiveTo: lastComp.effectiveTo,
          }
        : null,
      segments: segments.map((seg) => ({
        from: seg.from,
        toExcl: seg.toExcl,
        days: seg.days,
        salaryType: seg.comp.salaryType,
        baseAmount: seg.comp.baseAmount,
      })),
      kpiRules: appliedRules,
      proration: { payableDays, totalDays },
      totals: {
        fixedAmount,
        autoKpiTotal,
        manualBonusTotal,
        penaltyTotal,
        openingCreditTotal,
        openingDebtTotal,
        openingDebtApplied,
        finalAmount,
      },
    };

    const updated = await this.prisma.staffPayroll.update({
      where: { id: payroll.id },
      data: {
        branchId,
        salaryType,
        baseAmount: ((lastComp?.baseAmount as unknown as number) || 0) as never,
        prorationFactor: totalDays ? payableDays / totalDays : 0,
        payableDays,
        totalDays,
        fixedAmount: fixedAmount as never,
        autoKpiTotal: autoKpiTotal as never,
        manualBonusTotal: manualBonusTotal as never,
        penaltyTotal: penaltyTotal as never,
        openingCreditTotal: openingCreditTotal as never,
        openingDebtTotal: openingDebtTotal as never,
        openingDebtApplied: openingDebtApplied as never,
        finalAmount: finalAmount as never,
        status: deriveStatus(
          (payroll.paidAmount as unknown as number) || 0, finalAmount) as never,
        computedAt: new Date(),
        source: source as never,
        snapshot: snapshot as never,
      },
    });

    // AUDIT: yaratildimi yoki qayta hisoblandimi — ikkalasi ham yoziladi.
    await this.audit.record({
      employee: employee.id,
      year,
      month,
      action: before
        ? PAYROLL_AUDIT_ACTIONS.RECALCULATED
        : PAYROLL_AUDIT_ACTIONS.GENERATED,
      targetType: 'staffPayroll',
      targetId: updated.id,
      oldValue: before
        ? {
            finalAmount: before.finalAmount,
            fixedAmount: before.fixedAmount,
            autoKpiTotal: before.autoKpiTotal,
          }
        : null,
      newValue: { finalAmount, fixedAmount, autoKpiTotal },
      reason,
      actor,
      meta: { source },
    });

    return withLegacyId(updated);
  }

  /**
   * ═══════════════════════════════════════════════════════════════════
   * USHLAB QOLINMAGAN BOSHLANG'ICH QARZNI KEYINGI OYGA KO'CHIRADI.
   *
   * MUAMMO: xodimning boshlang'ich qarzi 3 mln, oylik maoshi 2 mln.
   * `finalAmount` manfiy bo'la olmaydi, ya'ni o'sha oy 0 to'lanadi va
   * qolgan 1 mln HECH QAYERDA QOLMAYDI — pul jimgina yo'qoladi.
   *
   * ⚠ IKKI BARAVAR USHLAB QOLISHDAN HIMOYA ikki qavatli:
   *   1) qisman unique indeks `(employeeId, year, month, kind)` —
   *      bitta oyga ikkinchi `opening_debt` qatori UMUMAN yozilmaydi;
   *   2) P2002 jimgina yutiladi (qator allaqachon bor = ish bajarilgan).
   *
   * ⚠ MA'LUM CHEKLOV: ko'chirilgandan KEYIN o'tgan oy qayta hisoblansa
   * va `openingDebtApplied` o'zgarsa, ko'chirilgan summa eskirib
   * qoladi. Avtomatik tuzatilmaydi — ATAYLAB: qarzni jimgina qayta
   * yozish undan ham xavfliroq.
   * ═══════════════════════════════════════════════════════════════════
   */
  async carryOverOpeningDebt(year: number, month: number) {
    const prevMonth = month === 1 ? 12 : month - 1;
    const prevYear = month === 1 ? year - 1 : year;

    // ⚠ XODIMLAR RO'YXATI BO'YICHA FILTRLANMAYDI — ATAYLAB.
    // `generateMonth` xodimlarni SHARTNOMA bo'yicha sanaydi.
    // Shartnomasi tugagan, lekin qarzi qolgan xodim o'sha ro'yxatga
    // tushmaydi — va agar bu yerda ham filtrlasak, uning qarzi
    // ko'chirilmay zanjir UZILARDI va pul yo'qolardi.
    const prevPayrolls = await this.prisma.staffPayroll.findMany({
      where: {
        year: prevYear,
        month: prevMonth,
        openingDebtTotal: {
          gt: this.prisma.staffPayroll.fields.openingDebtApplied,
        },
      } as never,
      select: {
        employeeId: true,
        branchId: true,
        openingDebtTotal: true,
        openingDebtApplied: true,
      },
    });

    const carriedEmployeeIds: string[] = [];
    let carried = 0;
    for (const p of prevPayrolls) {
      const remaining =
        ((p.openingDebtTotal as unknown as number) || 0) -
        ((p.openingDebtApplied as unknown as number) || 0);
      if (remaining <= 0) continue;

      try {
        // eslint-disable-next-line no-await-in-loop
        await this.prisma.staffPayrollAdjustment.create({
          data: {
            employeeId: p.employeeId,
            branchId: p.branchId || null,
            year,
            month,
            kind: 'opening_debt',
            amount: remaining,
            reason: `Boshlang'ich qarz qoldig'i (${prevMonth}/${prevYear} oyidan ko'chirildi)`,
            carriedFromYear: prevYear,
            carriedFromMonth: prevMonth,
          } as never,
        });
        carried += 1;
        carriedEmployeeIds.push(p.employeeId);
      } catch (err) {
        // P2002 = shu oyga allaqachon ko'chirilgan. Bu XATO EMAS, bu
        // idempotentlik ishlagani. Lekin xodim baribir ro'yxatga
        // tushadi: qator bor, ammo uning oylik hisobi hali qurilmagan
        // bo'lishi mumkin.
        if ((err as { code?: string })?.code === 'P2002') {
          carriedEmployeeIds.push(p.employeeId);
          continue;
        }
        this.logger.warn(
          `Boshlang'ich qarz qoldig'ini ko'chirib bo'lmadi (${String(p.employeeId)} ${year}/${month}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    if (carried) {
      this.logger.log(`Boshlang'ich qarz qoldiqlari ko'chirildi (${year}/${month}: ${carried})`);
    }
    return { carried, employeeIds: carriedEmployeeIds };
  }

  /**
   * Oylik generatsiya — barcha xodimlar uchun.
   *
   * Kimlar? Shu oyda amal qilgan shartnomasi bor xodimlar. O'qituvchi
   * moduli guruhlar bo'ylab yuradi va xodimni HECH QACHON topmasdi.
   */
  async generateMonth(year: number, month: number) {
    const { start, endExcl } = monthRange(year, month);

    const compRows = await this.prisma.staffCompensation.findMany({
      where: {
        isDeleted: false,
        effectiveFrom: { lt: endExcl },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: start } }],
      },
      select: { employeeId: true },
      distinct: ['employeeId'],
    });
    const employeeIds = compRows.map((r) => r.employeeId);

    // ⚠ KO'CHIRISH HISOBLASHDAN OLDIN: yangi oyning qatori
    // yaratilishidan avval o'tgan oyda ushlab qololmagan boshlang'ich
    // qarz shu oyga o'tkaziladi — aks holda birinchi `computePayroll`
    // qarzsiz hisoblanib, keyin ikkinchi marta qayta hisoblash kerak
    // bo'lardi.
    const carryOver = await this.carryOverOpeningDebt(year, month);

    // Qarzi ko'chirilgan xodim shartnoma ro'yxatida bo'lmasligi mumkin.
    // Uni qo'shmasak shu oyga payroll qatori yaratilmasdi va KEYINGI oy
    // ko'chirish zanjiri uzilardi.
    const targetIds = [
      ...new Map(
        [...employeeIds, ...carryOver.employeeIds].map((id) => [String(id), id]),
      ).values(),
    ];

    let computed = 0;
    for (const id of targetIds) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await this.computePayroll(id, year, month);
        computed += 1;
      } catch (err) {
        // Bitta xodimning xatosi butun generatsiyani to'xtatmasin.
        this.logger.warn(
          `Xodim maoshini hisoblab bo'lmadi (${String(id)} ${year}/${month}): ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    return { employees: targetIds.length, computed, carried: carryOver.carried };
  }

  /**
   * OYNI YOPISH / QAYTA OCHISH.
   *
   * Yopilgandan keyin avtomatik qayta hisoblash bu qatorga tegmaydi.
   * Qayta ochish — ATAYLAB qilinadigan amal.
   */
  async setLifecycle(
    id: string,
    lifecycle: string,
    currentUser: Actor | null,
    { reason = '' }: { reason?: string } = {},
  ): Promise<unknown> {
    const payroll = await this.prisma.staffPayroll.findUnique({
      where: { id: String(id) } });
    if (!payroll) throw new ApiError(404, 'Maosh qatori topilmadi');
    // ⚠ FILIAL QO'RIQCHISI — `id` params/body dan keladi. Bu yo'l oyni
    // QULFLAYDI/OCHADI va ochilganda darhol qayta hisoblaydi, ya'ni
    // begona filial maoshini o'zgartira olardi.
    await this.branchAccess.assertUserInBranchScope(payroll.employeeId);

    // ⚠ QULFNI OCHISH — sabab MAJBURIY. Yopilgan moliyaviy davrni qayta
    // ochish istisno hodisa; auditda "nega" yozilmasa, keyin
    // tushuntirib bo'lmaydi.
    if (
      lifecycle !== 'finalized' &&
      payroll.lifecycle === 'finalized' &&
      !reason.trim()
    ) {
      throw new ApiError(400, "Qulfni ochish sababini ko'rsating");
    }

    const previous = payroll.lifecycle;

    const data =
      lifecycle === 'finalized'
        ? {
            lifecycle: 'finalized',
            finalizedAt: new Date(),
            finalizedById: actorId(currentUser),
          }
        : { lifecycle: 'draft', finalizedAt: null, finalizedById: null };

    const saved = await this.prisma.staffPayroll.update({
      where: { id: payroll.id }, data: data as never });

    await this.audit.record({
      employee: payroll.employeeId,
      year: payroll.year,
      month: payroll.month,
      action:
        lifecycle === 'finalized'
          ? PAYROLL_AUDIT_ACTIONS.LOCKED
          : PAYROLL_AUDIT_ACTIONS.UNLOCKED,
      targetType: 'staffPayroll',
      targetId: payroll.id,
      oldValue: { lifecycle: previous },
      newValue: { lifecycle },
      reason,
      actor: currentUser,
    });

    // Qayta ochilganda darhol yangi raqamni ko'rsatamiz. `force` shu
    // yerda O'RINLI: qulf ATAYLAB ochildi, ya'ni bu egasining qarori.
    if (lifecycle !== 'finalized') {
      return this.computePayroll(payroll.employeeId, payroll.year, payroll.month, {
        force: true,
        source: 'manual',
        actor: currentUser,
        reason,
      });
    }
    return withLegacyId(saved);
  }

  /** Maosh qatorlari ro'yxati (filial ko'lami bilan). */
  async list({
    year, month, employeeId, status, page = 1, limit = 50,
  }: {
    year?: unknown; month?: unknown; employeeId?: unknown; status?: unknown;
    page?: number; limit?: number;
  }) {
    const where: Record<string, unknown> = {};
    if (year) where.year = Number(year);
    if (month) where.month = Number(month);
    if (employeeId) where.employeeId = String(employeeId);
    if (status) where.status = status;

    // ─── FILIAL KO'LAMI ───
    //
    // ⚠ Shart `AND` ichiga qo'shiladi va `employeeId` filtri bilan
    // ALMASHTIRILMAYDI. Aks holda aniq `employeeId` berilganda filial
    // sharti butunlay tushib qolardi — boshqa filial xodimining
    // maoshini ID bilan so'rab olish mumkin bo'lardi.
    //
    // `userBranchCondition()` FOYDALANUVCHI ustidagi shartni beradi,
    // shuning uchun u `employee` relation'iga qo'llanadi —
    // `StaffPayroll.branchId` shartnomadan meros bo'lgani uchun undan
    // ishonchliroq.
    const branchCond = userBranchCondition();
    if (branchCond) {
      where.AND = [
        ...((where.AND as unknown[]) || []),
        { employee: { AND: [branchCond], isDeleted: false } },
      ];
    }

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.staffPayroll.findMany({
        where: where as never,
        orderBy: [{ year: 'desc' }, { month: 'desc' }, { finalAmount: 'desc' }],
        skip,
        take: limit,
        include: {
          employee: { select: EMPLOYEE_SELECT },
          branch: { select: BRANCH_SELECT },
        },
      }),
      this.prisma.staffPayroll.count({ where: where as never }),
    ]);

    // Rol yorlig'i — ro'yxatda "direktor" xom qiymat bo'lib ko'rinmasin.
    const catalog = await this.roles.loadRoleCatalog();
    const withRole = items.map((p) => ({
      ...(shapePayroll(p as never) as Record<string, unknown>),
      roleLabel: catalog.get(p.employee?.role)?.label || p.employee?.role || '',
    }));

    return { items: withRole, total, page, limit };
  }

  /** Bitta qator + to'liq tafsilot (KPI qatorlari, bonus/jarima). */
  async getById(id: string) {
    const payroll = await this.prisma.staffPayroll.findUnique({
      where: { id: String(id) },
      include: {
        employee: { select: EMPLOYEE_SELECT },
        branch: { select: BRANCH_SELECT },
      },
    });
    if (!payroll) throw new ApiError(404, 'Maosh qatori topilmadi');
    // ⚠ FILIAL QO'RIQCHISI: `id` to'g'ridan-to'g'ri params dan keladi va
    // hech qanday filtr qo'llanmaydi — filial direktori boshqa filial
    // xodimining maosh qatorini ID ni qo'lda kiritib ocha olardi.
    await this.branchAccess.assertUserInBranchScope(payroll.employeeId);

    const [items, adjustments] = await Promise.all([
      this.prisma.staffPayrollItem.findMany({
        where: { payrollId: payroll.id },
        orderBy: { amount: 'desc' },
      }),
      this.prisma.staffPayrollAdjustment.findMany({
        where: {
          employeeId: payroll.employeeId,
          year: payroll.year,
          month: payroll.month,
          isDeleted: false,
        },
        orderBy: { createdAt: 'desc' },
        include: {
          createdBy: { select: { id: true, firstName: true, lastName: true } },
        },
      }),
    ]);

    return {
      ...(shapePayroll(payroll as never) as Record<string, unknown>),
      items: withLegacyIds(items),
      bonuses: withLegacyIds(adjustments.filter((a) => a.kind === 'bonus')),
      penalties: withLegacyIds(adjustments.filter((a) => a.kind === 'penalty')),
    };
  }

  /** Xodimning maosh tarixi (profil bo'limi uchun). */
  async historyByEmployee(employeeId: string, { limit = 12 }: { limit?: number } = {}) {
    // ⚠ FILIAL QO'RIQCHISI — `employeeId` params dan keladi.
    await this.branchAccess.assertUserInBranchScope(employeeId);
    const items = await this.prisma.staffPayroll.findMany({
      where: { employeeId: String(employeeId) },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      take: limit,
    });

    // ⚠ KALIT TARTIBI Express bilan bir xil: `totalRemaining` OXIRIDA
    // qo'shiladi (u yerda ham `reduce` dan keyin yoziladi).
    const summary: {
      months: number; totalFinal: number; totalPaid: number;
      totalRemaining?: number;
    } = items.reduce(
      (acc, p) => ({
        months: acc.months + 1,
        totalFinal: acc.totalFinal + ((p.finalAmount as unknown as number) || 0),
        totalPaid: acc.totalPaid + ((p.paidAmount as unknown as number) || 0),
      }),
      { months: 0, totalFinal: 0, totalPaid: 0 },
    );
    summary.totalRemaining = Math.max(0, summary.totalFinal - summary.totalPaid);

    return { items: withLegacyIds(items), summary };
  }

  /**
   * ═══════════════════════════════════════════════════════════════════
   * TO'LOV KESHINI ATOMAR O'ZGARTIRISH.
   *
   * `capToRemaining` — qoldiqdan oshib ketishga yo'l qo'ymaydi: ikki
   * marta bosilgan "To'lash" tugmasi ikki barobar to'lovga aylanmaydi.
   *
   * ⚠ BITTA XOM `UPDATE`: SQL'da o'ng tomondagi ustun ESKI qiymatni
   * beradi, ya'ni status DB'dagi JORIY `paidAmount` dan chiqadi va
   * poyga oynasi YO'Q.
   *
   * ⚠ KLAMP: yangi `paidAmount` NOLDAN PASTGA tushmaydi
   * (`GREATEST(0, ...)`), va status AYNAN shu klamplangan qiymatdan
   * hisoblanadi — shuning uchun bitta ifoda ikki marta takrorlanadi,
   * xom `paidAmount + delta` EMAS.
   *
   * ⚠⚠ B20 (XODIMLAR MAOSHI SHOXI) — TUZATILDI. Imzo ilgari `tx` ni
   * QABUL QILMASDI, chaqiruvchi (`staff-salary-transaction.service`)
   * esa uni `{ capToRemaining: true, tx }` bilan uzatardi: argument
   * JIMGINA tashlab yuborilardi va xom `UPDATE` GLOBAL klientda, ochiq
   * tranzaksiyadan TASHQARIDA bajarilardi. Ya'ni `staffSalaryTransaction`
   * qatori yoki jurnal yiqilsa ular ROLLBACK bo'lardi, `paidAmount` esa
   * o'sganicha qolardi — maosh "to'langan" ko'rinib, PUL YOZUVI
   * bo'lmasdi.
   *
   * `tx` berilmasa xatti-harakat AVVALGIDEK (global klient) — ya'ni
   * tranzaksiyasiz chaqiruvchi (`remove()`) ta'sirlanmaydi.
   *
   * ⚠ IKKALA STEKDA BIR VAQTDA
   * (`server/src/modules/staffPayroll/services/staffPayroll.service.js`).
   * ═══════════════════════════════════════════════════════════════════
   */
  async applyPaidDelta(
    payrollId: string,
    delta: number,
    {
      capToRemaining = false,
      tx = null,
    }: { capToRemaining?: boolean; tx?: TxClient | null } = {},
  ): Promise<unknown> {
    // `tx` berilgan bo'lsa XOM SQL HAM, keyingi o'qish HAM o'sha
    // tranzaksiyada bajarilishi shart — aks holda rollback ularni
    // qaytara olmaydi.
    const db: TxClient = tx ?? (this.prisma as unknown as TxClient);
    const id = String(payrollId);
    const d = Number(delta) || 0;

    const setClause = Prisma.sql`
      SET "paidAmount" = GREATEST(0, "paidAmount" + ${d}::numeric),
          "status"     = CASE
            WHEN GREATEST(0, "paidAmount" + ${d}::numeric) <= 0
              THEN 'unpaid'::"PayStatus"
            WHEN GREATEST(0, "paidAmount" + ${d}::numeric) >= "finalAmount"
              THEN 'paid'::"PayStatus"
            ELSE 'partial'::"PayStatus"
          END,
          "updatedAt"  = NOW()
    `;

    const affected =
      capToRemaining && d > 0
        ? await db.$executeRaw`
            UPDATE "staff_payrolls" ${setClause}
            WHERE "id" = ${id}
              AND "paidAmount" + ${d}::numeric <= "finalAmount"
          `
        : await db.$executeRaw`
            UPDATE "staff_payrolls" ${setClause}
            WHERE "id" = ${id}
          `;

    if (affected === 0) return null;
    const row = await db.staffPayroll.findUnique({ where: { id } });
    return row ? withLegacyId(row) : null;
  }
}
