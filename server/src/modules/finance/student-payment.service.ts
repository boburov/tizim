import { Inject, Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ApiError } from '../../common/errors/api-error.js';
import { withLegacyId, withLegacyIds } from '../../common/utils/serialize.js';
import { toUtcMidnight } from '../../common/utils/date.js';
import { branchFilter, userBranchCondition } from '../../common/als/branch-context.js';
import { BranchAccessService } from '../../common/rbac/branch-access.service.js';
import { getClassDaysInRange } from '../../common/utils/attendance.js';
import {
  computePaymentSnapshot,
  computeLessonSnapshot,
  deriveStatus,
  type FreezeWindow,
  type Snapshot,
} from '../../common/utils/proration.js';
import {
  LessonCancellationService,
  isCancelledSession,
} from '../../common/helpers/lesson-cancellation.service.js';
import {
  StudentFreezeService,
  isFrozenOn,
} from '../student-freeze/student-freeze.service.js';
import { HolidaysService } from '../holidays/holidays.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O'QUVCHI TO'LOVI (billing) — `finance/services/studentPayment.service.js`.
 *
 * ⚠ TIZIMDAGI ENG NOZIK MOLIYAVIY FAYL. Uni o'zgartirishdan oldin quyidagi
 * uch invariantni tushunish shart:
 *
 * 1. ATOMIKLIK. `paidAmount` va `status` HAR DOIM birga, BITTA amalda
 *    yoziladi:
 *      • `applyPaidDelta`      → xom `UPDATE` (shartli cap ham shu yerda)
 *      • `recalc`/`recalcStatus` → `$transaction` + `SELECT ... FOR UPDATE`
 *    "o'qi → hisobla → saqla" naqshi ikki parallel to'lovda statusni
 *    buzardi.
 *
 * 2. MUZLATILGAN QATORLAR. `writtenOff` (yomon qarz) va `isOpening`
 *    (boshlang'ich qarz) qatorlariga `recalc` TEGMAYDI. Ikkalasi ham
 *    fee/proratsiya/chegirmadan HOSIL BO'LMAGAN — qayta hisoblansa
 *    yopilgan qarz qayta ochilardi yoki qo'lda kiritilgan summa
 *    JIMGINA yo'qolardi.
 *
 * 3. PUL TURI. Ustunlar `numeric(18,2)`. Xom SQL'da `::numeric` kast
 *    ishlatiladi — `::double precision` aniqlikni AYNAN pul yozilayotgan
 *    joyda yo'qotardi.
 *
 * ── QAYTA ISHLATILGAN, TAKRORLANMAGAN ──
 *   `common/utils/proration.ts`      — snapshot matematikasi
 *   `common/utils/attendance.ts`     — `getClassDaysInRange`
 *   `LessonCancellationService`      — bekor qilingan darslar
 *   `StudentFreezeService`           — muzlatish oynalari
 *   `HolidaysService`                — bayram kunlari
 *   `BranchAccessService`            — filial aniqlash
 * ═══════════════════════════════════════════════════════════════════════════
 */

const SAFE_STUDENT_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  username: true,
  phone: true,
} as const;

/**
 * ⚠ GURUH JADVALI RELATION — `getClassDaysInRange` uni TALAB QILADI.
 * Unutilsa massiv bo'sh keladi, dars soni 0 bo'lib qarz JIMGINA nolga
 * tushardi.
 */
const GROUP_FOR_BILLING = {
  id: true,
  startDate: true,
  endDate: true,
  entryBilling: true,
  schedule: {
    select: { day: true, startTime: true, endTime: true, effectiveFrom: true },
  },
} as const;

interface SnapshotWithFull extends Snapshot {
  fullExpectedAmount: number;
}

@Injectable()
export class StudentPaymentService {
  private readonly logger = new Logger('StudentPayment');

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly branchAccess: BranchAccessService,
    private readonly cancellations: LessonCancellationService,
    private readonly freezes: StudentFreezeService,
    private readonly holidays: HolidaysService,
  ) {}

  private db(tx?: any): any {
    return tx || (this.prisma as unknown as any);
  }

  private actorId(u: any): string | null {
    return u?.id || u?._id || null;
  }

  // ══════════════════════════════════════════════════════════════════
  // SNAPSHOT QURISH
  // ══════════════════════════════════════════════════════════════════

  /**
   * Oy oralig'iga tegishli o'quvchi+guruh a'zolik davrlari.
   *
   * ⚠ REJOIN: bir oyda ketib qayta qo'shilsa bir nechta davr qaytadi —
   * proratsiya har birini alohida sanab kunlarni QO'SHADI.
   */
  private async loadMembershipPeriods(
    student: string,
    group: string,
    year: number,
    month: number,
  ) {
    const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const rows = await this.prisma.groupMembership.findMany({
      where: {
        studentId: String(student),
        groupId: String(group),
        isDeleted: false,
        joinedAt: { lte: monthEnd },
        OR: [{ leftAt: null }, { leftAt: { gt: monthStart } }],
      },
      select: { joinedAt: true, leftAt: true },
    });
    return rows.map((r) => ({ joinedAt: r.joinedAt, leftAt: r.leftAt || null }));
  }

  /**
   * Oydagi BARCHA dars sessiyalarining sanalari (kunda bir nechta dars
   * bo'lsa — har biri alohida).
   *
   * ⚠ IKKI XIL CHIQARIB TASHLASH:
   *   BAYRAM       — butun markazga taalluqli (`HolidaysService`)
   *   BEKOR QILISH — FAQAT shu guruhga (o'qituvchi kasal, xona band).
   * Markaz aybi bilan o'tmagan dars uchun o'quvchi TO'LAMAYDI.
   *
   * Kurs tugash sanasi (`endDate`) oy ichida bo'lsa — undan keyin dars
   * hisoblanmaydi.
   */
  private async loadMonthLessonDates(
    groupDoc: any,
    year: number,
    month: number,
  ): Promise<Date[]> {
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    let monthEnd = new Date(Date.UTC(year, month, 0));
    if (groupDoc?.endDate) {
      const end = toUtcMidnight(groupDoc.endDate);
      if (end.getTime() < monthEnd.getTime()) monthEnd = end;
    }
    if (monthEnd.getTime() < monthStart.getTime()) return [];

    const [holidaySet, cancelledSet] = await Promise.all([
      this.holidays.holidayKeySetForRange(monthStart, monthEnd),
      this.cancellations.loadCancelledLessonKeys(
        groupDoc?.id ?? groupDoc?._id,
        monthStart,
        monthEnd,
      ),
    ]);

    return getClassDaysInRange(groupDoc, monthStart, monthEnd, holidaySet)
      .filter((s) => !isCancelledSession(cancelledSet, s))
      .map((s) => toUtcMidnight(s.date));
  }

  /**
   * A'zolik davrlariga (`leftAt` EXCLUSIVE) to'g'ri keladigan va `asOf`
   * sanasigacha (shu kun INKLYUZIV) O'TIB BO'LGAN darslar soni.
   *
   * ⚠ Davrlar a'zolik bo'yicha kesishmaydi, shuning uchun bir dars faqat
   * BIR MARTA sanaladi (`break`).
   */
  private countElapsedLessons(
    lessonDates: Date[],
    periods: { joinedAt?: any; leftAt?: any }[],
    asOf: Date | null,
    freezeWindows: FreezeWindow[] = [],
  ): number {
    const cutoff = asOf ? asOf.getTime() : Infinity;
    let count = 0;
    for (const d of lessonDates) {
      const t = d.getTime();
      // Hali bo'lib o'tmagan dars — accrual QILINMAYDI.
      if (t > cutoff) continue;
      // Muzlatilgan kundagi dars accrual qilinmaydi (o'quvchi to'lamaydi).
      if (freezeWindows.length && isFrozenOn(freezeWindows, t)) continue;
      for (const p of periods) {
        const start = p.joinedAt ? toUtcMidnight(p.joinedAt).getTime() : -Infinity;
        const endExcl = p.leftAt ? toUtcMidnight(p.leftAt).getTime() : Infinity;
        if (t >= start && t < endExcl) {
          count += 1;
          break;
        }
      }
    }
    return count;
  }

  /**
   * Bir o'quvchi+guruh+oy uchun snapshot maydonlari.
   *
   * ── BILLING MODELI: TO'LIQ-OY ──
   *
   * Qarz oy boshidanoq to'liq oylik summa (kunlik/dars asosida O'SMAYDI).
   * A'zolik davri va muzlatishga proratsiya qilinadi:
   *   narx = oylik × (a'zolikdagi darslar / oydagi jami darslar) − chegirma
   *
   * ⚠ Guruh jadvali bo'lmasa (yoki oyda dars yo'q bo'lsa) ESKI kalendar-kun
   * proratsiyasiga qaytadi — shunda jadvalsiz guruhlarda billing yo'qolib
   * qolmaydi.
   */
  private async buildSnapshot({
    student,
    group,
    year,
    month,
    joinedAt,
    leftAt = null,
    periods = null,
  }: {
    student: string;
    group: string;
    year: number;
    month: number;
    joinedAt?: any;
    leftAt?: any;
    periods?: { joinedAt?: any; leftAt?: any }[] | null;
  }): Promise<SnapshotWithFull> {
    const studentId = String(student);
    const groupId = String(group);

    const [feeDoc, discounts, groupDoc, freezeWindows] = await Promise.all([
      this.prisma.groupFee.findUnique({
        where: { groupId_year_month: { groupId, year, month } },
        select: { amount: true },
      }),
      this.prisma.discount.findMany({
        where: {
          studentId,
          groupId,
          isActive: true,
          isDeleted: false,
          OR: [{ scope: 'permanent' }, { scope: 'monthly', year, month }],
        },
      }),
      this.prisma.group.findUnique({
        where: { id: groupId },
        select: GROUP_FOR_BILLING,
      }),
      // ⚠ Muzlatish O'QUVCHI darajasida (barcha guruhlarga taalluqli).
      this.freezes.loadFreezeWindows(studentId),
    ]);

    const baseFee = feeDoc ? (feeDoc.amount as any) : 0;
    const rawPeriods = periods === null ? [{ joinedAt, leftAt }] : periods;

    /**
     * ⚠ KIRISH SIYOSATI (`entryBilling === "full"`): oy o'rtasida kirish
     * narxni KAMAYTIRMAYDI.
     *
     * Amalga oshirish — a'zolik BOSHLANISHINI oy boshiga surish.
     * NEGA aynan shunday: chiqib ketish va muzlatish O'Z KUCHIDA qoladi,
     * ya'ni 5-avgustda qo'shilib 20-avgustda ketgan o'quvchi baribir
     * faqat 20-sanagacha to'laydi. `factor = 1` deb qo'yish esa uni butun
     * oyga to'lattirardi — OLINMAGAN XIZMAT uchun pul undirish.
     *
     * ⚠ FAQAT BIRINCHI (eng erta) davr suriladi. Rejoin holatida keyingi
     * davrlar TEGILMAYDI — oradagi bo'shliq to'lanmaydi. Hammasini
     * sursak, o'sha bo'shliq ham hisoblanib ketardi.
     */
    const fullEntry = groupDoc?.entryBilling === 'full';
    const monthStart = new Date(Date.UTC(year, month - 1, 1));

    let effPeriods = rawPeriods;
    if (fullEntry && rawPeriods.length) {
      const msOf = (p: any) =>
        p.joinedAt ? toUtcMidnight(p.joinedAt).getTime() : -Infinity;
      let firstIdx = 0;
      for (let i = 1; i < rawPeriods.length; i += 1) {
        if (msOf(rawPeriods[i]) < msOf(rawPeriods[firstIdx])) firstIdx = i;
      }
      effPeriods = rawPeriods.map((p, i) =>
        i === firstIdx ? { ...p, joinedAt: monthStart } : p,
      );
    }

    const lessonDates = groupDoc
      ? await this.loadMonthLessonDates(groupDoc, year, month)
      : [];

    // Jadval/dars yo'q → orqaga-moslik uchun kalendar-kun proratsiyasi.
    if (lessonDates.length === 0) {
      const snap = computePaymentSnapshot({
        baseFee,
        year,
        month,
        joinedAt: fullEntry ? monthStart : joinedAt,
        leftAt,
        periods: periods === null ? null : effPeriods,
        discounts,
        freezeWindows,
      });
      return { ...snap, fullExpectedAmount: snap.expectedAmount };
    }

    const monthEnd = new Date(Date.UTC(year, month, 0));

    /**
     * ⚠⚠ MAXRAJ — oyning TO'LIQ dars rejasi, guruh boshlanish sanasi
     * bilan QIRQILMAGAN.
     *
     * `loadMonthLessonDates` darslarni `startDate` dan boshlab beradi,
     * ya'ni guruh 5-sanada boshlansa BIRINCHI oyda maxraj ham qisqarardi
     * va nisbat HAR DOIM 1 chiqardi — guruh oy o'rtasida boshlansa ham
     * har doim to'liq oylik olinardi, TANLOVSIZ.
     *
     * `endDate` esa ATAYLAB qirqilaveradi: kursning TUGASHI kirish
     * siyosatiga aloqador emas.
     *
     * Qo'shimcha so'rov FAQAT guruhning birinchi oyida bajariladi.
     */
    const gStart = groupDoc?.startDate ? toUtcMidnight(groupDoc.startDate) : null;
    const startsMidMonth =
      gStart &&
      gStart.getUTCFullYear() === year &&
      gStart.getUTCMonth() + 1 === month &&
      gStart.getUTCDate() > 1;

    const planDates =
      !fullEntry && startsMidMonth
        ? await this.loadMonthLessonDates({ ...groupDoc, startDate: null }, year, month)
        : lessonDates;

    const totalLessons = planDates.length;
    const elapsedLessons = this.countElapsedLessons(
      lessonDates,
      effPeriods,
      monthEnd,
      freezeWindows,
    );

    const snap = computeLessonSnapshot({
      baseFee,
      totalLessons,
      elapsedLessons,
      discounts,
    });

    // `expectedAmount` to'liq-oy obligatsiyasiga teng — ortiqcha to'lov
    // AYNAN shu chegaraga nisbatan o'lchanadi.
    return { ...snap, fullExpectedAmount: snap.expectedAmount };
  }

  /**
   * ⚠ `fullExpectedAmount` — HISOB natijasi, USTUN EMAS.
   *
   * Mongoose sxema tashqarisidagi maydonni jimgina tashlab yuborardi;
   * Prisma esa "Unknown argument" bilan YIQILADI.
   */
  private toPaymentColumns(snap: Snapshot) {
    return {
      baseFee: snap.baseFee,
      prorationFactor: snap.prorationFactor,
      discountApplied: snap.discountApplied,
      expectedAmount: snap.expectedAmount,
    };
  }
  // ══════════════════════════════════════════════════════════════════
  // YOZISH — ATOMIK YO'LLAR
  // ══════════════════════════════════════════════════════════════════

  /**
   * `paidAmount` ni ATOMIK delta bilan o'zgartiradi va statusni SHU
   * yozuvning BAZADAGI JORIY qiymatlaridan keltirib chiqaradi.
   *
   * Parallel tranzaksiyalar KOMMUTATIV qo'shiladi — hech biri yo'qolmaydi.
   *
   * ⚠ `capToRemaining = true`: yangi `paidAmount` `expectedAmount` dan
   * oshadigan bo'lsa qator YANGILANMAYDI (`null` qaytadi). Bu plan
   * qoldig'idan ORTIQ to'lovni SHARTLI-ATOMIK to'sish — parallel
   * double-click ham capdan o'tmaydi. JS'da tekshirish poyga ochardi.
   *
   * ⚠⚠ NEGA `::numeric`, `::double precision` EMAS.
   *
   * Ustun `numeric(18,2)`. Delta `::double precision` ga kastlansa
   * Postgres BUTUN ifodani suzuvchi nuqtada hisoblaydi va natijani
   * ustunga qaytarishda yana numeric'ga keltiradi — ya'ni aniqlik AYNAN
   * pul yozilayotgan joyda yo'qoladi. Bu JIMGINA bo'lardi: bitta
   * to'lovda emas, minglab to'lovdan keyin kassa qoldig'i bilan hisobot
   * farq qila boshlardi. Cap sharti ham shu sababdan numeric.
   *
   * ⚠ `updatedAt` OCHIQ yoziladi: Prisma `@updatedAt` KLIENT tomonida
   * ishlaydi, xom SQL uni chetlab o'tadi.
   */
  async applyPaidDelta(
    paymentId: string,
    delta: number,
    { tx, capToRemaining = false }: { tx?: any; capToRemaining?: boolean } = {},
  ) {
    const client = this.db(tx);
    const id = String(paymentId);
    const d = Number(delta) || 0;

    const setClause = Prisma.sql`
      SET "paidAmount" = COALESCE("paidAmount", 0) + ${d}::numeric,
          "status"     = CASE
            WHEN COALESCE("paidAmount", 0) + ${d}::numeric <= 0
              THEN 'unpaid'::"PayStatus"
            WHEN COALESCE("paidAmount", 0) + ${d}::numeric < "expectedAmount"
              THEN 'partial'::"PayStatus"
            ELSE 'paid'::"PayStatus"
          END,
          "updatedAt"  = NOW()
    `;

    const affected = capToRemaining
      ? await client.$executeRaw`
          UPDATE "student_payments" ${setClause}
          WHERE "id" = ${id}
            AND COALESCE("paidAmount", 0) + ${d}::numeric <= "expectedAmount"
        `
      : await client.$executeRaw`
          UPDATE "student_payments" ${setClause}
          WHERE "id" = ${id}
        `;

    if (affected === 0) return null;
    return client.studentPayment.findUnique({ where: { id } });
  }

  /**
   * Faol (o'chirilmagan) tranzaksiyalar YIG'INDISIDAN `paidAmount`/`status`
   * ni TIKLAYDI (repair/recalc yo'li).
   *
   * ⚠ Qator QULFLANADI (`FOR UPDATE`) — stale save yo'q.
   */
  async recalcStatus(paymentId: string) {
    const id = String(paymentId);
    const agg = await this.prisma.paymentTransaction.aggregate({
      where: { paymentId: id, isDeleted: false },
      _sum: { amount: true },
    });
    const paidAmount = (agg._sum.amount as any) ?? 0;

    return (this.prisma as any).$transaction(async (tx: any) => {
      const rows = await tx.$queryRaw`
        SELECT "expectedAmount" FROM "student_payments" WHERE "id" = ${id} FOR UPDATE
      `;
      if (!rows.length) return null;
      const expected = Number(rows[0].expectedAmount) || 0;
      return tx.studentPayment.update({
        where: { id },
        data: { paidAmount, status: deriveStatus(paidAmount, expected) },
      });
    });
  }

  /**
   * Snapshot (fee/proratsiya/chegirma) ni QAYTA HISOBLAB, statusni ham
   * yangilaydi.
   *
   * Status BAZADAGI JORIY `paidAmount` dan keltirib chiqariladi (qator
   * qulflanadi) — hisob davomida kelib tushgan PARALLEL to'lov statusni
   * buzmaydi.
   *
   * ⚠⚠ IKKI TUR QATOR MUZLATILGAN — VA BU YAGONA HIMOYA NUQTASI.
   *
   * `recalcForGroupMonth`, `recalcForStudent`, `recalcForStudentScope` va
   * kunlik `accrueMonth` job'i — HAMMASI shu funksiyaga kelib taqaladi.
   *
   *   `writtenOff` — yomon qarz. Qayta hisoblansa kunlik accrual YOPILGAN
   *                  qarzni QAYTA OCHIB yuborardi.
   *   `isOpening`  — boshlang'ich qarz. `expectedAmount` QO'LDA kiritilgan
   *                  summa: u fee/proratsiya/chegirmadan hosil BO'LMAGAN,
   *                  chunki o'sha davrda tizim yo'q edi. `buildSnapshot`
   *                  a'zolik davrlarini topa olmay 0 qaytarardi va qarz
   *                  JIMGINA YO'QOLARDI.
   */
  async recalc(paymentId: string, { tx }: { tx?: any } = {}) {
    const client = this.db(tx);
    const id = String(paymentId);
    const payment: any = await client.studentPayment.findUnique({ where: { id } });
    if (!payment) return null;

    if (payment.writtenOff) return withLegacyId(payment);
    if (payment.isOpening) return withLegacyId(payment);

    /**
     * ⚠ Shu oydagi BARCHA a'zolik davrlari (rejoin holatida bir nechta)
     * bo'yicha hisoblaymiz — bitta `membership` ref'iga tayanib
     * qolmaymiz, aks holda ketib-qaytgan o'quvchining IKKINCHI davri
     * billing'dan tushib qolardi.
     */
    const periods = await this.loadMembershipPeriods(
      payment.studentId,
      payment.groupId,
      payment.year,
      payment.month,
    );

    const snap = await this.buildSnapshot({
      student: payment.studentId,
      group: payment.groupId,
      year: payment.year,
      month: payment.month,
      // ⚠ HAR DOIM haqiqiy davrlar massivi: bo'sh bo'lsa (o'quvchi shu
      // oyda guruhda yo'q) `expected = 0` bo'ladi — TO'LIQ OY billing'iga
      // default QILMAYMIZ.
      periods,
    });

    const runUpdate = async (c: any) => {
      const rows = await c.$queryRaw`
        SELECT "paidAmount" FROM "student_payments" WHERE "id" = ${id} FOR UPDATE
      `;
      if (!rows.length) return null;
      const paid = Number(rows[0].paidAmount) || 0;
      return c.studentPayment.update({
        where: { id },
        data: {
          ...this.toPaymentColumns(snap),
          status: deriveStatus(paid, snap.expectedAmount),
          recalculatedAt: new Date(),
        },
      });
    };

    // ⚠ Chaqiruvchi allaqachon tranzaksiya ichida bo'lsa YANGISINI ochib
    // bo'lmaydi (Prisma ichma-ich tranzaksiyani qo'llamaydi) — o'sha
    // klientda ishlaymiz, qulf baribir o'sha tranzaksiyaga tegishli.
    const updated = tx
      ? await runUpdate(tx)
      : await (this.prisma as any).$transaction(runUpdate);

    /**
     * ORTIQCHA TO'LOVNI DEPOZITGA QAYTARISH.
     *
     * ⚠ Taqqoslash `accrued expected` ga EMAS, TO'LIQ-OY obligatsiyasiga
     * (`fullExpectedAmount`) nisbatan — shunda dars-asosli accrual paytida
     * AVANS (oldindan to'lov) har kuni depozitga ko'chib ketmaydi; faqat
     * butun oy narxidan ORTIQ to'langan qism qaytadi.
     *
     * ⚠ FAQAT tranzaksiyasiz (recompute kaskadi) — yaratish (`tx`)
     * oqimida EMAS.
     *
     * ⚠ KECH BOG'LASH (`onOverpay`): `deposits` bu servisga tayanadi,
     * shuning uchun teskari yo'nalish modul AYLANASINI tug'dirardi.
     * Express ham aynan shu joyda dinamik `import()` ishlatadi.
     */
    const fullExpected = snap.fullExpectedAmount ?? snap.expectedAmount;
    if (!tx && updated && ((updated as any).paidAmount || 0) > fullExpected) {
      try {
        if (this.onOverpay) {
          await this.onOverpay((updated as any).id, fullExpected);
        }
      } catch (err: any) {
        this.logger.warn(
          `Depozit ortiqcha qoplama qayta hisoblanmadi: ${err?.message}`,
        );
      }
    }
    return updated ? withLegacyId(updated) : null;
  }

  /**
   * ORTIQCHA TO'LOV QAYTA ISHLOVCHISI — `DepositsModule` ishga tushishda
   * o'rnatadi (`reconcileDepositOverpay`).
   *
   * ⚠ `null` bo'lsa qadam JIMGINA o'tkazib yuboriladi. Bu Express bilan
   * bir xil: u yerda ham chaqiruv `try/catch` ichida va yiqilsa faqat
   * WARN yoziladi — ortiqcha to'lov keyingi `recalc` da qaytariladi.
   */
  onOverpay: ((paymentId: string, capAmount: number) => Promise<void>) | null = null;

  // ══════════════════════════════════════════════════════════════════
  // QAYTA HISOBLASH KASKADLARI
  // ══════════════════════════════════════════════════════════════════

  /** Guruh+oy bo'yicha barcha to'lovlar (fee o'zgarganda). */
  async recalcForGroupMonth(group: string, year: number, month: number) {
    const payments = await this.prisma.studentPayment.findMany({
      where: { groupId: String(group), year, month },
      select: { id: true },
    });
    for (const p of payments) {
      // eslint-disable-next-line no-await-in-loop
      await this.recalc(p.id);
    }
    return payments.length;
  }

  /**
   * O'quvchi+guruh chegirmasi o'zgarganda tegishli oylar.
   * `monthly` → faqat shu oy; `permanent` → barcha mavjud oylar.
   */
  async recalcForStudentScope(
    student: string,
    group: string,
    { scope, year, month }: { scope?: string; year?: number; month?: number } = {},
  ) {
    const where: any = { studentId: String(student), groupId: String(group) };
    if (scope === 'monthly' && year && month) {
      where.year = year;
      where.month = month;
    }
    const payments = await this.prisma.studentPayment.findMany({
      where,
      select: { id: true },
    });
    for (const p of payments) {
      // eslint-disable-next-line no-await-in-loop
      await this.recalc(p.id);
    }
    return payments.length;
  }

  /** O'quvchining tegishli BARCHA guruh/oy to'lovlari. */
  async recalcForStudent(student: string) {
    const payments = await this.prisma.studentPayment.findMany({
      where: { studentId: String(student) },
      select: { id: true },
    });
    for (const p of payments) {
      // eslint-disable-next-line no-await-in-loop
      await this.recalc(p.id);
    }
    return payments.length;
  }

  /**
   * Berilgan oydagi barcha to'lovlar — dars-asosli accrual'ni bir kunga
   * OLDINGA suradi (o'tib bo'lgan yangi dars(lar) qarzga qo'shiladi).
   *
   * ⚠ Kunlik job chaqiradi. BITTA yozuvdagi xato butun jarayonni
   * TO'XTATMAYDI.
   */
  async accrueMonth(year: number, month: number) {
    const payments = await this.prisma.studentPayment.findMany({
      where: { year, month },
      select: { id: true },
    });
    let recalculated = 0;
    for (const p of payments) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await this.recalc(p.id);
        recalculated += 1;
      } catch (err: any) {
        this.logger.warn(
          `Kunlik accrual recalc xatosi (payment=${p.id}): ${err?.message}`,
        );
      }
    }
    return { total: payments.length, recalculated };
  }

  /**
   * Berilgan `(year, month)` chegarasidan OLDINGI oylarda o'quvchining shu
   * guruhda to'lov qilingan (`paidAmount > 0`) yozuvi bormi — eng erta
   * to'langan oyni qaytaradi.
   *
   * ⚠ `joinedAt` ni OLDINGA surishni qulflashda ishlatiladi: to'langan
   * davrni "men keyinroq qo'shilganman" deb O'CHIRIB BO'LMAYDI.
   */
  async earliestPaidMonthBefore(
    student: string,
    group: string,
    { year, month }: { year: number; month: number },
  ) {
    const beforeIdx = year * 12 + (month - 1);
    const paid = await this.prisma.studentPayment.findMany({
      where: {
        studentId: String(student),
        groupId: String(group),
        paidAmount: { gt: 0 },
      },
      select: { year: true, month: true },
    });
    let best: { year: number; month: number } | null = null;
    let bestIdx = Infinity;
    for (const p of paid) {
      const idx = p.year * 12 + (p.month - 1);
      if (idx < beforeIdx && idx < bestIdx) {
        bestIdx = idx;
        best = { year: p.year, month: p.month };
      }
    }
    return best;
  }
  // ══════════════════════════════════════════════════════════════════
  // QARZ — QOLDIQ, TAQSIMOT, HISOBDAN CHIQARISH
  // ══════════════════════════════════════════════════════════════════

  /**
   * Qoldiq sharti — USTUNNI USTUNGA solishtirish.
   * Mongo `$expr: { $gt: [...] }` → Prisma "field reference".
   */
  private outstanding() {
    return {
      expectedAmount: { gt: (this.prisma as any).studentPayment.fields.paidAmount },
    };
  }

  /**
   * O'quvchining shu guruhda FAOL qarzi bormi.
   *
   * ⚠ Hisobdan chiqarilgan (`writtenOff`) qarz FAOL qarz EMAS.
   */
  async hasOutstandingDebtInGroup(student: string, group: string): Promise<boolean> {
    return Boolean(
      await this.prisma.studentPayment.findFirst({
        where: {
          studentId: String(student),
          groupId: String(group),
          writtenOff: false,
          ...(this.outstanding() as any),
        },
        select: { id: true },
      }),
    );
  }

  /**
   * FAOL qarzni oy-ma-oy taqsimlab qaytaradi.
   *
   * Chiqarish modalidagi summa VA write-off shu funksiyaga tayanadi —
   * ya'ni ko'rsatilgan raqam bilan yopiladigan raqam BIR MANBADAN.
   */
  async getOutstandingBreakdownInGroup(student: string, group: string) {
    const payments = await this.prisma.studentPayment.findMany({
      where: {
        studentId: String(student),
        groupId: String(group),
        writtenOff: false,
        ...(this.outstanding() as any),
      },
      select: {
        id: true, year: true, month: true,
        expectedAmount: true, paidAmount: true,
      },
      orderBy: [{ year: 'asc' }, { month: 'asc' }],
    });

    const items = payments.map((p: any) => ({
      paymentId: p.id,
      year: p.year,
      month: p.month,
      amount: Math.max(0, (p.expectedAmount || 0) - (p.paidAmount || 0)),
    }));
    const total = items.reduce((s, it) => s + it.amount, 0);
    return { total, items };
  }

  /**
   * FAOL qarzni YOMON QARZ (write-off) sifatida yopadi:
   *   1) har bir qarzli oy `writtenOff = true` + `writeOffAmount`;
   *   2) BITTA `DebtWriteOff` audit yozuvi (breakdown bilan).
   *
   * Yopilgan qarz endi faol qarz emas va accrual `recalc` uni QAYTA
   * OCHMAYDI (`recalc` dagi `writtenOff` to'sig'i).
   *
   * ⚠⚠ ATOMIKLIK — HAQIQIY YAXSHILANISH. Mongo variantida to'lov
   * qatorlari va audit yozuvi ALOHIDA yozilardi. Ikkinchisi yiqilsa qarz
   * "yopilgan" bo'lib qolar, lekin uni KIM va NEGA yopgani hech qayerda
   * qolmasdi — hisobotda SABABSIZ YO'QOLGAN PUL. Endi bitta tranzaksiyada.
   */
  async writeOffDebtInGroup(
    student: string,
    group: string,
    {
      membershipId = null,
      currentUser = null,
      reasonTitle = '',
    }: { membershipId?: string | null; currentUser?: any; reasonTitle?: string } = {},
  ) {
    const studentId = String(student);
    const groupId = String(group);

    const { total, items } = await this.getOutstandingBreakdownInGroup(
      studentId,
      groupId,
    );
    if (total <= 0) return null;

    const [studentDoc, groupDoc] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: studentId },
        select: { firstName: true, lastName: true },
      }),
      this.prisma.group.findUnique({ where: { id: groupId }, select: { name: true } }),
    ]);
    const studentName = studentDoc
      ? `${studentDoc.firstName || ''} ${studentDoc.lastName || ''}`.trim()
      : '';

    const now = new Date();

    const writeOff = await (this.prisma as any).$transaction(async (tx: any) => {
      await Promise.all(
        items.map((it) =>
          tx.studentPayment.update({
            where: { id: it.paymentId },
            data: { writtenOff: true, writeOffAmount: it.amount, writeOffAt: now },
          }),
        ),
      );

      return tx.debtWriteOff.create({
        data: {
          studentId,
          groupId,
          membershipId: membershipId ? String(membershipId) : null,
          amount: total,
          // ⚠ Mongo'da EMBEDDED massiv edi; Prisma'da alohida jadval —
          // ichma-ich `create` bilan yoziladi.
          breakdown: {
            create: items.map((it) => ({
              paymentId: it.paymentId,
              year: it.year,
              month: it.month,
              amount: it.amount,
            })),
          },
          reasonTitle: reasonTitle || '',
          studentName,
          groupName: groupDoc?.name || '',
          createdById: this.actorId(currentUser),
        },
        include: { breakdown: true },
      });
    });

    return { amount: total, writeOff: withLegacyId(writeOff) };
  }

  // ══════════════════════════════════════════════════════════════════
  // YARATISH
  // ══════════════════════════════════════════════════════════════════

  /**
   * Bitta a'zolik uchun shu oy to'lovini yaratadi (o'quvchi guruhga
   * qo'shilganda).
   *
   * ⚠⚠ `isOpening: false` KALITNING BIR QISMI. Boshlang'ich qarz qatori
   * shu oyda YONMA-YON turgan bo'lishi mumkin. Uni "plan allaqachon bor"
   * deb qabul qilsak, o'quvchining HAQIQIY oylik plani umuman
   * yaratilmay qolardi (`recalc` uni muzlatilgan deb darhol qaytaradi) —
   * ya'ni OY BEPUL bo'lib ketardi.
   */
  async ensurePaymentForMembership(
    membership: any,
    year: number,
    month: number,
    { tx }: { tx?: any } = {},
  ) {
    if (!membership) return null;
    const client = this.db(tx);
    const studentId = String(membership.studentId ?? membership.student);
    const groupId = String(membership.groupId ?? membership.group);
    const membershipId = String(membership.id ?? membership._id);

    const exists: any = await client.studentPayment.findUnique({
      where: {
        studentId_groupId_year_month_isOpening: {
          studentId, groupId, year, month, isOpening: false,
        },
      },
    });
    if (exists) {
      /**
       * ⚠ REJOIN: shu oyda to'lov allaqachon bor (ESKI a'zolikniki). Uni
       * JORIY a'zolikka ulab, BARCHA davrlar bo'yicha qayta hisoblaymiz —
       * aks holda yangi davr kunlari billing'ga KIRMAY qolardi.
       */
      if (String(exists.membershipId) !== membershipId) {
        await client.studentPayment.update({
          where: { id: exists.id },
          data: { membershipId },
        });
      }
      return this.recalc(exists.id, { tx });
    }

    const snap = await this.buildSnapshot({
      student: studentId,
      group: groupId,
      year,
      month,
      joinedAt: membership.joinedAt,
      leftAt: membership.leftAt || null,
    });

    /**
     * ⚠ FILIAL guruhdan MEROS. Bu funksiya fon vazifalaridan ham
     * chaqiriladi (u yerda foydalanuvchi konteksti YO'Q), shuning uchun
     * ALS kontekstiga tayanib bo'lmaydi — guruh yagona to'g'ri manba.
     */
    const branchId = await this.branchAccess.resolveBranchFromGroup(groupId);

    try {
      const created = await client.studentPayment.create({
        data: {
          branchId,
          studentId,
          groupId,
          membershipId,
          year,
          month,
          // `fullExpectedAmount` ustun EMAS — ajratib olinadi.
          ...this.toPaymentColumns(snap),
          paidAmount: 0,
          status: deriveStatus(0, snap.expectedAmount),
          recalculatedAt: new Date(),
        },
      });
      return withLegacyId(created);
    } catch (err: any) {
      // Unique indeks POYGA holati (parallel generatsiya) — mavjudni qaytaramiz.
      if (err?.code === 'P2002') {
        const again = await client.studentPayment.findUnique({
          where: {
            studentId_groupId_year_month_isOpening: {
              studentId, groupId, year, month, isOpening: false,
            },
          },
        });
        return again ? withLegacyId(again) : null;
      }
      throw err;
    }
  }

  /**
   * Berilgan oy uchun BARCHA faol a'zoliklarga to'lov yaratadi
   * (job + regenerate).
   *
   * ⚠ Faol a'zolar + shu OY ICHIDA ketganlar (`leftAt` exclusive: oy
   * boshidan KEYIN ketgan bo'lsa, oy boshida hali a'zo edi — prorated
   * to'lov yozuvi TEGISHLI). Aks holda kechiktirilgan regenerate oy
   * o'rtasida ketganlarning haqini TASHLAB KETARDI.
   */
  async generateMonth(year: number, month: number) {
    const activeGroups = await this.prisma.group.findMany({
      where: { isActive: true, isDeleted: false },
      select: { id: true },
    });
    const ids = activeGroups.map((g) => g.id);

    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const memberships = ids.length
      ? await this.prisma.groupMembership.findMany({
          where: {
            groupId: { in: ids },
            isDeleted: false,
            OR: [{ leftAt: null }, { leftAt: { gt: monthStart } }],
          },
        })
      : [];

    let created = 0;
    for (const m of memberships as any[]) {
      // ⚠ `isOpening: false` — boshlang'ich qarz qatori oylik planning
      // o'rnini BOSA OLMAYDI.
      // eslint-disable-next-line no-await-in-loop
      const existed = await this.prisma.studentPayment.findUnique({
        where: {
          studentId_groupId_year_month_isOpening: {
            studentId: m.studentId, groupId: m.groupId, year, month, isOpening: false,
          },
        },
        select: { id: true },
      });
      if (existed) continue;
      // eslint-disable-next-line no-await-in-loop
      await this.ensurePaymentForMembership(m, year, month);
      created += 1;
    }
    return { memberships: memberships.length, created };
  }

  // ══════════════════════════════════════════════════════════════════
  // O'QISH
  // ══════════════════════════════════════════════════════════════════

  /**
   * Qarzdorlar: qoldig'i (`expected − paid`) > 0 bo'lgan o'quvchilar.
   *
   * ⚠ Write-off qilingan yozuvlar FAOL qarzdan chiqarib tashlanadi — ular
   * endi undiriladigan qarz emas, alohida "Yomon qarzlar" bo'limida.
   *
   * `month` berilmasa — tanlangan YILNING barcha oylari (har oy alohida
   * qator).
   */
  async obligations({
    groupId,
    year,
    month,
  }: { groupId?: string; year: number | string; month?: number | string }) {
    // FILIAL: `StudentPayment` da `branchId` bor (guruhdan meros) —
    // `list()` dagi bilan AYNI filtr. Bu yerda filtr yo'q edi va A filial
    // direktori butun markazning qarzdorlarini (ism, guruh, summa)
    // ko'rardi; o'qituvchi tomonidagi egizagi esa to'g'ri kesilgan.
    const where: any = { ...branchFilter(), year: Number(year), writtenOff: false };
    if (month) where.month = Number(month);
    if (groupId) where.groupId = String(groupId);

    const items = await this.prisma.studentPayment.findMany({
      where,
      include: {
        student: { select: SAFE_STUDENT_SELECT },
        group: { select: { id: true, name: true } },
      },
      orderBy: [{ month: 'asc' }, { createdAt: 'desc' }],
    });

    return withLegacyIds(
      (items as any[])
        .map((p) => ({
          ...p,
          remaining: Math.max(0, p.expectedAmount - p.paidAmount),
        }))
        .filter((p) => p.remaining > 0),
    );
  }

  /**
   * To'lovlar ro'yxati.
   *
   * ⚠ FARQ (ATAYLAB): Mongo varianti `filter.student` ni qidiruv natijasi
   * bilan BOSIB KETARDI — guruh+qidiruv birga ishlatilsa filtr
   * YO'QOLARDI. Prisma'da ikkala shart `AND` bilan birlashadi
   * (kesishma), ya'ni faqat TORAYTIRADI.
   */
  async list({
    groupId, year, month, status, search, page = 1, limit = 50,
  }: {
    groupId?: string; year?: number | string; month?: number | string;
    status?: string; search?: string; page?: number; limit?: number;
  }) {
    // FILIAL: `StudentPayment` da `branchId` bor (guruhdan meros).
    const where: any = { ...branchFilter() };
    if (groupId) where.groupId = String(groupId);
    if (year) where.year = Number(year);
    if (month) where.month = Number(month);
    if (status) where.status = status;

    if (search && search.trim()) {
      const q = search.trim();
      where.student = {
        role: 'student',
        OR: [
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
          { username: { contains: q, mode: 'insensitive' } },
        ],
      };
    }

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      this.prisma.studentPayment.findMany({
        where,
        include: {
          student: { select: SAFE_STUDENT_SELECT },
          group: { select: { id: true, name: true } },
        },
        // ⚠ IKKINCHI KALIT (`id`) ATAYLAB: `createdAt` YAGONA EMAS —
        // oylik generatsiya bir necha planni AYNI millisekundda
        // yaratadi. Yagona bo'lmagan saralash kaliti bilan Postgres
        // tartibni KAFOLATLAMAYDI: bir xil so'rov har safar boshqa
        // tartib berishi va sahifalashda qator TUSHIB QOLISHI yoki
        // TAKRORLANISHI mumkin. O'LCHANGAN: paritet testi shu sababdan
        // tasodifan qizil bo'lgan.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip,
        take: limit,
      }),
      this.prisma.studentPayment.count({ where }),
    ]);

    return { items: withLegacyIds(items), total, page, limit };
  }

  async getById(id: string) {
    // FILIAL: `list()` to'g'ri kesilgan, lekin uning `:id` egizagi ochiq
    // qolgan edi — ID'ni qo'lda berib boshqa filial to'lovi (o'quvchi
    // ismi, telefoni, tranzaksiyalari) ochilardi.
    // ⚠ 404, 403 EMAS: yozuv MAVJUDLIGI ham oshkor bo'lmasin.
    const payment = await this.prisma.studentPayment.findFirst({
      where: { id: String(id), ...branchFilter() },
      include: {
        student: { select: SAFE_STUDENT_SELECT },
        group: { select: { id: true, name: true } },
        membership: { select: { id: true, joinedAt: true } },
      },
    });
    if (!payment) throw new ApiError(404, "To'lov topilmadi");

    const transactions = await this.prisma.paymentTransaction.findMany({
      where: { paymentId: payment.id, isDeleted: false },
      orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
    });

    return withLegacyId({ ...payment, transactions });
  }

  /**
   * Bitta o'quvchining BARCHA oylardagi to'lovlari + tranzaksiyalari.
   *
   * ⚠ IKKI QATLAMLI FILIAL HIMOYASI:
   *   1. o'quvchining O'ZI ko'lamda bo'lishi shart — aks holda 404
   *      (403 EMAS: mavjudligini ham oshkor qilmaymiz);
   *   2. to'lovlar ham `branchFilter()` bilan kesiladi — o'quvchi boshqa
   *      filialda ham to'lagan bo'lsa, u yerdagi to'lovlari SHU filial
   *      ko'rinishiga chiqmasin.
   */
  async historyByStudent(studentId: string) {
    const sid = String(studentId);
    const branchCond = userBranchCondition();
    const student = await this.prisma.user.findFirst({
      where: { id: sid, ...(branchCond ? { AND: [branchCond] } : {}) } as any,
      select: SAFE_STUDENT_SELECT,
    });
    if (!student) throw new ApiError(404, "O'quvchi topilmadi");

    const payments = await this.prisma.studentPayment.findMany({
      where: { studentId: sid, ...branchFilter() },
      include: { group: { select: { id: true, name: true } } },
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
    });

    const ids = payments.map((p) => p.id);
    const txs = ids.length
      ? await this.prisma.paymentTransaction.findMany({
          where: { paymentId: { in: ids }, isDeleted: false },
          orderBy: [{ paidAt: 'desc' }, { createdAt: 'desc' }],
        })
      : [];

    const txByPayment = new Map<string, any[]>();
    for (const t of txs as any[]) {
      const key = String(t.paymentId);
      if (!txByPayment.has(key)) txByPayment.set(key, []);
      txByPayment.get(key)!.push(t);
    }

    const items = (payments as any[]).map((p) => ({
      ...p,
      transactions: txByPayment.get(String(p.id)) || [],
    }));

    const totalExpected = items.reduce((s, p) => s + (p.expectedAmount || 0), 0);
    const totalPaid = items.reduce((s, p) => s + (p.paidAmount || 0), 0);

    return {
      student: withLegacyId(student),
      items: withLegacyIds(items),
      summary: {
        months: items.length,
        totalExpected,
        totalPaid,
        totalRemaining: Math.max(0, totalExpected - totalPaid),
      },
    };
  }
}
