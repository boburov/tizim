import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { ROLES } from '../../common/constants/permissions.js';
import { withLegacyId, withLegacyIds } from '../../common/utils/serialize.js';
import { buildMeta } from '../../common/utils/pagination.js';
import {
  branchFilter,
  userBranchCondition,
} from '../../common/als/branch-context.js';
import { BranchAccessService } from '../../common/rbac/branch-access.service.js';
import { deriveStatus, daysInMonth } from '../../common/utils/proration.js';
import { localTodayMidnight, toUtcMidnight } from '../../common/utils/date.js';
import { TeacherGroupPeriodService } from '../groups/teacher-group-period.service.js';
// ⚠ `Prisma.TransactionClient` EMAS — kengaytirilgan klient (omit +
// decimal normalizatsiyasi) standart turga mos kelmaydi. Loyihada
// yagona ta'rif `journal.service.ts` da (`TxClient`) va u klientning
// O'ZIDAN keltirib chiqarilgan.
import type { TxClient } from '../journal/journal.service.js';
import {
  segmentPeriod,
  baseSegmentsForMonth,
  segmentDays,
  COMPENSATION_FIELDS,
  type Rate,
} from './rate-resolver.js';
import { VariableBaseService, segmentFactor } from './variable-base.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O'QITUVCHI MAOSHI — `teacherSalary.service.js` KO'CHIRMASI.
 *
 * ⚠⚠ ENG MUHIM QAROR: STATUS BAZADAGI JORIY `paidAmount` DAN CHIQADI ⚠⚠
 *
 * Mongo varianti `paidAmount`/`status`/`overpaidAmount` ni AGGREGATION
 * UPDATE PIPELINE bilan yozardi, ya'ni status bitta ATOMIK amalda
 * keltirib chiqarilardi. "O'qi → JS'da hisobla → saqla" naqshi EMAS —
 * aks holda hisob davomida kelib tushgan parallel to'lov YO'QOLARDI
 * (lost update).
 *
 * PostgreSQL'da ikki vosita bilan saqlandi:
 *   1) `applyPaidDelta` — BITTA xom `UPDATE`. `capToRemaining` bo'lsa
 *      yangi summa qoldiqdan oshsa qator UMUMAN yangilanmaydi. Ikki
 *      bosqichda qilish poyga oynasini qaytarib olib kelardi.
 *   2) Qolgan yo'llar — `$transaction` + `SELECT … FOR UPDATE`.
 *
 * ⚠ `updatedAt`: Prisma'dagi `@updatedAt` KLIENT tomonida qo'yiladi.
 * Xom SQL uni chetlab o'tadi, shuning uchun `"updatedAt"` OCHIQ `NOW()`
 * bilan yoziladi.
 *
 * ⚠ `isDeleted`: `TeacherSalary` da bunday ustun UMUMAN YO'Q (u hosila
 * jadval — o'chirilmaydi, qayta hisoblanadi). `SalaryTransaction` da esa
 * BOR — shuning uchun filtrlar ASSIMETRIK.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const SAFE_TEACHER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  username: true,
  phone: true,
} as const;

/**
 * ⚠ Guruh jadvali RELATION — `computeLessonHours` uni TALAB qiladi.
 * Unutilsa massiv bo'sh keladi va soatbay maosh JIMGINA 0 bo'lardi.
 */
const GROUP_FOR_SNAPSHOT = {
  id: true,
  startDate: true,
  endDate: true,
  schedule: {
    select: { day: true, startTime: true, endTime: true, effectiveFrom: true },
  },
} as const;

const DAY = 24 * 60 * 60 * 1000;

/**
 * LEGACY MOSLIK: `salaryType` enum'i.
 *
 * Mongo modelida `salaryType` "mixed" ni ham qabul qilardi; Postgres
 * `enum SalaryRateType` da esa faqat `fixed` va `percent` bor. Snapshot
 * ko'rsatish uchun "mixed" hisoblaydi, shuning uchun YOZISHDAN OLDIN u
 * eng yaqin haqiqiy qiymatga tushiriladi.
 *
 * NEGA `percent`: "mixed" ikkala kanal ham yoqilgan degani va foizli
 * qism odatda kattaroq; `fixedAmount` baribir alohida saqlanadi, ya'ni
 * ma'lumot yo'qolmaydi. Bu FAQAT ko'rsatish maydoni — hisoblangan
 * summaga (`expectedAmount`) TA'SIR QILMAYDI.
 */
const toRateTypeEnum = (v: string | null): 'fixed' | 'percent' =>
  v === 'percent' || v === 'mixed' ? 'percent' : 'fixed';

const normalizeRateForWrite = (rate: Record<string, any>) => ({
  ...rate,
  salaryType: toRateTypeEnum(rate.salaryType),
});

/**
 * Statusni JORIY `paidAmount` dan keltirib chiqaradigan yagona ifoda.
 * `applyPaidDelta` xom SQL ishlatgani uchun u yerda ham AYNAN shu
 * mantiq — ikki joyda ikki xil qoida bo'lib qolmasin.
 */
const derived = (paid: number, expected: number) => ({
  status: deriveStatus(paid, expected),
  overpaidAmount: Math.max(0, paid - expected),
});

@Injectable()
export class TeacherSalaryService {
  private readonly logger = new Logger('TeacherSalary');

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly branchAccess: BranchAccessService,
    private readonly periods: TeacherGroupPeriodService,
    private readonly variableBase: VariableBaseService,
  ) {}

  /** O'qituvchining berilgan oraliqda amal qilgan STANDART stavkalari. */
  async compensationsForRange(teacher: string, from: Date, to: Date) {
    return this.prisma.teacherCompensation.findMany({
      where: {
        teacherId: String(teacher),
        isDeleted: false,
        effectiveFrom: { lt: to },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: from } }],
      },
      select: { ...COMPENSATION_FIELDS, createdAt: true },
      // ⚠ TARTIB ANIQ BO'LISHI SHART — sabab `rate-resolver.ts`
      // `byEffectiveFrom` izohida.
      orderBy: [{ effectiveFrom: 'asc' }, { createdAt: 'asc' }],
    });
  }

  /** Guruhning o'sha oy hisoblangan (billed) tushumi — foiz maoshi bazasi. */
  async computeGroupRevenue(group: string, year: number, month: number): Promise<number> {
    const agg = await this.prisma.studentPayment.aggregate({
      where: { groupId: String(group), year, month },
      _sum: { expectedAmount: true },
    });
    return Number(agg._sum.expectedAmount ?? 0);
  }

  /**
   * GURUH qatori (`kind="group"`) uchun snapshot — SEGMENT asosida.
   *
   * MANBA HAQIQATI IKKITA: (1) `TeacherGroupPeriod` — o'qituvchi qachon
   * dars bergani va (ixtiyoriy) guruhga xos stavka; (2)
   * `TeacherCompensation` — markaz darajasidagi STANDART stavka. Oy
   * ikkalasining KESISHMASI bo'yicha segmentlarga bo'linadi, har segment
   * o'z stavkasi va o'z bazasi bilan hisoblanadi, summalar QO'SHILADI.
   *
   * Shu tufayli 15-martda oylik oshirilsa — mart maoshi 1–15 eski,
   * 16–31 yangi stavkada chiqadi, yanvar esa UMUMAN o'zgarmaydi.
   */
  private async buildSnapshot(salary: {
    year: number; month: number; teacherId: string; groupId: string;
  }) {
    const { year, month } = salary;
    const teacherId = String(salary.teacherId);
    const groupId = String(salary.groupId);
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEndExcl = new Date(Date.UTC(year, month, 1));

    const [periods, group, compensations] = await Promise.all([
      this.periods.periodsForMonth(teacherId, groupId, year, month),
      this.prisma.group.findUnique({
        where: { id: groupId },
        select: GROUP_FOR_SNAPSHOT,
      }),
      this.compensationsForRange(teacherId, monthStart, monthEndExcl),
    ]);

    // Guruh kurs oynasi — davr shu chegaraga QISILADI (kurs tugagach
    // maosh yo'q).
    const winStart =
      group?.startDate && new Date(group.startDate) > monthStart
        ? new Date(group.startDate)
        : monthStart;
    const winEndExcl =
      group?.endDate &&
      new Date(group.endDate).getTime() + DAY < monthEndExcl.getTime()
        ? new Date(new Date(group.endDate).getTime() + DAY)
        : monthEndExcl;

    // Foiz bazasi segmentlar bo'ylab BIR XIL (oylik guruh tushumi),
    // shuning uchun BIR MARTA yuklanadi.
    const revenueCache = new Map<string, number>();
    const revenueFor = async (base: string) => {
      if (!revenueCache.has(base)) {
        revenueCache.set(
          base,
          await this.variableBase.computeGroupRevenueBase(groupId, year, month, base),
        );
      }
      return revenueCache.get(base)!;
    };

    let perGroupAmount = 0;
    let percentAmount = 0;
    let perStudentAmount = 0;
    let perHourAmount = 0;
    let studentUnits = 0;
    let lessonHours = 0;
    let payableDays = 0;
    let totalDays = 0;
    let minStart: Date | null = null;
    let maxEndExcl: Date | null = null;
    let hasOpen = false;
    let lastRate: Rate | null = null;

    for (const p of periods) {
      const segments = segmentPeriod(p as never, compensations, winStart, winEndExcl);
      for (const seg of segments) {
        const { factor, days, totalDays: tot } = segmentFactor({
          year, month, segStart: seg.start, segEndExcl: seg.endExcl,
        });
        if (days <= 0) continue;
        totalDays = tot;
        payableDays += days;

        const { rate } = seg;

        // (a) guruh uchun QAT'IY summa — segment ulushiga proratsiya
        if (rate.perGroup > 0) {
          perGroupAmount += Math.round(rate.perGroup * factor);
        }

        // (b) guruh tushumidan FOIZ — segment ulushiga proratsiya
        if (rate.percentRate > 0) {
          const revenue = await revenueFor(rate.percentBase);
          percentAmount += Math.round((revenue * rate.percentRate * factor) / 100);
        }

        // (c) HAR O'QUVCHI uchun — proratsiyalangan o'quvchi-oy bazasi
        if (rate.perStudent > 0) {
          const { units } = await this.variableBase.computeStudentUnits({
            group: groupId, year, month,
            segStart: seg.start, segEndExcl: seg.endExcl,
          });
          studentUnits += units;
          perStudentAmount += Math.round(rate.perStudent * units);
        }

        // (d) HAR DARS SOATI uchun — jadvaldan (bayramlar chiqarilgan)
        if (rate.perHour > 0) {
          const { hours } = await this.variableBase.computeLessonHours({
            groupDoc: group, segStart: seg.start, segEndExcl: seg.endExcl,
          });
          lessonHours += hours;
          perHourAmount += Math.round(rate.perHour * hours);
        }

        lastRate = rate;
        if (!minStart || seg.start < minStart) minStart = seg.start;
        if (seg.endExcl.getTime() >= winEndExcl.getTime() && !(p as any).endDate) {
          hasOpen = true;
        }
        if (!maxEndExcl || seg.endExcl > maxEndExcl) maxEndExcl = seg.endExcl;
      }
    }

    if (!totalDays) totalDays = new Date(Date.UTC(year, month, 0)).getUTCDate();

    const baseEarnings =
      perGroupAmount + percentAmount + perStudentAmount + perHourAmount;

    const snap = {
      prorationFactor: totalDays > 0 ? Math.min(1, payableDays / totalDays) : 0,
      payableDays,
      totalDays,
      // ⚠ Eski maydonlar (UI/hisobot mosligi): `proratedFixed` endi
      // "guruh uchun qat'iy" kanalini bildiradi — eski `fixed`
      // semantikasi AYNAN shu edi.
      proratedFixed: perGroupAmount,
      percentAmount,
      perGroupAmount,
      perStudentAmount,
      perHourAmount,
      studentUnits: Math.round(studentUnits * 1000) / 1000,
      lessonHours: Math.round(lessonHours * 100) / 100,
      baseEarnings,
      expectedAmount: Math.max(0, baseEarnings),
      workStartDate: minStart,
      workEndDate:
        hasOpen || !maxEndExcl ? null : new Date(maxEndExcl.getTime() - DAY),
      variableType: lastRate?.variableType || null,
      variableRate: lastRate?.variableRate || 0,
      percentBase: lastRate?.percentBase || null,
      rateSource: lastRate?.source || 'none',
      compensationId: lastRate?.compensationId || null,
      // LEGACY display maydonlari — eski UI buzilmasligi uchun.
      salaryType:
        (lastRate?.percentRate ?? 0) > 0 && (lastRate?.perGroup ?? 0) > 0
          ? 'mixed'
          : (lastRate?.percentRate ?? 0) > 0
            ? 'percent'
            : 'fixed',
      fixedAmount: lastRate?.perGroup || 0,
      percentRate: lastRate?.percentRate || 0,
    };

    const groupRevenue = revenueCache.get(lastRate?.percentBase || 'billed') ?? 0;

    const rate = {
      salaryType: snap.salaryType,
      fixedAmount: snap.fixedAmount,
      percentRate: snap.percentRate,
      variableType: snap.variableType,
      variableRate: snap.variableRate,
      percentBase: snap.percentBase,
      rateSource: snap.rateSource,
      compensationId: snap.compensationId,
    };

    return { snap, groupRevenue, rate };
  }

  /**
   * Qatorni QULFLAB (`FOR UPDATE`) yangilaydi va status/overpaid ni
   * bazadagi JORIY `paidAmount` dan keltirib chiqaradi.
   *
   * Mongo'dagi update-pipeline'ning ekvivalenti: hisob davomida kelib
   * tushgan parallel to'lov YO'QOLMAYDI.
   */
  private async updateWithDerivedStatus(
    salaryId: string,
    expected: number,
    data: Record<string, unknown>,
  ) {
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ paidAmount: number }[]>`
        SELECT "paidAmount" FROM "teacher_salaries" WHERE "id" = ${String(salaryId)} FOR UPDATE
      `;
      if (!rows.length) return null;
      const paid = Number(rows[0].paidAmount) || 0;

      return tx.teacherSalary.update({
        where: { id: String(salaryId) },
        data: {
          ...data,
          expectedAmount: expected,
          ...derived(paid, expected),
          recalculatedAt: new Date(),
        },
      });
    });
  }

  /**
   * ═══════════════════════════════════════════════════════════════════
   * `paidAmount` ni ATOMIK delta bilan o'zgartiradi.
   *
   * `capToRemaining=true` bo'lsa, yangi `paidAmount` `expectedAmount`
   * dan oshadigan bo'lsa qator YANGILANMAYDI (`null` qaytadi):
   * qoldiqdan ortiq to'lovni SHARTLI-ATOMIK to'sish (C3).
   *
   * BITTA SQL AMALI: SQL'da o'ng tomondagi `"paidAmount"` ESKI qiymatni
   * beradi, ya'ni Mongo'dagi `{ $add: ["$paidAmount", delta] }` bilan
   * AYNAN bir xil. Ikki bosqichga bo'lish (o'qi → yoz) poygani
   * qaytarib kelardi.
   *
   * ⚠⚠⚠ TRANZAKSIYA CHEGARASI — EXPRESS XATTI-HARAKATI AYNAN
   *      TAKRORLANGAN, HUJJATLANGAN VA TUZATILMAGAN ⚠⚠⚠
   *
   * Chaqiruvchi (`salaryTransaction.writeSalaryTransaction`) bu
   * funksiyaga `{ capToRemaining: true, tx }` uzatadi. Lekin Express
   * imzosi FAQAT `capToRemaining` ni destrukturizatsiya qiladi — `tx`
   * E'TIBORSIZ QOLADI va xom SQL GLOBAL klientda bajariladi, ya'ni
   * TRANZAKSIYADAN TASHQARIDA.
   *
   * OQIBATI (tekshirib ko'rilgan): tranzaksiya rollback bo'lsa
   * `SalaryTransaction` qatori qaytariladi, `paidAmount` esa
   * O'SGANICHA QOLADI — maosh "to'langan" ko'rinadi, to'lov yozuvi
   * esa YO'Q.
   *
   * ⚠ SHU IMZO ATAYLAB SAQLANDI (`tx` qabul qilinadi, LEKIN
   * ISHLATILMAYDI) — aks holda NestJS Express'dan BOSHQACHA ishlab,
   * paritet YOLG'ON bo'lardi. Tuzatish ALOHIDA QAROR va IKKALA stekda
   * BIR VAQTDA qilinishi kerak.
   * Hujjat: `MIGRATION-CHECKLIST.md` (B-jadval).
   * ═══════════════════════════════════════════════════════════════════
   */
  /**
   * ═══════════════════════════════════════════════════════════════════
   * B20 TUZATILDI — `tx` ENDI HURMAT QILINADI (ikkala stekda BIR VAQTDA).
   *
   * Imzo `tx` ni QABUL QILARDI, lekin uni JIMGINA TASHLAB YUBORARDI
   * (`tx?: unknown`, destrukturizatsiyada yo'q) va xom `UPDATE` GLOBAL
   * klientda, tranzaksiyadan TASHQARIDA bajarilardi.
   *
   * O'LCHANDI (Express nusxasida, AYNI imzo):
   *   tranzaksiya ICHIDA → paidAmount = 50000
   *   ROLLBACK'DAN KEYIN → paidAmount = 50000   ← OMON QOLDI
   *
   * OQIBATI: `salaryTransaction.create` yoki `postTeacherPayroll`
   * yiqilsa to'lov qatori va jurnal ROLLBACK bo'lardi, `paidAmount` esa
   * o'sganicha qolardi — maosh "to'langan" ko'rinib, PUL YOZUVI
   * bo'lmasdi.
   *
   * ⚠ `tx` berilmasa xatti-harakat AVVALGIDEK (global klient), ya'ni
   * tranzaksiyasiz chaqiruvchilar (`remove()`) ta'sirlanmaydi.
   *
   * ⚠ AYNI NUQSON `staff-payroll` va `student-payment` da HAM bor —
   * ular bu ishning doirasidan tashqarida va ATAYLAB TEGILMADI.
   * ═══════════════════════════════════════════════════════════════════
   */
  async applyPaidDelta(
    salaryId: string,
    delta: number,
    {
      capToRemaining = false,
      tx = null,
    }: { capToRemaining?: boolean; tx?: TxClient | null } = {},
  ) {
    // `tx` berilgan bo'lsa XOM SQL HAM, keyingi o'qish HAM o'sha
    // tranzaksiyada bajarilishi shart — aks holda rollback ularni
    // qaytara olmaydi.
    const db: TxClient = tx ?? (this.prisma as unknown as TxClient);
    const id = String(salaryId);
    const d = Number(delta) || 0;

    const setClause = Prisma.sql`
      SET "paidAmount"     = COALESCE("paidAmount", 0) + ${d}::numeric,
          "overpaidAmount" = GREATEST(
            0,
            COALESCE("paidAmount", 0) + ${d}::numeric - "expectedAmount"
          ),
          "status"         = CASE
            WHEN COALESCE("paidAmount", 0) + ${d}::numeric <= 0
              THEN 'unpaid'::"PayStatus"
            WHEN COALESCE("paidAmount", 0) + ${d}::numeric < "expectedAmount"
              THEN 'partial'::"PayStatus"
            ELSE 'paid'::"PayStatus"
          END,
          "updatedAt"      = NOW()
    `;

    const affected = capToRemaining
      ? await db.$executeRaw`
          UPDATE "teacher_salaries" ${setClause}
          WHERE "id" = ${id}
            AND COALESCE("paidAmount", 0) + ${d}::numeric <= "expectedAmount"
        `
      : await db.$executeRaw`
          UPDATE "teacher_salaries" ${setClause}
          WHERE "id" = ${id}
        `;

    if (affected === 0) return null;
    return db.teacherSalary.findUnique({ where: { id } });
  }

  /** Faol tranzaksiyalar yig'indisidan `paidAmount`/status ni tiklaydi. */
  async recalcStatus(salaryId: string) {
    const id = String(salaryId);
    const agg = await this.prisma.salaryTransaction.aggregate({
      where: { salaryId: id, isDeleted: false },
      _sum: { amount: true },
    });
    const paidAmount = Number(agg._sum.amount ?? 0);

    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<{ expectedAmount: number }[]>`
        SELECT "expectedAmount" FROM "teacher_salaries" WHERE "id" = ${id} FOR UPDATE
      `;
      if (!rows.length) return null;
      const expected = Number(rows[0].expectedAmount) || 0;
      return tx.teacherSalary.update({
        where: { id },
        data: { paidAmount, ...derived(paidAmount, expected) },
      });
    });
  }

  /**
   * Snapshot'ni qayta hisoblab, statusni ham yangilaydi.
   *
   * ⚠ Retro o'zgarish `expected` ni to'langandan PASTGA tushirsa, farq
   * `overpaidAmount` sifatida KO'RINADIGAN bo'lib saqlanadi (C6) —
   * clamp bilan YASHIRILMAYDI.
   */
  async recalc(
    salaryId: string,
    { force = false, lockPaid = false }: { force?: boolean; lockPaid?: boolean } = {},
  ) {
    const salary = await this.prisma.teacherSalary.findUnique({
      where: { id: String(salaryId) },
    });
    if (!salary) return null;

    // ─── QULF: MUTLAQ TO'SIQ ───
    // `force` ham buni OCHA OLMAYDI — qulflangan oy avval ATAYLAB
    // ochilishi kerak. `lockPaid` "avtomatik tegma" degan MASLAHAT,
    // qulf esa "bu davr YOPILGAN" degan QAROR.
    if (salary.isLocked) return withLegacyId(salary);

    // FAQAT guruh qatorlari davrlardan qayta hisoblanadi.
    //  • base            — `recalcBaseForTeacherMonth` bilan yangilanadi
    //  • bonus/deduction — QO'LDA kiritilgan (KPI), avtomatik qayta
    //    hisob YO'Q. Aks holda owner kiritgan mukofot har kechqurun
    //    job'da NOLGA tushardi.
    if (salary.kind && salary.kind !== 'group') return withLegacyId(salary);

    // ─── TO'LANGAN OY QULFI — FAQAT STAVKA O'ZGARISHIDA ───
    //
    // ⚠ NEGA UMUMIY QULF NOTO'G'RI EDI: `recalc()` OLTI xil sababdan
    // chaqiriladi — guruh narxi o'zgardi, chegirma berildi, o'quvchi
    // qo'shildi/chiqdi, dars bekor qilindi, o'quvchi o'chirildi.
    // Bularning hammasi maoshning HAQIQIY bazasini o'zgartiradi:
    // martga o'quvchi qo'shildi → `per_student` bo'yicha o'qituvchiga
    // yana 50 000 tegishli. Umumiy qulf buni JIMGINA bloklardi va
    // o'qituvchi haqini olmasdi — hech qayerda iz ham qolmasdi.
    //
    // Stavka o'zgarishi esa BOSHQA narsa: "1-yanvardan oshirdik" degan
    // qaror allaqachon TO'LANGAN fevralni qayta ochmasligi kerak.
    //
    // QISMAN to'langan (`partial`) qatorlar HECH QACHON qulflanmaydi —
    // u yerda hisob-kitob hali tugamagan.
    if (lockPaid && !force && salary.status === 'paid' && Number(salary.paidAmount) > 0) {
      return withLegacyId(salary);
    }

    const { snap, groupRevenue, rate } = await this.buildSnapshot(salary as never);

    const saved = await this.updateWithDerivedStatus(salary.id, snap.expectedAmount, {
      ...normalizeRateForWrite(rate),
      workStartDate: snap.workStartDate || null,
      workEndDate: snap.workEndDate || null,
      groupRevenue,
      prorationFactor: snap.prorationFactor,
      payableDays: snap.payableDays,
      totalDays: snap.totalDays,
      proratedFixed: snap.proratedFixed,
      percentAmount: snap.percentAmount,
      perGroupAmount: snap.perGroupAmount,
      perStudentAmount: snap.perStudentAmount,
      perHourAmount: snap.perHourAmount,
      studentUnits: snap.studentUnits,
      lessonHours: snap.lessonHours,
      baseEarnings: snap.baseEarnings,
    });
    return saved ? withLegacyId(saved) : null;
  }

  /**
   * `expectedAmount` ni yangilaydi + status/overpaid ni DB dagi
   * `paidAmount` dan keltirib chiqaradi (qator qulflanadi, poyga yo'q).
   */
  private async applyExpected(
    salaryId: string,
    expected: number,
    extra: { payableDays?: number; totalDays?: number } = {},
  ) {
    return this.updateWithDerivedStatus(salaryId, expected, {
      baseEarnings: expected,
      proratedFixed: expected,
      ...(extra.payableDays !== undefined
        ? {
            payableDays: extra.payableDays,
            totalDays: extra.totalDays,
            prorationFactor:
              (extra.totalDays ?? 0) > 0 ? extra.payableDays! / extra.totalDays! : 0,
          }
        : {}),
    });
  }

  /**
   * MARKAZ DARAJASIDAGI FIKSA OYLIK (`kind="base"`).
   *
   * ⚠ NEGA GURUHGA BOG'LANMAYDI: "oyligi 2 mln" degani — o'qituvchi
   * 1 ta guruhda ishlasa ham, 5 ta guruhda ishlasa ham 2 mln. Agar bu
   * summa guruh qatoriga yozilsa, 5 guruh = 10 mln bo'lib ketardi.
   * Shuning uchun oyiga BITTA, guruhsiz (`groupId=null`) qator ochiladi.
   */
  async recalcBaseForTeacherMonth(
    teacher: string,
    year: number,
    month: number,
    { lockPaid = false, force = false }: { lockPaid?: boolean; force?: boolean } = {},
  ) {
    const teacherId = String(teacher);
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEndExcl = new Date(Date.UTC(year, month, 1));
    const totalDays = new Date(Date.UTC(year, month, 0)).getUTCDate();

    const [compensations, user] = await Promise.all([
      this.compensationsForRange(teacherId, monthStart, monthEndExcl),
      this.prisma.user.findUnique({
        where: { id: teacherId },
        select: { hiredAt: true, terminatedAt: true, homeBranchId: true },
      }),
    ]);

    const segments = baseSegmentsForMonth(compensations, year, month, {
      from: user?.hiredAt || null,
      toExcl: user?.terminatedAt || null,
    });

    const existing = await this.prisma.teacherSalary.findFirst({
      where: { teacherId, groupId: null, kind: 'base', year, month },
    });

    // QULFLANGAN OY — mutlaq to'siq. Ishga olingan sana tuzatilganda
    // aynan shu yo'l orqali o'tgan oylar qayta yozilardi.
    if (existing?.isLocked) return withLegacyId(existing);

    if (lockPaid && !force && existing?.status === 'paid' && Number(existing.paidAmount) > 0) {
      return withLegacyId(existing);
    }

    // ⚠ Fiksa qism umuman yo'q: mavjud qator O'CHIRILMAYDI — unga to'lov
    // bog'langan bo'lishi mumkin va o'chirish o'tgan oyning chiqimini
    // yo'q qilardi. Nolga tushiriladi; allaqachon to'langan bo'lsa
    // `overpaidAmount` KO'RINADIGAN bo'lib qoladi (clawback uchun asos).
    if (segments.length === 0) {
      if (!existing) return null;
      const zeroed = await this.applyExpected(existing.id, 0);
      return zeroed ? withLegacyId(zeroed) : null;
    }

    let expected = 0;
    let payableDays = 0;
    let branchId: string | null = null;
    let compensationId: string | null = null;
    let rateAmount = 0;
    for (const seg of segments) {
      const days = Math.max(
        0,
        Math.round((seg.endExcl.getTime() - seg.start.getTime()) / DAY),
      );
      if (days <= 0) continue;
      expected += Math.round((seg.amount * days) / totalDays);
      payableDays += days;
      branchId = seg.branchId || branchId;
      compensationId = seg.compensationId;
      rateAmount = seg.amount;
    }

    // ⚠ FILIAL: stavkadagi filial → o'qituvchining asosiy filiali.
    // Ikkalasi ham bo'lmasa qator YARATILMAYDI — `branchId` majburiy va
    // noto'g'ri filialga chiqim yozilishi hisobotni buzardi.
    branchId = branchId || user?.homeBranchId || null;
    if (!branchId) {
      this.logger.warn(
        `Fiksa oylik uchun filial aniqlanmadi - qator yaratilmadi (teacher=${teacherId}, ${year}-${month})`,
      );
      return null;
    }

    if (existing) {
      const saved = await this.applyExpected(existing.id, expected, {
        payableDays, totalDays,
      });
      return saved ? withLegacyId(saved) : null;
    }

    try {
      const created = await this.prisma.teacherSalary.create({
        data: {
          branchId, teacherId, groupId: null, kind: 'base', year, month,
          salaryType: 'fixed',
          fixedAmount: rateAmount,
          variableType: null,
          rateSource: 'compensation',
          compensationId,
          prorationFactor: totalDays > 0 ? payableDays / totalDays : 0,
          payableDays, totalDays,
          proratedFixed: expected,
          baseEarnings: expected,
          expectedAmount: expected,
          status: deriveStatus(0, expected),
          source: 'auto',
          recalculatedAt: new Date(),
        },
      });
      return withLegacyId(created);
    } catch (err: any) {
      // POYGA: boshqa jarayon shu qatorni endigina yaratdi.
      // Qisman unique indeks: `(teacherId, year, month, kind)`
      //   `WHERE "groupId" IS NULL AND "kind" = 'base'`
      if (err?.code === 'P2002') {
        const again = await this.prisma.teacherSalary.findFirst({
          where: { teacherId, groupId: null, kind: 'base', year, month },
        });
        if (!again) return null;
        const saved = await this.applyExpected(again.id, expected, {
          payableDays, totalDays,
        });
        return saved ? withLegacyId(saved) : null;
      }
      throw err;
    }
  }

  /** Guruh+oy bo'yicha barcha maoshlarni qayta hisoblaydi. */
  async recalcForGroupMonth(group: string, year: number, month: number) {
    const salaries = await this.prisma.teacherSalary.findMany({
      where: { groupId: String(group), year, month, kind: 'group' },
      select: { id: true },
    });
    for (const s of salaries) await this.recalc(s.id);
    return salaries.length;
  }

  /** Guruhning barcha oylik maoshlarini qayta hisoblaydi. */
  async recalcForGroup(group: string) {
    const salaries = await this.prisma.teacherSalary.findMany({
      where: { groupId: String(group), kind: 'group' },
      select: { id: true },
    });
    for (const s of salaries) await this.recalc(s.id);
    return salaries.length;
  }

  /**
   * O'qituvchi guruhga biriktirilganda shu oy maoshini yaratadi.
   *
   * ⚠ IDEMPOTENT: qator allaqachon bo'lsa O'SHA qaytariladi; poygada esa
   * qisman unique indeks ushlaydi va P2002 dan keyin mavjud qator
   * o'qiladi. Ya'ni bir o'qituvchiga bir guruh uchun bir oyda IKKINCHI
   * qator HECH QANDAY yo'l bilan yaratilmaydi.
   */
  async ensureSalaryForTeacherGroup(
    teacher: string, group: string, year: number, month: number,
  ) {
    if (!teacher || !group) return null;
    const teacherId = String(teacher);
    const groupId = String(group);

    const exists = await this.prisma.teacherSalary.findFirst({
      where: { teacherId, groupId, year, month, kind: 'group' },
    });
    if (exists) return withLegacyId(exists);

    // FILIAL: guruhdan MEROS. Bu fon vazifasidan ham chaqiriladi —
    // u yerda foydalanuvchi konteksti YO'Q.
    const branchId = await this.branchAccess.resolveBranchFromGroup(groupId);

    // ⚠ Snapshot yozuv YARATILMASDAN OLDIN hisoblanadi: Mongoose'da
    // `new Model()` xotiradagi hujjat berardi, Prisma'da bunday oraliq
    // obyekt YO'Q.
    const { snap, groupRevenue, rate } = await this.buildSnapshot({
      teacherId, groupId, year, month,
    });

    try {
      const created = await this.prisma.teacherSalary.create({
        data: {
          branchId, teacherId, groupId, kind: 'group', year, month,
          source: 'auto',
          ...normalizeRateForWrite(rate),
          groupRevenue,
          prorationFactor: snap.prorationFactor,
          payableDays: snap.payableDays,
          totalDays: snap.totalDays,
          proratedFixed: snap.proratedFixed,
          percentAmount: snap.percentAmount,
          perGroupAmount: snap.perGroupAmount,
          perStudentAmount: snap.perStudentAmount,
          perHourAmount: snap.perHourAmount,
          studentUnits: snap.studentUnits,
          lessonHours: snap.lessonHours,
          baseEarnings: snap.baseEarnings,
          expectedAmount: snap.expectedAmount,
          workStartDate: snap.workStartDate || null,
          workEndDate: snap.workEndDate || null,
          status: deriveStatus(0, snap.expectedAmount),
          recalculatedAt: new Date(),
        } as never,
      });
      return withLegacyId(created);
    } catch (err: any) {
      if (err?.code === 'P2002') {
        const again = await this.prisma.teacherSalary.findFirst({
          where: { teacherId, groupId, year, month, kind: 'group' },
        });
        return again ? withLegacyId(again) : null;
      }
      throw err;
    }
  }

  // ═══════════════════════════ O'QISH YO'LLARI ═══════════════════════════

  async list({
    groupId, teacherId, year, month, status, kind, search, page = 1, limit = 200,
  }: Record<string, any>) {
    // FILIAL: `TeacherSalary` da `branchId` bor (guruhdan meros).
    const where: Record<string, any> = { ...branchFilter() };
    if (groupId) where.groupId = String(groupId);
    if (teacherId) where.teacherId = String(teacherId);
    // ⚠ `kind` berilmasa — BARCHA turlar (guruh + fiksa + mukofot)
    // qaytadi, chunki o'qituvchining oylik jami aynan shularning
    // yig'indisi.
    if (kind) where.kind = kind;
    if (year) where.year = Number(year);
    if (month) where.month = Number(month);
    if (status) where.status = status;

    // ⚠ QIDIRUV DB DARAJASIDA (filtrga kiradi) — aks holda sahifalab
    // bo'lingandan KEYIN filtrlash noto'g'ri sahifa/total berardi.
    //
    // ⚠ ATAYLAB FARQ (Express izohidan): Mongo varianti `filter.teacher`
    // ni qidiruv natijasi bilan BOSIB KETARDI — o'qituvchi filtri bilan
    // birga qidirilsa filtr jimgina yo'qolib, BOSHQA o'qituvchilar ham
    // chiqib kelardi. Prisma'da ikkala shart AND bilan birlashadi, ya'ni
    // filtr endi HURMAT qilinadi. Bu faqat TORAYTIRADI.
    if (search && String(search).trim()) {
      const q = String(search).trim();
      where.teacher = {
        role: ROLES.TEACHER,
        OR: [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          { username: { contains: q, mode: 'insensitive' } },
        ],
      };
    }

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.teacherSalary.findMany({
        where,
        include: {
          teacher: { select: SAFE_TEACHER_SELECT },
          group: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.teacherSalary.count({ where }),
    ]);
    return { items: withLegacyIds(items), total, page, limit };
  }

  async getById(id: string) {
    const salary = await this.prisma.teacherSalary.findUnique({
      where: { id: String(id) },
      include: {
        teacher: { select: SAFE_TEACHER_SELECT },
        group: { select: { id: true, name: true } },
      },
    });
    if (!salary) throw new ApiError(404, 'Maosh topilmadi');

    const transactions = await this.prisma.salaryTransaction.findMany({
      where: { salaryId: salary.id, isDeleted: false },
      orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
    });

    return withLegacyId({ ...salary, transactions });
  }

  /** Bitta o'qituvchining barcha oylardagi maoshlari + to'lovlari. */
  async historyByTeacher(teacherId: string) {
    const tid = String(teacherId);
    // FILIAL: boshqa filial o'qituvchisining ismi ochilmasin.
    const branchCond = userBranchCondition();
    const teacher = await this.prisma.user.findFirst({
      where: { id: tid, ...(branchCond ? { AND: [branchCond] } : {}) },
      select: SAFE_TEACHER_SELECT,
    });
    if (!teacher) throw new ApiError(404, "O'qituvchi topilmadi");

    // FILIAL: o'qituvchi boshqa filialda ham ishlasa, u yerdagi maoshi
    // shu filial ko'rinishiga chiqmasin.
    const salaries = await this.prisma.teacherSalary.findMany({
      where: { teacherId: tid, ...branchFilter() },
      include: { group: { select: { id: true, name: true } } },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });

    const ids = salaries.map((s) => s.id);
    const txs = ids.length
      ? await this.prisma.salaryTransaction.findMany({
          where: { salaryId: { in: ids }, isDeleted: false },
          orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
        })
      : [];

    const txBySalary = new Map<string, unknown[]>();
    for (const t of txs) {
      const key = String(t.salaryId);
      if (!txBySalary.has(key)) txBySalary.set(key, []);
      txBySalary.get(key)!.push(t);
    }

    const items = salaries.map((s) => ({
      ...s,
      transactions: txBySalary.get(String(s.id)) || [],
    }));

    const totalExpected = items.reduce((a, p) => a + (Number(p.expectedAmount) || 0), 0);
    const totalPaid = items.reduce((a, p) => a + (Number(p.paidAmount) || 0), 0);

    return {
      teacher: withLegacyId(teacher),
      items: withLegacyIds(items),
      summary: {
        months: items.length,
        totalExpected,
        totalPaid,
        totalRemaining: Math.max(0, totalExpected - totalPaid),
      },
    };
  }

  /** O'qituvchining O'ZI uchun moliya ko'rinishi. */
  async myFinance(teacherId: string) {
    return this.historyByTeacher(teacherId);
  }

  /**
   * ═══════════════════════════════════════════════════════════════════
   * JORIY MAOSH HOLATI — "shu daqiqada bu o'qituvchiga qancha qarzmiz?"
   *
   * ⚠ NEGA `historyByTeacher` YETMAYDI: u faqat YARATILGAN oylik
   * qatorlarni qaytaradi, joriy oy qatori esa oy BOSHIDA TO'LIQ summa
   * bilan yaratiladi. Ya'ni 8-avgustda ham 31 kunlik oylik
   * "kutilayotgan" bo'lib turadi va "bugungi kunga qancha ishlab
   * qo'ydi?" degan savolga javob YO'Q. O'qituvchi oy o'rtasida
   * hisob-kitob so'rasa yoki ishdan bo'shasa — AYNAN shu raqam kerak.
   * ═══════════════════════════════════════════════════════════════════
   */
  async balanceByTeacher(teacherId: string, { now = new Date() }: { now?: Date } = {}) {
    const tid = String(teacherId);
    const branchCond = userBranchCondition();
    const teacher = await this.prisma.user.findFirst({
      where: { id: tid, ...(branchCond ? { AND: [branchCond] } : {}) },
      select: { ...SAFE_TEACHER_SELECT, hiredAt: true, terminatedAt: true },
    });
    if (!teacher) throw new ApiError(404, "O'qituvchi topilmadi");

    // ⚠ "Bugun" — MAHALLIY (Asia/Tashkent) kalendar kuni. Yarim tundan
    // keyin UTC bo'yicha hisoblasak kun ORQAGA surilib, bir kunlik
    // maosh yo'qolardi.
    const today = localTodayMidnight(now);
    const year = today.getUTCFullYear();
    const month = today.getUTCMonth() + 1;
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEndExcl = new Date(Date.UTC(year, month, 1));
    const totalDays = daysInMonth(year, month);
    // ⚠ BUGUNGI KUN SANALMAYDI: u hali TUGAMAGAN. 8-avgustda 7 kun
    // ishlangan.
    const elapsedDays = Math.min(
      totalDays,
      Math.max(0, Math.round((today.getTime() - monthStart.getTime()) / DAY)),
    );

    const rows = await this.prisma.teacherSalary.findMany({
      where: { teacherId: tid, ...branchFilter() },
      select: {
        kind: true, year: true, month: true,
        expectedAmount: true, paidAmount: true, payableDays: true,
        workStartDate: true, workEndDate: true,
      },
    });

    // ⚠ O'TGAN OYLAR QOLDIG'I — qator bo'yicha `Math.max(0, …)` BILAN
    // EMAS, SOF ayirma bilan: ortiqcha to'langan oy keyingi oylardan
    // yechilishi kerak. Har qatorni nolga qisib qo'ysak, ortiqcha to'lov
    // JIMGINA yo'qolib, markaz qarzdor bo'lib ko'rinardi.
    // KELAJAK oylar hisobga KIRMAYDI — ular hali ishlanmagan.
    const isPast = (r: any) => r.year < year || (r.year === year && r.month < month);
    const previousRemaining = rows
      .filter(isPast)
      .reduce((s, r) => s + (Number(r.expectedAmount) || 0) - (Number(r.paidAmount) || 0), 0);

    const currentRows = rows.filter((r) => r.year === year && r.month === month);

    const comps = await this.compensationsForRange(tid, monthStart, monthEndExcl);
    const sumSegments = (segs: { amount: number; start: Date; endExcl: Date }[]) =>
      segs.reduce((s, seg) => s + Math.round((seg.amount * segmentDays(seg)) / totalDays), 0);

    const endOfWork = teacher.terminatedAt ? toUtcMidnight(teacher.terminatedAt) : null;
    const toDateLimit =
      endOfWork && endOfWork.getTime() < today.getTime() ? endOfWork : today;

    const fixFull = sumSegments(
      baseSegmentsForMonth(comps, year, month, {
        from: teacher.hiredAt || null, toExcl: endOfWork,
      }),
    );
    const fixToDate = sumSegments(
      baseSegmentsForMonth(comps, year, month, {
        from: teacher.hiredAt || null, toExcl: toDateLimit,
      }),
    );
    const baseRatio = fixFull > 0 ? fixToDate / fixFull : 0;

    /** Guruh qatorining ish oynasi ichida bugungacha o'tgan kunlar ulushi. */
    const groupRatio = (row: any) => {
      const payable = Number(row.payableDays) || 0;
      if (payable <= 0) return 0;
      const start = row.workStartDate
        ? Math.max(monthStart.getTime(), toUtcMidnight(row.workStartDate).getTime())
        : monthStart.getTime();
      // ⚠ `workEndDate` INKLYUZIV oxirgi kun → EKSKLYUZIV chegara +1 kun.
      const rowEnd = row.workEndDate
        ? toUtcMidnight(row.workEndDate).getTime() + DAY
        : monthEndExcl.getTime();
      const endExcl = Math.min(today.getTime(), monthEndExcl.getTime(), rowEnd);
      return Math.min(1, Math.max(0, Math.round((endExcl - start) / DAY)) / payable);
    };

    const ratioFor = (row: any) => {
      // ⚠ Boshlang'ich qoldiq O'TGAN davrga tegishli — u to'liq "ishlab
      // bo'lingan". Pastdagi `groupRatio` ga tushib ketsa `payableDays=0`
      // bo'lgani uchun 0 qaytarardi va qoldiq kartochkada KO'RINMASDI.
      if (row.kind === 'opening') return 1;
      if (row.kind === 'bonus' || row.kind === 'deduction') return 1;
      if (row.kind === 'base') return baseRatio;
      return groupRatio(row);
    };

    // ⚠ Joriy oy qatori HALI YARATILMAGAN bo'lishi mumkin (job oy
    // boshida ishlaydi, o'qituvchi esa oy o'rtasida ishga olingan).
    // O'shanda fiksa stavkadan JONLI hisoblanadi — aks holda yangi
    // xodimning kartochkasi "0 so'm" ko'rsatib, stavka belgilanmagandek
    // tuyulardi.
    const hasBaseRow = currentRows.some((r) => r.kind === 'base');
    const virtualFixFull = hasBaseRow ? 0 : fixFull;
    const virtualFixToDate = hasBaseRow ? 0 : fixToDate;

    const monthlyTotal =
      currentRows.reduce((s, r) => s + (Number(r.expectedAmount) || 0), 0) + virtualFixFull;
    const currentAccrued =
      currentRows.reduce(
        (s, r) => s + Math.round((Number(r.expectedAmount) || 0) * ratioFor(r)), 0,
      ) + virtualFixToDate;
    const currentPaid = currentRows.reduce((s, r) => s + (Number(r.paidAmount) || 0), 0);

    // ── STAVKA (FIKSA) — BUGUN amalda bo'lgani ──
    const activeComp =
      comps.find(
        (c) =>
          toUtcMidnight(c.effectiveFrom).getTime() <= today.getTime() &&
          (!c.effectiveTo || toUtcMidnight(c.effectiveTo).getTime() > today.getTime()),
      ) || null;
    const fixedMonthly =
      activeComp?.baseType === 'fixed_monthly' ? Number(activeComp.baseAmount) || 0 : 0;

    const hiredAt = teacher.hiredAt ? toUtcMidnight(teacher.hiredAt) : null;
    const daysWorked = hiredAt
      ? Math.max(0, Math.round((toDateLimit.getTime() - hiredAt.getTime()) / DAY))
      : null;

    return {
      teacher: withLegacyId(teacher),
      asOf: today,
      year, month, totalDays, elapsedDays,
      hiredAt: teacher.hiredAt || null,
      terminatedAt: teacher.terminatedAt || null,
      daysWorked,
      fixedMonthly,
      monthlyTotal,
      previousRemaining,
      currentAccrued,
      currentPaid,
      totalRemaining: previousRemaining + currentAccrued - currentPaid,
    };
  }

  /** Majburiyatlar: qoldig'i (`expected - paid`) > 0 bo'lgan maoshlar. */
  async obligations({ groupId, year, month }: Record<string, any>) {
    const where: Record<string, any> = { ...branchFilter(), year: Number(year) };
    if (month) where.month = Number(month);
    if (groupId) where.groupId = String(groupId);

    const items = await this.prisma.teacherSalary.findMany({
      where,
      include: {
        teacher: { select: SAFE_TEACHER_SELECT },
        group: { select: { id: true, name: true } },
      },
      orderBy: [{ month: 'asc' }, { createdAt: 'desc' }],
    });

    return withLegacyIds(
      items
        .map((s) => ({
          ...s,
          remaining: Math.max(
            0, (Number(s.expectedAmount) || 0) - (Number(s.paidAmount) || 0),
          ),
        }))
        .filter((s) => s.remaining > 0),
    );
  }
}

export { buildMeta };
