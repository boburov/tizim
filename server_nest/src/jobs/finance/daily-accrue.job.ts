import { Injectable, Logger } from '@nestjs/common';
import { localTodayMidnight } from '../../common/utils/date.js';
import { StudentPaymentService } from '../../modules/finance/student-payment.service.js';
import { DepositsService } from '../../modules/deposits/deposits.service.js';
import type { JobDefinition } from '../job.types.js';

/**
 * `daily.accrue-finance` — `server/src/jobs/dailyAccrueFinance.job.js`.
 *
 * ── ⚠ BU JOB QARZNI "O'STIRMAYDI" ──
 * Billing TO'LIQ-OY: qarz oy boshidanoq to'liq oylik summa, kunlik/dars
 * asosida o'smaydi. Job a'zolik (qo'shilish/chiqish), muzlatish, fee va
 * chegirma o'zgarishlarini SNAPSHOT'ga singdiradi.
 *
 * ⚠ IDEMPOTENT — kunda bir necha marta ishlasa ham bir xil natija.
 *
 * ⚠ DEPOZIT XATOSI YUTILADI: avto-qoplash yiqilsa ham qarz qayta
 * hisoblangan bo'lib qolishi kerak.
 *
 * ⚠ VAQTI: kurs arxivlashdan (00:10) KEYIN — tugagan guruh yangi dars
 * accrual qilmasin.
 */
@Injectable()
export class DailyAccrueFinanceJob implements JobDefinition {
  readonly name = 'daily.accrue-finance';
  /** Express: `every("20 0 * * *", DAILY_ACCRUE_JOB)`. */
  readonly cron = '20 0 * * *';

  private readonly logger = new Logger('Job:daily-accrue');

  constructor(
    private readonly payments: StudentPaymentService,
    private readonly deposits: DepositsService,
  ) {}

  /**
   * ⚠ BOOT CATCH-UP: Express startupda ham chaqiradi (server o'chiq
   * paytda o'tkazib yuborilgan accrual'ni bugungi kesimga suradi).
   */
  async runOnBoot(): Promise<void> {
    await this.run();
  }

  async run(): Promise<void> {
    const today = localTodayMidnight();
    const year = today.getUTCFullYear();
    const month = today.getUTCMonth() + 1;

    const result = await this.payments.accrueMonth(year, month);

    try {
      await this.deposits.autoApplyForMonth(year, month);
    } catch (err) {
      this.logger.warn(
        `Kunlik accrual depozit avto-qoplash xatosi: ${(err as Error)?.message}`,
      );
    }

    this.logger.log(
      `Kunlik to'liq-oy qarz qayta hisoblandi — ${year}-${month}, ${JSON.stringify(result)}`,
    );
  }
}
