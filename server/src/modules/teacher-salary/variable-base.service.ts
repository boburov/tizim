import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { toUtcMidnight } from '../../common/utils/date.js';
import { getClassDaysInRange } from '../../common/utils/attendance.js';
import { HolidaysService } from '../holidays/index.js';
import {
  LessonCancellationService,
  isCancelledSession,
} from '../../common/helpers/lesson-cancellation.service.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * O'ZGARUVCHI MAOSH BAZALARI — har bir kanal uchun "nimaga ko'paytiriladi".
 * (`variableBase.helper.js` KO'CHIRMASI.)
 *
 * ⚠ BARCHA BAZALAR SEGMENT OYNASI bo'yicha hisoblanadi (OY emas) —
 * stavka oy o'rtasida o'zgarsa har segment O'Z bazasini oladi.
 *
 * PUL TURI: sxemadagi summa ustunlari `Float` (Mongo'da ham `float64`
 * edi), ya'ni Prisma oddiy JS `number` qaytaradi. Decimal/BigInt
 * konvertatsiyasi YO'Q va natija bit-bit bir xil.
 * ═══════════════════════════════════════════════════════════════════════════
 */

const DAY = 24 * 60 * 60 * 1000;

const groupIdOf = (g: Record<string, any> | null): string | null =>
  g?.id ?? g?._id ?? null;

const daysInMonth = (year: number, month: number): number =>
  new Date(Date.UTC(year, month, 0)).getUTCDate();

/** Ikki yarim-ochiq oraliq kesishmasi (ms) — kunlar soni. */
const overlapDays = (
  aStart: number,
  aEndExcl: number,
  bStart: number,
  bEndExcl: number,
): number => {
  const s = Math.max(aStart, bStart);
  const e = Math.min(aEndExcl, bEndExcl);
  return e > s ? Math.round((e - s) / DAY) : 0;
};

/**
 * Segment oy ichida qancha ulush egallaydi
 * (`per_group` / `percent` proratsiyasi uchun).
 */
export const segmentFactor = ({
  year,
  month,
  segStart,
  segEndExcl,
}: {
  year: number;
  month: number;
  segStart: Date;
  segEndExcl: Date;
}): { factor: number; days: number; totalDays: number } => {
  const monthStart = Date.UTC(year, month - 1, 1);
  const monthEndExcl = Date.UTC(year, month, 1);
  const days = overlapDays(
    monthStart,
    monthEndExcl,
    segStart.getTime(),
    segEndExcl.getTime(),
  );
  const total = daysInMonth(year, month);
  return { factor: total > 0 ? days / total : 0, days, totalDays: total };
};

@Injectable()
export class VariableBaseService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly holidays: HolidaysService,
    private readonly cancellations: LessonCancellationService,
  ) {}

  /**
   * `per_student` bazasi: PRORATSIYALANGAN O'QUVCHI-OY ("student units").
   *
   * ⚠ NEGA headcount EMAS: oyning oxirgi kunida qo'shilgan o'quvchi
   * uchun to'liq 50 000 so'm to'lash adolatsiz VA MANIPULYATSIYAGA
   * ochiq bo'lardi (oy oxirida o'quvchi qo'shib maoshni shishirish).
   * Har o'quvchi guruhda o'tkazgan kunlari ulushicha sanaladi:
   * butun oy = 1.0, yarim oy = 0.5.
   *
   * Chiqib ketgan (`leftAt`) o'quvchi ham O'ZI BO'LGAN kunlar uchun
   * sanaladi — o'qituvchi o'sha kunlar unga dars bergan.
   */
  async computeStudentUnits({
    group,
    year,
    month,
    segStart,
    segEndExcl,
  }: {
    group: string;
    year: number;
    month: number;
    segStart: Date;
    segEndExcl: Date;
  }): Promise<{ units: number; headcount: number }> {
    const monthStart = Date.UTC(year, month - 1, 1);
    const monthEndExcl = Date.UTC(year, month, 1);
    const lo = Math.max(monthStart, segStart.getTime());
    const hi = Math.min(monthEndExcl, segEndExcl.getTime());
    if (hi <= lo) return { units: 0, headcount: 0 };

    const memberships = await this.prisma.groupMembership.findMany({
      where: {
        groupId: String(group),
        isDeleted: false,
        joinedAt: { lt: new Date(hi) },
        OR: [{ leftAt: null }, { leftAt: { gt: new Date(lo) } }],
      },
      select: { studentId: true, joinedAt: true, leftAt: true },
    });

    const total = daysInMonth(year, month);
    let units = 0;
    const students = new Set<string>();
    for (const m of memberships) {
      const mStart = toUtcMidnight(m.joinedAt).getTime();
      // ⚠ `leftAt` EXCLUSIVE — a'zolik va davomat bilan bir xil kodlash.
      const mEndExcl = m.leftAt ? toUtcMidnight(m.leftAt).getTime() : Infinity;
      const days = overlapDays(lo, hi, mStart, mEndExcl);
      if (days <= 0) continue;
      units += days / total;
      students.add(String(m.studentId));
    }
    return { units, headcount: students.size };
  }

  /**
   * `per_lesson_hour` bazasi: segment oynasidagi DARS SOATLARI.
   *
   * ⚠ MANBA — `Group.schedule` (versiyalangan) + `Holiday`. DAVOMAT
   * EMAS: o'qituvchi DARS O'TGANI uchun haq oladi, o'quvchilar kelgani
   * uchun emas.
   *
   * ⚠ BEKOR QILINGAN darslar ham chiqariladi — va AYNAN o'quvchi to'lovi
   * bilan BIR XIL manbadan. Ikki joyda ikki xil mantiq bo'lsa: o'quvchi
   * to'lamagan dars uchun o'qituvchiga haq to'lanib, markaz har bekor
   * qilingan darsda zarar ko'rardi.
   */
  async computeLessonHours({
    groupDoc,
    segStart,
    segEndExcl,
  }: {
    groupDoc: Record<string, any> | null;
    segStart: Date;
    segEndExcl: Date;
  }): Promise<{ hours: number; lessons: number }> {
    if (!groupDoc) return { hours: 0, lessons: 0 };
    const from = new Date(segStart);
    // ⚠ `getClassDaysInRange` INKLYUZIV oxirgi kun bilan ishlaydi,
    // segment esa EKSKLYUZIV — shuning uchun bir kun ayiriladi.
    const to = new Date(segEndExcl.getTime() - DAY);
    if (to.getTime() < from.getTime()) return { hours: 0, lessons: 0 };

    const [holidaySet, cancelledSet] = await Promise.all([
      this.holidays.holidayKeySetForRange(from, to),
      this.cancellations.loadCancelledLessonKeys(groupIdOf(groupDoc), from, to),
    ]);
    const sessions = getClassDaysInRange(
      groupDoc as never,
      from,
      to,
      holidaySet,
    ).filter((s) => !isCancelledSession(cancelledSet, s));

    let minutes = 0;
    for (const s of sessions) {
      const [sh, sm] = s.startTime.split(':').map(Number);
      const [eh, em] = s.endTime.split(':').map(Number);
      minutes += eh * 60 + em - (sh * 60 + sm);
    }
    return { hours: minutes / 60, lessons: sessions.length };
  }

  /**
   * `percent` bazasi: guruh oylik tushumi.
   *   `billed`    — `SUM(StudentPayment.expectedAmount)` (eski xulq-atvor).
   *                 O'quvchi to'lamasa ham o'qituvchi oladi: risk 100%
   *                 markazda.
   *   `collected` — `SUM(PaymentTransaction.amount)` — haqiqatda kassaga
   *                 tushgan. Risk o'qituvchi bilan bo'linadi.
   *
   * ⚠ FILIAL FILTRI ATAYLAB YO'Q — guruh ID'si bo'yicha qidirilmoqda va
   * guruh bitta filialga tegishli, demak natija allaqachon filial ichida.
   */
  async computeGroupRevenueBase(
    group: string,
    year: number,
    month: number,
    base = 'billed',
  ): Promise<number> {
    const scope = { groupId: String(group), year, month };

    if (base === 'collected') {
      // `PaymentTransaction` da `isDeleted` HAQIQATAN bor — bekor
      // qilingan to'lov tushumdan chiqarilishi shart.
      const agg = await this.prisma.paymentTransaction.aggregate({
        where: { ...scope, isDeleted: false },
        _sum: { amount: true },
      });
      return Number(agg._sum.amount ?? 0);
    }

    // ⚠ `isDeleted` ATAYLAB YO'Q: `StudentPayment` da bunday ustun umuman
    // MAVJUD EMAS va Mongoose modelida ham softDelete plagini yo'q edi.
    // Bu yerga `isDeleted: false` yozish Prisma'da XATO berardi, filtrni
    // "tuzatib" qo'yish esa hisoblangan tushumni O'ZGARTIRIB yuborardi.
    const agg = await this.prisma.studentPayment.aggregate({
      where: scope,
      _sum: { expectedAmount: true },
    });
    return Number(agg._sum.expectedAmount ?? 0);
  }
}
