import logger from "../config/logger.js";
import { localTodayMidnight } from "../helpers/attendance.helper.js";
import * as studentPaymentService from "../modules/finance/services/studentPayment.service.js";
import * as depositService from "../modules/deposits/services/deposit.service.js";

export const JOB_NAME = "daily.accrue-finance";

// Har kuni o'quvchilarning dars-asosli qarzini bir kunga oldinga suradi:
// o'tib bo'lgan har bir dars uchun (oylik / oydagi dars soni) qarzga qo'shiladi -
// o'quvchi darsga kelsin kelmasin. So'ng depoziti bor o'quvchilarga avto-qoplash
// (o'sgan qarzni depozitdan yopish). Idempotent - bir kunda bir necha marta
// ishlasa ham accrual bugungi kesim bo'yicha bir xil natija beradi.
export const accrueToday = async () => {
  const today = localTodayMidnight();
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth() + 1;

  const result = await studentPaymentService.accrueMonth(year, month);

  try {
    await depositService.autoApplyForMonth(year, month);
  } catch (err) {
    logger.warn({ err }, "Kunlik accrual depozit avto-qoplash xatosi");
  }

  logger.info({ year, month, ...result }, "Kunlik dars-asosli qarz hisoblandi");
  return result;
};

export default function defineDailyAccrueFinance(agenda) {
  agenda.define(JOB_NAME, async () => {
    await accrueToday();
  });
}
