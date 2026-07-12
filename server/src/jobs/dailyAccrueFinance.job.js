import logger from "../config/logger.js";
import { localTodayMidnight } from "../helpers/attendance.helper.js";
import * as studentPaymentService from "../modules/finance/services/studentPayment.service.js";
import * as depositService from "../modules/deposits/services/deposit.service.js";

export const JOB_NAME = "daily.accrue-finance";

// Har kuni joriy oydagi o'quvchi qarzlarini qayta hisoblaydi (recalc): billing
// TO'LIQ-OY - qarz oy boshidanoq to'liq oylik summa, kunlik/dars asosida o'smaydi.
// Bu job qarzni "o'stirmaydi", balki a'zolik (qo'shilish/chiqish), muzlatish, fee
// yoki chegirma o'zgarishlarini snapshot'ga singdiradi. So'ng depoziti bor
// o'quvchilarga avto-qoplash. Idempotent - kunda bir necha marta ishlasa ham
// bir xil natija beradi.
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

  logger.info({ year, month, ...result }, "Kunlik to'liq-oy qarz qayta hisoblandi");
  return result;
};

export default function defineDailyAccrueFinance(agenda) {
  agenda.define(JOB_NAME, async () => {
    await accrueToday();
  });
}
