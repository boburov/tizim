import mongoose from "mongoose";
import JournalEntry from "../../../models/journalEntry.model.js";
import Branch from "../../../models/branch.model.js";
import { ACCOUNT_KINDS } from "../../../constants/ledger.js";
import { branchFilter } from "../../../helpers/branchContext.helper.js";

// FILIAL FOYDA/ZIYON (P&L) + ELIMINATION.
//
// ══════════════════════════════════════════════════════════════════
// ELIMINATION NIMA VA NEGA KERAK
// ══════════════════════════════════════════════════════════════════
// A filial B ga 5 mln inkassatsiya qildi. Har bir filialning O'Z
// jurnalida bu haqiqiy pul harakati va u KO'RINISHI kerak - filial
// rahbari "kassamdan 5 mln chiqdi" ni bilishi shart.
//
// Lekin TARMOQ darajasida bu pul HECH QAYERGA KETMAGAN - u shunchaki
// bir cho'ntakdan ikkinchisiga o'tgan. Uni ikkala tomonda ham sanasak,
// tarmoq aylanmasi 10 mln ga oshib ketardi - aslida 0 so'm daromad
// bo'lgani holda.
//
// Shuning uchun yozuvlar `isInternal: true` bilan belgilanadi
// (cashTransfer.service.js) va KONSOLIDATSIYALANGAN hisobotda chiqarib
// tashlanadi. FILIAL hisobotida esa qoladi.
//
// Bitta bayroq, ikki xil ko'rinish - `consolidated` parametri hal qiladi.

const toObjectId = (id) =>
  id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id));

/**
 * P&L qatorlari jurnaldan hisoblanadi.
 *
 * NEGA JURNALDAN, operatsion modellardan EMAS: jurnal yagona joy bo'lib,
 * u yerda daromad, xarajat va ichki o'tkazma BIR XIL qoidaga bo'ysunadi.
 * PaymentTransaction va Expense'dan yig'ilsa, elimination bayrog'i
 * bo'lmagani uchun ichki o'tkazmalarni ajratib bo'lmasdi.
 */
const collect = async ({ from, to, consolidated, branchIds }) => {
  const match = {};
  if (branchIds?.length) {
    match.branchId = { $in: branchIds.map(toObjectId) };
  } else {
    Object.assign(match, branchFilter());
  }
  if (from || to) {
    match.date = {};
    if (from) match.date.$gte = from;
    if (to) match.date.$lte = to;
  }
  // ELIMINATION: konsolidatsiyada ichki harakatlar chiqariladi.
  if (consolidated) match.isInternal = { $ne: true };

  return JournalEntry.aggregate([
    { $match: match },
    { $unwind: "$lines" },
    {
      $group: {
        _id: { branchId: "$branchId", kind: "$lines.accountKind" },
        debit: { $sum: "$lines.debit" },
        credit: { $sum: "$lines.credit" },
      },
    },
  ]);
};

/**
 * FILIAL BO'YICHA P&L.
 *
 * @param {object} opts
 * @param {Date} [opts.from] · @param {Date} [opts.to]
 * @param {boolean} [opts.consolidated=false] - ichki o'tkazmalarni ayirish
 */
export const pnl = async ({ from = null, to = null, consolidated = false } = {}) => {
  const rows = await collect({ from, to, consolidated });

  const byBranch = new Map();
  for (const r of rows) {
    const key = String(r._id.branchId);
    const cur = byBranch.get(key) || { branchId: r._id.branchId, revenue: 0, expense: 0, shortage: 0 };

    // Daromad KREDIT bilan o'sadi, xarajat DEBET bilan.
    if (r._id.kind === ACCOUNT_KINDS.REVENUE) cur.revenue += r.credit - r.debit;
    if (r._id.kind === ACCOUNT_KINDS.EXPENSE) cur.expense += r.debit - r.credit;
    // KAMOMAD ALOHIDA qator: u xarajat emas, YO'QOTISH. Aralashtirilsa
    // "xarajat oshdi" deb ko'rinib, sababi yashirinardi.
    if (r._id.kind === ACCOUNT_KINDS.SHORTAGE) cur.shortage += r.debit - r.credit;

    byBranch.set(key, cur);
  }

  const ids = [...byBranch.values()].map((b) => b.branchId);
  const branches = ids.length
    ? await Branch.find({ _id: { $in: ids } })
        .select("name code areaM2 openedAt")
        .lean()
    : [];
  const branchMap = new Map(branches.map((b) => [String(b._id), b]));

  const items = [...byBranch.values()].map((b) => {
    const branch = branchMap.get(String(b.branchId)) || {};
    const net = b.revenue - b.expense - b.shortage;
    return {
      branchId: b.branchId,
      name: branch.name || "",
      code: branch.code || "",
      revenue: b.revenue,
      expense: b.expense,
      shortage: b.shortage,
      // FILIAL NATIJASI: markaz xarajatlari BU YERGA KIRMAYDI.
      //
      // Ular ataylab taqsimlanmaydi - taqsimlash formulasi doim bahsli
      // bo'ladi va filial rahbari O'ZI BOSHQARA OLMAYDIGAN raqam uchun
      // javob berishi noto'g'ri. Markaz xarajati konsolidatsiyalangan
      // hisobotda ALOHIDA qator bo'lib turadi.
      net,
      margin: b.revenue > 0 ? Math.round((net / b.revenue) * 10000) / 100 : null,
    };
  });

  items.sort((a, b) => b.net - a.net);

  const totals = items.reduce(
    (acc, i) => ({
      revenue: acc.revenue + i.revenue,
      expense: acc.expense + i.expense,
      shortage: acc.shortage + i.shortage,
      net: acc.net + i.net,
    }),
    { revenue: 0, expense: 0, shortage: 0, net: 0 },
  );

  return { consolidated, from, to, items, totals };
};

/**
 * ELIMINATION FARQI - "ichki o'tkazmalar hisobotni qancha shishirgan".
 *
 * Ikki rejimni yonma-yon qaytaradi. Bu owner uchun ISHONCH vositasi:
 * raqamlar bir xil bo'lsa ichki aylanma yo'q, farq bo'lsa esa u
 * AYNAN qancha ekani ko'rinadi - "hisobot nega kamaydi" degan savol
 * tug'ilmaydi.
 */
export const eliminationImpact = async ({ from = null, to = null } = {}) => {
  const [gross, consolidated] = await Promise.all([
    pnl({ from, to, consolidated: false }),
    pnl({ from, to, consolidated: true }),
  ]);

  return {
    gross: gross.totals,
    consolidated: consolidated.totals,
    eliminated: {
      revenue: gross.totals.revenue - consolidated.totals.revenue,
      expense: gross.totals.expense - consolidated.totals.expense,
    },
  };
};
