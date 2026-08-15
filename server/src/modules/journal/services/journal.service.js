import mongoose from "mongoose";
import Account from "../../../models/account.model.js";
import JournalEntry from "../../../models/journalEntry.model.js";
import ApiError from "../../../utils/ApiError.js";
import {
  ACCOUNT_KINDS,
  TREASURY_KINDS,
  INTER_BRANCH_KINDS,
  ENTRY_KINDS,
  signedBalance,
} from "../../../constants/ledger.js";
import { branchMatchStage } from "../../../helpers/branchContext.helper.js";

// JURNAL (qo'sh yozuv) - yozish va o'qishning YAGONA nuqtasi.
//
// ── MODUL NOMI HAQIDA ──
// Bu `modules/ledger` DAN BOSHQA narsa. U yerdagi "ledger" - o'quvchi va
// xodimning SHAXSIY hisobvarag'i (o'qish modeli, hech narsa yozmaydi).
// Bu yerdagi "journal" esa MARKAZNING KASSA jurnali: qaysi kassada
// qancha pul bor va u qayerdan kelib qayerga ketdi.
//
// Boshqa modullar JournalEntry'ni TO'G'RIDAN-TO'G'RI yozmasligi kerak:
// hisob topish, muvozanat va elimination bayrog'i shu yerda hal qilinadi.
// Chetlab o'tilgan bitta yozuv butun jurnalni nomuvozanat qilib qo'yadi.

const toObjectId = (id) =>
  id instanceof mongoose.Types.ObjectId ? id : new mongoose.Types.ObjectId(String(id));

/**
 * Hisobni topadi yoki YARATADI.
 *
 * Talab bo'yicha yaratish (lazy): oldindan har filialga 12 turdagi hisob
 * ochish shovqin bo'lardi va ko'pi hech qachon ishlatilmasdi.
 *
 * POYGA HIMOYASI: ikki so'rov bir vaqtda bir xil hisobni yaratsa, unique
 * indeks ikkinchisini rad etadi (11000) - u holda mavjudini o'qiymiz.
 */
export const ensureAccount = async (branchId, kind, counterpartyBranchId = null) => {
  const query = {
    branchId: toObjectId(branchId),
    kind,
    counterpartyBranchId: counterpartyBranchId ? toObjectId(counterpartyBranchId) : null,
  };

  const existing = await Account.findOne(query);
  if (existing) return existing;

  try {
    return await Account.create(query);
  } catch (err) {
    if (err?.code === 11000) {
      const raced = await Account.findOne(query);
      if (raced) return raced;
    }
    throw err;
  }
};

/**
 * JURNALGA YOZADI.
 *
 * `lines` da hisob TURI beriladi, ID emas - chaqiruvchi hisob topish
 * bilan shug'ullanmasin:
 *
 *   post({
 *     branchId, kind: "payment", memo: "To'lov",
 *     lines: [
 *       { accountKind: "cash",    debit: 500000 },
 *       { accountKind: "revenue", credit: 500000 },
 *     ],
 *   })
 *
 * Muvozanat MODEL darajasida tekshiriladi (journalEntry.model.js) -
 * bu yerda faqat tushunarli xato xabari beriladi.
 */
export const post = async ({
  branchId,
  date = new Date(),
  kind,
  memo = "",
  lines,
  refModel = null,
  refId = null,
  isInternal = false,
  counterpartyBranchId = null,
  createdBy = null,
}) => {
  if (!branchId) throw new ApiError(400, "Jurnal yozuvi uchun filial kerak");
  if (!Array.isArray(lines) || lines.length < 2) {
    throw new ApiError(400, "Jurnal yozuvida kamida ikkita qator bo'lishi kerak");
  }

  const resolved = [];
  for (const line of lines) {
    const account = await ensureAccount(
      branchId,
      line.accountKind,
      line.counterpartyBranchId || null,
    );
    resolved.push({
      accountId: account._id,
      accountKind: line.accountKind,
      debit: Math.round(Number(line.debit) || 0),
      credit: Math.round(Number(line.credit) || 0),
    });
  }

  try {
    return await JournalEntry.create({
      branchId: toObjectId(branchId),
      date,
      kind,
      memo,
      lines: resolved,
      refModel,
      refId: refId ? toObjectId(refId) : null,
      isInternal,
      counterpartyBranchId: counterpartyBranchId ? toObjectId(counterpartyBranchId) : null,
      createdBy,
    });
  } catch (err) {
    // Model invariantini foydalanuvchi tiliga o'giramiz.
    if (err?.name === "ValidationError" || /muvozanat/i.test(err?.message || "")) {
      throw new ApiError(400, err.message);
    }
    throw err;
  }
};

/**
 * STORNO - xato yozuvni TESKARISI bilan bekor qiladi.
 *
 * Yozuv o'zgarmas (model `pre("save")` da qulflangan), shuning uchun
 * tuzatishning yagona to'g'ri yo'li shu. Audit izi to'liq saqlanadi:
 * xato ham, uni tuzatish ham ko'rinadi.
 */
export const reverse = async (entryId, { memo, createdBy } = {}) => {
  const original = await JournalEntry.findById(entryId).lean();
  if (!original) throw new ApiError(404, "Jurnal yozuvi topilmadi");

  return JournalEntry.create({
    branchId: original.branchId,
    date: new Date(),
    kind: ENTRY_KINDS.ADJUSTMENT,
    memo: memo || `Storno: ${original.memo || original.kind}`,
    // Debet va kredit ALMASHTIRILADI.
    lines: original.lines.map((l) => ({
      accountId: l.accountId,
      accountKind: l.accountKind,
      debit: l.credit,
      credit: l.debit,
    })),
    refModel: "JournalEntry",
    refId: original._id,
    isInternal: original.isInternal,
    counterpartyBranchId: original.counterpartyBranchId,
    createdBy,
  });
};

// ============================================================
// O'QISH
// ============================================================

/**
 * Hisob qoldiqlari - "filialda qancha pul bor".
 *
 * FILIAL KO'LAMI: branchMatchStage() qo'llanadi (aggregate'da hook
 * ishlamaydi - branchContext.helper.js:88-104).
 */
export const balances = async ({ until = null, kinds = null } = {}) => {
  const rows = await JournalEntry.aggregate([
    ...branchMatchStage(),
    ...(until ? [{ $match: { date: { $lte: until } } }] : []),
    { $unwind: "$lines" },
    ...(kinds ? [{ $match: { "lines.accountKind": { $in: kinds } } }] : []),
    {
      $group: {
        _id: {
          branchId: "$branchId",
          accountId: "$lines.accountId",
          accountKind: "$lines.accountKind",
        },
        debit: { $sum: "$lines.debit" },
        credit: { $sum: "$lines.credit" },
      },
    },
    { $sort: { "_id.accountKind": 1 } },
  ]);

  return rows.map((r) => ({
    branchId: r._id.branchId,
    accountId: r._id.accountId,
    kind: r._id.accountKind,
    debit: r.debit,
    credit: r.credit,
    // Ishora hisob turiga qarab (NORMAL_SIDE): naqd uchun debet−kredit,
    // qarz uchun kredit−debet.
    balance: signedBalance(r._id.accountKind, r.debit, r.credit),
  }));
};

/** Faqat XAZINA hisoblari - "Kassa" sahifasi uchun. */
export const treasuryBalances = (opts = {}) => balances({ ...opts, kinds: TREASURY_KINDS });

/**
 * Bitta hisob turining qoldig'i (aniq filial bo'yicha).
 * Smena yopishda "kutilgan naqd" shu orqali hisoblanadi.
 */
export const accountBalance = async (
  branchId,
  kind,
  { from = null, until = null } = {},
) => {
  const dateMatch = {};
  if (from) dateMatch.$gte = from;
  if (until) dateMatch.$lte = until;

  const [row] = await JournalEntry.aggregate([
    {
      $match: {
        branchId: toObjectId(branchId),
        ...(Object.keys(dateMatch).length ? { date: dateMatch } : {}),
      },
    },
    { $unwind: "$lines" },
    { $match: { "lines.accountKind": kind } },
    {
      $group: {
        _id: null,
        debit: { $sum: "$lines.debit" },
        credit: { $sum: "$lines.credit" },
      },
    },
  ]);

  return signedBalance(kind, row?.debit || 0, row?.credit || 0);
};

// ============================================================
// TEKSHIRUVLAR (reconciliation)
// ============================================================

/**
 * NOMUVOZANAT YOZUVLAR.
 *
 * Model invarianti buni oldini oladi, lekin tekshiruv baribir kerak:
 * bazaga to'g'ridan-to'g'ri yozish (mongosh, migratsiya, eski skript)
 * modeldan chetlab o'tadi. Bu - oxirgi to'siq.
 *
 * Denormalizatsiya qilingan `totalDebit`/`totalCredit` ustidan ishlaydi,
 * ya'ni millionlab qatorni ochmaydi.
 */
export const findUnbalanced = async ({ limit = 50 } = {}) =>
  JournalEntry.find({ $expr: { $ne: ["$totalDebit", "$totalCredit"] } })
    .select("branchId date kind memo totalDebit totalCredit")
    .limit(limit)
    .lean();

/**
 * FILIALLARARO BALANS TEKSHIRUVI.
 *
 * INVARIANT: A ning B dan talabi (due_from) === B ning A ga majburiyati
 * (due_to). Teng bo'lmasa - bir tomon yozilib, ikkinchisi yozilmagan
 * (jarayon uzilgan yoki kod xatosi).
 *
 * KO'LAMSIZ ishlaydi (branchMatchStage YO'Q) - ataylab: tekshiruv butun
 * tarmoq bo'yicha ma'noga ega va u owner uchun.
 */
export const checkInterBranchBalance = async () => {
  const rows = await JournalEntry.aggregate([
    { $unwind: "$lines" },
    { $match: { "lines.accountKind": { $in: INTER_BRANCH_KINDS } } },
    {
      $lookup: {
        from: Account.collection.name,
        localField: "lines.accountId",
        foreignField: "_id",
        as: "acc",
      },
    },
    { $unwind: "$acc" },
    {
      $group: {
        _id: {
          kind: "$lines.accountKind",
          branchId: "$acc.branchId",
          counterparty: "$acc.counterpartyBranchId",
        },
        debit: { $sum: "$lines.debit" },
        credit: { $sum: "$lines.credit" },
      },
    },
  ]);

  // Juftlarni yig'amiz: A→B due_from va B→A due_to teng bo'lishi kerak.
  const byPair = new Map();
  for (const r of rows) {
    const balance = signedBalance(r._id.kind, r.debit, r.credit);
    const a = String(r._id.branchId);
    const b = String(r._id.counterparty);
    // Juft kaliti - tartiblangan ikki filial (yo'nalishdan qat'i nazar).
    const key = [a, b].sort().join("|");

    const cur = byPair.get(key) || { key, dueFrom: 0, dueTo: 0, branches: [a, b].sort() };
    if (r._id.kind === ACCOUNT_KINDS.DUE_FROM) cur.dueFrom += balance;
    else cur.dueTo += balance;
    byPair.set(key, cur);
  }

  const mismatches = [];
  for (const pair of byPair.values()) {
    if (pair.dueFrom !== pair.dueTo) {
      mismatches.push({
        branches: pair.branches,
        dueFrom: pair.dueFrom,
        dueTo: pair.dueTo,
        diff: pair.dueFrom - pair.dueTo,
      });
    }
  }

  return { pairs: [...byPair.values()], mismatches, balanced: mismatches.length === 0 };
};

/** TO'LIQ TEKSHIRUV - tunggi job va "Kassa" sahifasidagi tugma uchun. */
export const reconcile = async () => {
  const [unbalanced, interBranch] = await Promise.all([
    findUnbalanced({ limit: 20 }),
    checkInterBranchBalance(),
  ]);

  return {
    ok: unbalanced.length === 0 && interBranch.balanced,
    unbalancedEntries: unbalanced,
    interBranch,
  };
};
