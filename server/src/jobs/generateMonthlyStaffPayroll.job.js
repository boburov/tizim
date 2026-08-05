import logger from "../config/logger.js";
import { localTodayMidnight } from "../helpers/attendance.helper.js";
import * as staffPayrollService from "../modules/staffPayroll/services/staffPayroll.service.js";

export const JOB_NAME = "monthly.generate-staff-payroll";

/**
 * XODIMLAR MAOSHINI oylik generatsiya.
 *
 * O'qituvchi maoshidan (00:06) KEYIN turadi (00:07) - ular bir-biriga
 * bog'liq emas, lekin bir vaqtda ishga tushsa ikkalasi ham DB'ni
 * qiynaydi.
 *
 * Job faqat QATOR OCHADI (draft). Yopilgan oy qayta hisoblanmaydi -
 * computePayroll o'zi tekshiradi.
 */
export default function defineGenerateMonthlyStaffPayroll(agenda) {
  agenda.define(
    JOB_NAME,
    { concurrency: 1, lockLifetime: 15 * 60 * 1000 },
    async () => {
      const today = localTodayMidnight();
      const year = today.getUTCFullYear();
      const month = today.getUTCMonth() + 1;
      const result = await staffPayrollService.generateMonth(year, month);
      logger.info({ year, month, ...result }, "Xodimlar maoshi generatsiya qilindi");
    },
  );
}
