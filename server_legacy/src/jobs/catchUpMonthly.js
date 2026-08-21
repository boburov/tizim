import logger from "../config/logger.js";
import prisma from "../config/prisma.js";
import { localTodayMidnight } from "../helpers/attendance.helper.js";
import * as financeReportService from "../modules/finance/services/report.service.js";
import * as salaryReportService from "../modules/teacherSalary/services/salaryReport.service.js";

export const catchUpMonthlyGeneration = async () => {
  const today = localTodayMidnight();
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth() + 1;

  try {
    const paymentCount = await prisma.studentPayment.count({
      where: { year, month },
    });
    
    if (paymentCount === 0) {
      const result = await financeReportService.regenerate(year, month);
      logger.info({ year, month, ...result }, "Catch-up: oylik moliya generatsiya qilindi");
    }

    const result = await salaryReportService.regenerate(year, month);
    logger.info({ year, month, ...result }, "Catch-up: oylik maoshlar tekshirildi/to'ldirildi");
  } catch (err) {
    logger.warn({ err }, "Catch-up generatsiya bajarilmadi");
  }
};
