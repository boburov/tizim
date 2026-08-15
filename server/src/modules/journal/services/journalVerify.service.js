import PaymentTransaction from "../../../models/paymentTransaction.model.js";
import DepositTransaction from "../../../models/depositTransaction.model.js";
import Expense from "../../../models/expense.model.js";
import SalaryTransaction from "../../../models/salaryTransaction.model.js";
import StaffSalaryTransaction from "../../../models/staffSalaryTransaction.model.js";
import JournalEntry from "../../../models/journalEntry.model.js";

// JURNAL HAQIQAT BILAN MOS KELADIMI.
//
// ══════════════════════════════════════════════════════════════════
// NEGA BU TEKSHIRUV ENG MUHIM QISM
// ══════════════════════════════════════════════════════════════════
// Jurnalga yozish ANIQ chaqiruv orqali bo'ladi (hook emas - sabab
// helpers/journalPosting.helper.js da). Aniq chaqiruvning zaifligi
// bitta: uni UNUTISH mumkin. Yangi to'lov yo'li qo'shiladi, jurnalga
// ulanmaydi - va bu HECH QAYERDA bilinmaydi, chunki hech narsa
// yiqilmaydi. Kassa qoldig'i shunchaki jimgina noto'g'ri bo'lib boradi.
//
// Bu servis aynan shu bo'shliqni yopadi: har bir operatsion model
// bo'yicha "nechta hujjat bor" va "nechtasi jurnalga tushgan" ni
// solishtiradi. Farq bo'lsa - qaysi hujjatlar tushmagani ham
// ko'rsatiladi, ya'ni backfill ularni tuzatishi mumkin.
//
// KO'LAMSIZ ishlaydi (branchFilter YO'Q) - bu owner uchun butun tarmoq
// bo'yicha sog'liq tekshiruvi.

/**
 * Manba modellar va ularning jurnaldagi izlari.
 *
 * `filter` - jurnalga tushishi KERAK bo'lgan hujjatlar sharti.
 * Tushmasligi kerak bo'lganlar (filialsiz chiqim, o'chirilgan yozuv)
 * shu yerda chiqarib tashlanadi - aks holda tekshiruv doim "farq bor"
 * deb qichqirardi.
 */
const SOURCES = [
  {
    key: "payment",
    label: "O'quvchi to'lovi (naqd/terminal)",
    model: PaymentTransaction,
    refModel: "PaymentTransaction",
    // source: "deposit" ALOHIDA hisoblanadi (deposit_apply) - u pul
    // harakati emas. Filialsiz yozuv jurnalga tushmaydi.
    filter: {
      source: { $ne: "deposit" },
      isDeleted: { $ne: true },
      branchId: { $ne: null },
    },
  },
  {
    key: "deposit_apply",
    label: "Depozitdan qoplash",
    model: PaymentTransaction,
    refModel: "PaymentTransaction",
    entryKind: "deposit_apply",
    filter: { source: "deposit", isDeleted: { $ne: true }, branchId: { $ne: null } },
  },
  {
    key: "deposit",
    label: "Depozit kirim/chiqim",
    model: DepositTransaction,
    refModel: "DepositTransaction",
    filter: {
      type: { $in: ["topup", "withdraw"] },
      isDeleted: { $ne: true },
      branchId: { $ne: null },
    },
  },
  {
    key: "expense",
    label: "Chiqim",
    model: Expense,
    refModel: "Expense",
    filter: { isDeleted: { $ne: true }, branchId: { $ne: null } },
  },
  {
    key: "teacher_salary",
    label: "O'qituvchi maoshi",
    model: SalaryTransaction,
    refModel: "SalaryTransaction",
    filter: { isDeleted: { $ne: true }, branchId: { $ne: null } },
  },
  {
    key: "staff_salary",
    label: "Xodim maoshi",
    model: StaffSalaryTransaction,
    refModel: "StaffSalaryTransaction",
    filter: { isDeleted: { $ne: true }, branchId: { $ne: null } },
  },
];

/**
 * Bitta manba bo'yicha solishtirish.
 *
 * @returns {{key, label, sourceCount, postedCount, missing: number, missingIds: string[]}}
 */
const verifySource = async (src, { sampleLimit = 10 } = {}) => {
  const docs = await src.model.find(src.filter).select("_id").lean();
  const ids = docs.map((d) => d._id);
  if (ids.length === 0) {
    return {
      key: src.key,
      label: src.label,
      sourceCount: 0,
      postedCount: 0,
      missing: 0,
      missingIds: [],
    };
  }

  const entryFilter = {
    refModel: src.refModel,
    refId: { $in: ids },
    ...(src.entryKind ? { kind: src.entryKind } : {}),
  };
  // deposit_apply va oddiy to'lov BIR XIL refModel ishlatadi, shuning
  // uchun turi ko'rsatilmagan manbada deposit_apply chiqarib tashlanadi.
  if (!src.entryKind && src.refModel === "PaymentTransaction") {
    entryFilter.kind = { $ne: "deposit_apply" };
  }

  const posted = await JournalEntry.find(entryFilter).select("refId").lean();
  const postedSet = new Set(posted.map((e) => String(e.refId)));

  const missingIds = ids
    .filter((id) => !postedSet.has(String(id)))
    .map(String);

  return {
    key: src.key,
    label: src.label,
    sourceCount: ids.length,
    postedCount: postedSet.size,
    missing: missingIds.length,
    // Butun ro'yxat emas - namuna. Minglab ID javobni ishlatib
    // bo'lmaydigan qilardi; backfill baribir hammasini o'zi topadi.
    missingIds: missingIds.slice(0, sampleLimit),
  };
};

/**
 * TO'LIQ TEKSHIRUV - barcha manbalar bo'yicha.
 *
 * `ok: false` = jurnalda yetishmayotgan yozuv bor, ya'ni kassa qoldig'i
 * haqiqatdan kam ko'rsatadi. Tuzatish: npm run migrate:journal-backfill
 */
export const verify = async ({ sampleLimit = 10 } = {}) => {
  const sources = [];
  for (const src of SOURCES) {
    sources.push(await verifySource(src, { sampleLimit }));
  }

  const totalMissing = sources.reduce((sum, s) => sum + s.missing, 0);

  return {
    ok: totalMissing === 0,
    totalMissing,
    sources,
  };
};

export { SOURCES };
