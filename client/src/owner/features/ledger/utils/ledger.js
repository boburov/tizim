/**
 * LEDGER YORDAMCHILARI.
 *
 * ISHORA QOIDASI (butun modul bo'ylab bitta, server bilan bir xil):
 *   +X = MARKAZ shu shaxsga qarzdor
 *   -X = SHAXS markazga qarzdor
 *    0 = qarzdorlik yo'q
 */

// Server chegarasi bilan BIR XIL bo'lishi shart - qarang
// server/src/models/openingBalance.model.js -> OPENING_MAX_AMOUNT.
//
// Client tomonda ham qo'yilishining sababi: chegaradan oshgan summa
// serverga borib 400 bilan qaytganda odam butun formani qayta
// to'ldirishga majbur bo'lardi.
export const OPENING_MAX_AMOUNT = 500_000_000;

/**
 * Forma qiymatidan serverga yuboriladigan ISHORALI butun son.
 *
 * Bo'sh, nol yoki yaroqsiz qiymat → 0, ya'ni "qoldiq yo'q". Server
 * nol summali yozuvni rad etadi, shuning uchun chaqiruvchi 0 bo'lganda
 * maydonni umuman yubormaydi.
 */
export const parseOpeningAmount = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.trunc(n);
};

/** Kiritilgan summa chegaralarga sig'adimi (0 - yaroqli, "qoldiq yo'q"). */
export const isOpeningAmountValid = (value) =>
  Math.abs(parseOpeningAmount(value)) <= OPENING_MAX_AMOUNT;

// Qator turlari - server LEDGER_TYPES bilan bir xil kalitlar.
export const LEDGER_TYPE_LABELS = {
  opening: "Boshlang'ich qoldiq",
  charge: "Hisoblangan to'lov",
  accrual: "Hisoblangan maosh",
  payment_in: "To'lov (kirim)",
  payment_out: "To'lov (chiqim)",
  deposit_in: "Depozit kirimi",
  deposit_out: "Depozit chiqimi",
  adjustment: "Korreksiya",
};

/**
 * Balansni SO'Z bilan tushuntirish.
 *
 * Raqamning ishorasi yolg'iz o'zi noaniq: "+3 500 000" ni ko'rgan odam
 * uni "biz olamiz" deb ham, "biz beramiz" deb ham o'qishi mumkin - va
 * aynan shu noaniqlik moliyaviy xatoga aylanadi. Shuning uchun ishora
 * ko'rsatiladigan HAR joyda yonida izoh turadi.
 */
export const describeBalance = (balance) => {
  const n = Number(balance) || 0;
  if (n > 0) return { tone: "credit", text: "Markaz qarzdor" };
  if (n < 0) return { tone: "debt", text: "Bu odam markazga qarzdor" };
  return { tone: "zero", text: "Qarzdorlik yo'q" };
};
