import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { localTodayMidnight } from '../../common/utils/date.js';
import { GroupFeeService } from '../../modules/finance/group-fee.service.js';
import { StudentPaymentService } from '../../modules/finance/student-payment.service.js';
import { DepositsService } from '../../modules/deposits/deposits.service.js';
import { StaffPayrollService } from '../../modules/staff-payroll/staff-payroll.service.js';
import { TeacherSalaryService } from '../../modules/teacher-salary/teacher-salary.service.js';
import { TeacherGroupPeriodService } from '../../modules/groups/teacher-group-period.service.js';
import { SystemNotificationsService } from '../../modules/system-notifications/system-notifications.service.js';
import type { JobDefinition } from '../job.types.js';

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * OYLIK GENERATSIYA — uchta job, 1-sanada ketma-ket.
 *
 *   00:05  moliya  (guruh to'lovi + o'quvchi to'lovi)
 *   00:06  o'qituvchi maoshi
 *   00:07  xodimlar maoshi
 *
 * ⚠ DAQIQALAR ATAYLAB SURILGAN: uchalasi ham og'ir, bir vaqtda ishga
 * tushsa bazani birga qiynaydi.
 *
 * ⚠ HAMMASI IDEMPOTENT: mavjud yozuvlar (qo'lda tahrirlangan fee,
 * to'langan to'lov, yopilgan oy) TEGILMAYDI.
 *
 * ⚠ BILDIRISHNOMA FAQAT REAL YANGI YOZUV YARATILGANDA: qayta ishga
 * tushish har safar owner'ga bir xil xabar yuborardi.
 * ═══════════════════════════════════════════════════════════════════════════
 */

/** Joriy MAHALLIY oy — `localTodayMidnight` UTC yarim tunini beradi. */
const currentMonth = () => {
  const today = localTodayMidnight();
  return { year: today.getUTCFullYear(), month: today.getUTCMonth() + 1 };
};

@Injectable()
export class MonthlyGenerateFinanceJob implements JobDefinition {
  readonly name = 'monthly.generate-finance';
  /** Express: `every("5 0 1 * *", MONTHLY_FINANCE_JOB)`. */
  readonly cron = '5 0 1 * *';

  private readonly logger = new Logger('Job:monthly-finance');

  constructor(
    private readonly fees: GroupFeeService,
    private readonly payments: StudentPaymentService,
    private readonly deposits: DepositsService,
    private readonly notifications: SystemNotificationsService,
  ) {}

  async run(): Promise<void> {
    const { year, month } = currentMonth();
    const feeResult: any = await this.fees.generateMonth(year, month);
    const paymentResult: any = await this.payments.generateMonth(year, month);

    // Yangi oy planlari yaratilgach — depoziti bor o'quvchilarning
    // qarzini avto qoplaymiz.
    //
    // ⚠ XATO YUTILADI: depozit qoplash MUVAFFAQIYATSIZ bo'lsa ham
    // planlar YARATILGAN bo'lib qolishi kerak — aks holda job qayta
    // urinishda planlarni ham qayta yaratishga urinardi.
    try {
      await this.deposits.autoApplyForMonth(year, month);
    } catch (err) {
      this.logger.warn(`Oylik depozit avto-qoplash xatosi: ${(err as Error)?.message}`);
    }

    if (feeResult.created > 0 || paymentResult.created > 0) {
      try {
        await this.notifications.create({
          message: `${month}-oy (${year}) uchun oylik to'lovlar generatsiya qilindi`,
          link: '/owner/finance/group-fees',
        });
      } catch (err) {
        this.logger.warn(
          `Moliya generatsiya bildirishnomasi yuborilmadi: ${(err as Error)?.message}`,
        );
      }
    }

    this.logger.log(
      `Oylik moliya generatsiya qilindi — ${year}-${month}, ` +
        `fee: ${JSON.stringify(feeResult)}, to'lov: ${JSON.stringify(paymentResult)}`,
    );
  }
}

@Injectable()
export class MonthlyGenerateSalaryJob implements JobDefinition {
  readonly name = 'monthly.generate-salary';
  /** Express: `every("6 0 1 * *", MONTHLY_SALARY_JOB)` — moliyadan KEYIN. */
  readonly cron = '6 0 1 * *';

  private readonly logger = new Logger('Job:monthly-salary');

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly salaries: TeacherSalaryService,
    private readonly periods: TeacherGroupPeriodService,
    private readonly notifications: SystemNotificationsService,
  ) {}

  /**
   * `teacherSalary.generateMonth` NING KO'CHIRMASI.
   *
   * Ikki qism:
   *   1. GURUH qatorlari — shu oyda dars bergan har o'qituvchi uchun
   *      (`TeacherGroupPeriod` kesishuvi bo'yicha, ya'ni TARIXIY
   *      generatsiyada ham o'sha davrdagi HAQIQIY o'qituvchi olinadi).
   *   2. FIKSA (base) qatorlari — shu oyda amal qilgan
   *      `fixed_monthly` stavkasi bo'lgan har o'qituvchi uchun.
   *
   * ⚠ BITTA O'QITUVCHIDAGI XATO BUTUN GENERATSIYANI TO'XTATMAYDI.
   */
  private async generateMonth(year: number, month: number) {
    const groups = await this.prisma.group.findMany({
      where: { isActive: true, isDeleted: false },
      select: { id: true },
    });
    let created = 0;
    for (const g of groups) {
      const periods = (await this.periods.teacherPeriodsActiveInMonth(
        g.id, year, month)) as any[];
      const teacherIds = [
        ...new Set(periods.map((p) => String(p.teacherId ?? p.teacher))),
      ];
      for (const teacherId of teacherIds) {
        const existed = await this.prisma.teacherSalary.findFirst({
          where: { teacherId, groupId: g.id, year, month, kind: 'group' },
          select: { id: true },
        });
        if (existed) continue;
        await this.salaries.ensureSalaryForTeacherGroup(teacherId, g.id, year, month);
        created += 1;
      }
    }

    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEndExcl = new Date(Date.UTC(year, month, 1));
    const rows = await this.prisma.teacherCompensation.findMany({
      where: {
        isDeleted: false,
        baseType: 'fixed_monthly',
        effectiveFrom: { lt: monthEndExcl },
        OR: [{ effectiveTo: null }, { effectiveTo: { gt: monthStart } }],
      },
      select: { teacherId: true },
      distinct: ['teacherId'],
    });
    const teacherIds = rows.map((r) => r.teacherId);

    let baseCreated = 0;
    for (const teacherId of teacherIds) {
      try {
        const row = await this.salaries.recalcBaseForTeacherMonth(teacherId, year, month);
        if (row) baseCreated += 1;
      } catch (err) {
        this.logger.warn(
          `Fiksa oylik yaratishda xato (${teacherId}, ${year}-${month}): ` +
            `${(err as Error)?.message}`,
        );
      }
    }

    return { groups: groups.length, created, baseCreated, baseTeachers: teacherIds.length };
  }

  async run(): Promise<void> {
    const { year, month } = currentMonth();
    const result = await this.generateMonth(year, month);

    if (result.created > 0) {
      try {
        await this.notifications.create({
          message: `${month}-oy (${year}) uchun o'qituvchi maoshlari generatsiya qilindi`,
          link: '/owner/finance/teacher-salaries',
        });
      } catch (err) {
        this.logger.warn(
          `Maosh generatsiya bildirishnomasi yuborilmadi: ${(err as Error)?.message}`,
        );
      }
    }

    this.logger.log(
      `Oylik maoshlar generatsiya qilindi — ${year}-${month}, ${JSON.stringify(result)}`,
    );
  }
}

@Injectable()
export class MonthlyGenerateStaffPayrollJob implements JobDefinition {
  readonly name = 'monthly.generate-staff-payroll';
  /** Express: `every("7 0 1 * *", MONTHLY_STAFF_PAYROLL_JOB)`. */
  readonly cron = '7 0 1 * *';
  /** Express: `{ concurrency: 1, lockLifetime: 15 * 60 * 1000 }`. */
  readonly concurrency = 1;
  readonly lockLifetimeMs = 15 * 60 * 1000;

  private readonly logger = new Logger('Job:monthly-staff-payroll');

  constructor(private readonly payroll: StaffPayrollService) {}

  async run(): Promise<void> {
    const { year, month } = currentMonth();
    // ⚠ Job faqat QATOR OCHADI (draft). Yopilgan oy qayta hisoblanmaydi —
    // `computePayroll` o'zi tekshiradi.
    const result = await this.payroll.generateMonth(year, month);
    this.logger.log(
      `Xodimlar maoshi generatsiya qilindi — ${year}-${month}, ${JSON.stringify(result)}`,
    );
  }
}
