import logger from "../config/logger.js";
import {
  ACCOUNT_KINDS,
  ENTRY_KINDS,
  METHOD_TO_ACCOUNT,
} from "../constants/ledger.js";

// MAVJUD OQIMLARNI JURNALGA ULASH.
//
// ══════════════════════════════════════════════════════════════════
// NEGA HOOK EMAS, ANIQ CHAQIRUV
// ══════════════════════════════════════════════════════════════════
// Mongoose `post("save")` hook'lari jozibali ko'rinadi, lekin ular
// `insertMany`, `collection.insertOne` va `updateMany` da ISHLAMAYDI -
// import moduli va migratsiyalar aynan shularni ishlatadi. Hook'ga
// ishonish "jurnal to'liq" degan yolg'on hisni berardi.
//
// Shuning uchun chaqiruv ANIQ. Uni unutish xavfi esa
// `journalVerify.service.js` bilan yopiladi: u jurnalni operatsion
// modellar bilan solishtiradi va farqni ko'rsatadi.
//
// ══════════════════════════════════════════════════════════════════
// NEGA XATO YUTILADI (throw QILMAYDI)
// ══════════════════════════════════════════════════════════════════
// Pul ALLAQACHON qo'ldan qo'lga o'tgan. Jurnalga yozish yiqilgani uchun
// to'lovni rad etish - eng yomon variant: o'quvchi pul bergan, lekin
// tizimda hech narsa yo'q.
//
// Shuning uchun: xato LOGGA yoziladi, amal davom etadi, farqni esa
// verify/backfill topib tuzatadi. Bu ATAYLAB tanlangan murosaga -
// jurnal "eventual consistent", operatsion yozuv esa darhol.

const safePost = async (label, fn) => {
  try {
    return await fn();
  } catch (err) {
    // ERROR darajasi ATAYLAB: bu jimgina o'tib ketmasligi kerak.
    logger.error({ err, label }, "Jurnalga yozib bo'lmadi - farq qoldi");
    return null;
  }
};

/** To'lov usulidan hisob turini aniqlaydi (noma'lum bo'lsa - naqd). */
export const accountForMethod = (method) =>
  METHOD_TO_ACCOUNT[String(method || "cash").toLowerCase()] || ACCOUNT_KINDS.CASH;

/**
 * O'QUVCHI TO'LOVI - naqd/terminal/click orqali kirim.
 *
 *   Debet  <usul hisobi>  ← pul kassaga kirdi
 *   Kredit daromad
 *
 * DIQQAT: `source: "deposit"` bo'lgan to'lov bu YERGA KELMAYDI - u pul
 * harakati emas, depozitdan daromadga ko'chirish (postDepositApply).
 */
export const postPayment = async (trx, journal) =>
  safePost("payment", () =>
    journal.post({
      branchId: trx.branchId,
      date: trx.paidAt || trx.createdAt || new Date(),
      kind: ENTRY_KINDS.PAYMENT,
      memo: trx.note || "O'quvchi to'lovi",
      lines: [
        { accountKind: accountForMethod(trx.method), debit: trx.amount },
        { accountKind: ACCOUNT_KINDS.REVENUE, credit: trx.amount },
      ],
      refModel: "PaymentTransaction",
      refId: trx._id,
      createdBy: trx.createdBy || null,
    }),
  );

/**
 * DEPOZITGA TO'LDIRISH.
 *
 *   Debet  <usul hisobi>  ← pul kassaga kirdi
 *   Kredit depozit        ← lekin u O'QUVCHINIKI (majburiyat)
 *
 * Daromad EMAS - qarang constants/ledger.js dagi DEPOSIT izohi.
 */
export const postDepositTopup = async (txn, journal) =>
  safePost("deposit_in", () =>
    journal.post({
      branchId: txn.branchId,
      date: txn.paidAt || txn.createdAt || new Date(),
      kind: ENTRY_KINDS.DEPOSIT_IN,
      memo: txn.note || "Depozitga to'ldirish",
      lines: [
        { accountKind: accountForMethod(txn.method), debit: txn.amount },
        { accountKind: ACCOUNT_KINDS.DEPOSIT, credit: txn.amount },
      ],
      refModel: "DepositTransaction",
      refId: txn._id,
      createdBy: txn.createdBy || null,
    }),
  );

/**
 * DEPOZITDAN QAYTARISH (withdraw / refund).
 *
 *   Debet  depozit        ← majburiyat kamaydi
 *   Kredit <usul hisobi>  ← pul kassadan chiqdi
 */
export const postDepositWithdraw = async (txn, journal) =>
  safePost("deposit_out", () =>
    journal.post({
      branchId: txn.branchId,
      date: txn.paidAt || txn.createdAt || new Date(),
      kind: ENTRY_KINDS.DEPOSIT_OUT,
      memo: txn.note || "Depozitdan qaytarish",
      lines: [
        { accountKind: ACCOUNT_KINDS.DEPOSIT, debit: txn.amount },
        { accountKind: accountForMethod(txn.method), credit: txn.amount },
      ],
      refModel: "DepositTransaction",
      refId: txn._id,
      createdBy: txn.createdBy || null,
    }),
  );

/**
 * DEPOZITDAN OYLIKKA QOPLASH - pul harakati YO'Q.
 *
 *   Debet  depozit   ← majburiyat kamaydi
 *   Kredit daromad   ← endi u haqiqiy daromad
 *
 * Kassa qoldig'i O'ZGARMAYDI: pul allaqachon to'ldirish paytida kirgan.
 * Shuning uchun bu yerda hech qanday xazina hisobi qatnashmaydi.
 */
export const postDepositApply = async (trx, journal) =>
  safePost("deposit_apply", () =>
    journal.post({
      branchId: trx.branchId,
      date: trx.paidAt || trx.createdAt || new Date(),
      kind: ENTRY_KINDS.DEPOSIT_APPLY,
      memo: "Depozitdan oylik to'lovga qoplandi",
      lines: [
        { accountKind: ACCOUNT_KINDS.DEPOSIT, debit: trx.amount },
        { accountKind: ACCOUNT_KINDS.REVENUE, credit: trx.amount },
      ],
      refModel: "PaymentTransaction",
      refId: trx._id,
      createdBy: trx.createdBy || null,
    }),
  );

/**
 * CHIQIM (ijara, kommunal, jihoz...).
 *
 *   Debet  xarajat
 *   Kredit <usul hisobi>  ← pul kassadan chiqdi
 *
 * FILIALSIZ chiqim (markaz darajasidagi) JURNALGA YOZILMAYDI: yozuv
 * doim bitta filialga tegishli bo'lishi shart. Bunday chiqimlar
 * `Expense.allocation` orqali taqsimlanadi va konsolidatsiyalangan
 * hisobotda ko'rinadi.
 */
export const postExpense = async (expense, journal) => {
  if (!expense?.branchId) return null;
  return safePost("expense", () =>
    journal.post({
      branchId: expense.branchId,
      date: expense.spentAt || expense.createdAt || new Date(),
      kind: ENTRY_KINDS.EXPENSE,
      memo: expense.note || expense.title || "Chiqim",
      lines: [
        { accountKind: ACCOUNT_KINDS.EXPENSE, debit: expense.amount },
        { accountKind: accountForMethod(expense.method), credit: expense.amount },
      ],
      refModel: "Expense",
      refId: expense._id,
      createdBy: expense.createdBy || null,
    }),
  );
};

/**
 * MAOSH TO'LOVI (o'qituvchi yoki xodim).
 *
 *   Debet  xarajat
 *   Kredit <usul hisobi>
 *
 * `refModel` chaqiruvchi tomonidan beriladi - o'qituvchi va xodim
 * maoshlari BOSHQA modellarda saqlanadi (SalaryTransaction va
 * StaffSalaryTransaction).
 */
export const postSalary = async (txn, journal, refModel) => {
  if (!txn?.branchId) return null;
  return safePost("salary", () =>
    journal.post({
      branchId: txn.branchId,
      date: txn.paidAt || txn.createdAt || new Date(),
      kind: ENTRY_KINDS.SALARY,
      memo: txn.note || "Maosh to'lovi",
      lines: [
        { accountKind: ACCOUNT_KINDS.EXPENSE, debit: txn.amount },
        { accountKind: accountForMethod(txn.method), credit: txn.amount },
      ],
      refModel,
      refId: txn._id,
      createdBy: txn.createdBy || null,
    }),
  );
};
