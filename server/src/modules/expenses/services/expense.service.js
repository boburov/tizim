import mongoose from "mongoose";
import Expense from "../../../models/expense.model.js";
import ExpenseCategory from "../../../models/expenseCategory.model.js";
import { APPROVAL_KINDS } from "../../../models/approval.model.js";
import ApiError from "../../../utils/ApiError.js";
import {
  branchFilter,
  resolveBranchForWrite,
  isBranchAllowed,
} from "../../../helpers/branchContext.helper.js";
import { parseLocalDay, localTodayMidnight } from "../../../helpers/attendance.helper.js";
import {
  checkExpenseLimit,
  createRequest,
} from "../../expenseApprovals/services/expenseApproval.service.js";
import * as journalPosting from "../../../helpers/journalPosting.helper.js";
import * as journal from "../../journal/services/journal.service.js";

// UMUMIY CHIQIMLAR - servis qatlami.
//
// Tasdiq oqimi maosh to'lovi bilan AYNAN BIR XIL: summa filial limitidan
// oshsa hujjat YARATILMAYDI, faqat so'rov ochiladi. Aks holda "tasdiq
// kutilmoqda" holatidagi chiqim hisobotlarga sizib kirardi.

const toObjectId = (id) => {
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, "Noto'g'ri identifikator");
  return new mongoose.Types.ObjectId(String(id));
};

const assertCategory = async (categoryId) => {
  const cat = await ExpenseCategory.findOne({
    _id: toObjectId(categoryId),
    isDeleted: { $ne: true },
  }).lean();
  if (!cat) throw new ApiError(404, "Chiqim kategoriyasi topilmadi");
  if (!cat.isActive) throw new ApiError(400, "Bu kategoriya faol emas");
  return cat;
};

// Kiruvchi ma'lumotdan hujjat maydonlarini tayyorlaydi (create va execute
// ikkalasi ham shu yerdan o'tadi - qoidalar bir joyda).
const buildDraft = async (body, currentUser) => {
  const cat = await assertCategory(body.category);

  const spentAt = body.spentAt ? parseLocalDay(body.spentAt) : localTodayMidnight();
  if (!spentAt) throw new ApiError(400, "Sana noto'g'ri");

  // Davr berilmasa - sarflangan oyga tegishli deb hisoblaymiz (odatiy hol).
  const accrualYear = Number(body.accrualYear) || spentAt.getUTCFullYear();
  const accrualMonth = Number(body.accrualMonth) || spentAt.getUTCMonth() + 1;

  const currency = body.currency || "UZS";
  let amount = Math.round(Number(body.amount) || 0);
  let originalAmount = null;
  let exchangeRate = null;

  if (currency !== "UZS") {
    // Chet el valyutasi: foydalanuvchi ASL summani va kursni kiritadi,
    // biz baza valyutasidagi summani SHU YERDA hisoblab MUZLATAMIZ.
    originalAmount = Number(body.originalAmount ?? body.amount) || 0;
    exchangeRate = Number(body.exchangeRate) || 0;
    if (originalAmount <= 0 || exchangeRate <= 0) {
      throw new ApiError(400, "Valyuta summasi va kursi to'g'ri ko'rsatilishi shart");
    }
    amount = Math.round(originalAmount * exchangeRate);
  }
  if (amount < 1) throw new ApiError(400, "Summa noldan katta bo'lishi kerak");

  // FILIAL: ataylab null bo'lishi MUMKIN (markaz umumiy chiqimi).
  // body.branchId === null → foydalanuvchi ONGLI ravishda "umumiy" dedi.
  const branchId =
    body.branchId === null
      ? null
      : await resolveBranchForWrite(currentUser, body.branchId ?? null);

  return {
    branchId,
    allocation: body.allocation || "none",
    category: cat._id,
    categoryName: cat.name,
    categoryKind: cat.kind,
    title: String(body.title).trim(),
    description: body.description || "",
    amount,
    currency,
    originalAmount,
    exchangeRate,
    rateSource: body.rateSource || "",
    spentAt,
    accrualYear,
    accrualMonth,
    method: body.method || "cash",
    vendor: body.vendor || "",
    receipt: body.receipt || null,
    isCapital: Boolean(body.isCapital),
    depreciationMonths: body.isCapital ? Number(body.depreciationMonths) || 0 : null,
  };
};

export const create = async (body, currentUser) => {
  const draft = await buildDraft(body, currentUser);

  // CHIQIM LIMITI: markaz umumiy chiqimida (branchId=null) limit tekshiruvi
  // ASOSIY filial limiti bilan qilinmaydi - u yerda "qaysi filial limiti?"
  // degan savol javobsiz. Shuning uchun umumiy chiqim HAR DOIM tasdiqdan
  // o'tadi (u odatda eng katta xarajat - ijara, brend reklamasi).
  const { needsApproval, threshold } = draft.branchId
    ? await checkExpenseLimit({
        branchId: draft.branchId,
        amount: draft.amount,
        permissions: currentUser?.permissions,
      })
    : { needsApproval: true, threshold: null };

  if (needsApproval) {
    const approval = await createRequest({
      branchId: draft.branchId,
      kind: APPROVAL_KINDS.EXPENSE_CREATE,
      amount: draft.amount,
      threshold,
      payload: { ...body, resolvedBranchId: draft.branchId ? String(draft.branchId) : null },
      subjectName: draft.title,
      contextName: draft.categoryName,
      requestNote: body.requestNote,
      currentUser,
    });
    return { pendingApproval: true, approval };
  }

  const created = await Expense.create({
    ...draft,
    createdBy: currentUser?._id || null,
  });
  // JURNAL: xarajat o'sdi, kassa kamaydi (Faza 4).
  await journalPosting.postExpense(created, journal);
  return created;
};

/**
 * TASDIQLANGAN chiqim so'rovini bajaradi.
 * AYNAN BIR MARTA: avval shu so'rov bo'yicha yozuv bor-yo'qligi tekshiriladi
 * (jarayon o'rtada o'lgan bo'lishi mumkin), keyin partial unique indeks.
 */
export const executeApprovedExpense = async (approval) => {
  const existing = await Expense.findOne({ expenseApprovalId: approval._id });
  if (existing) return existing;

  // QAYTA VALIDATSIYA: kategoriya o'chirilgan/nofaol bo'lib qolgan bo'lishi
  // mumkin - payload'ga ko'r-ko'rona ishonilmaydi.
  const draft = await buildDraft(approval.payload || {}, {
    _id: approval.requestedBy,
    // Filial so'rov paytida hal qilingan - qayta hal qilinmaydi.
    canSeeAllBranches: true,
  });

  const created = await Expense.create({
    ...draft,
    branchId: approval.payload?.resolvedBranchId || null,
    amount: approval.amount ?? draft.amount,
    createdBy: approval.requestedBy || null,
    expenseApprovalId: approval._id,
  });

  // JURNAL: tasdiqlangan chiqim ham xuddi to'g'ridan-to'g'ri yozilgani
  // kabi pul harakati - shuning uchun bu yerda ham yoziladi.
  await journalPosting.postExpense(created, journal);
  return created;
};

export const list = async ({
  categoryId,
  kind,
  year,
  month,
  from,
  to,
  branchScope,
  page = 1,
  limit = 50,
}) => {
  // FILIAL: Expense'da branchId bor. MUHIM - markaz umumiy chiqimlari
  // (branchId=null) filial filtriga TUSHMAYDI, shuning uchun ular ataylab
  // $or bilan qo'shiladi: aks holda ular hech qayerda ko'rinmay qolardi.
  const bf = branchFilter();
  const base = { isDeleted: { $ne: true } };
  const filter =
    Object.keys(bf).length && branchScope !== "branch-only"
      ? { ...base, $or: [bf, { branchId: null }] }
      : { ...base, ...bf };

  if (categoryId) filter.category = toObjectId(categoryId);
  if (kind) filter.categoryKind = kind;
  if (year) filter.accrualYear = Number(year);
  if (month) filter.accrualMonth = Number(month);
  if (from || to) {
    filter.spentAt = {};
    if (from) filter.spentAt.$gte = parseLocalDay(from);
    if (to) filter.spentAt.$lte = parseLocalDay(to);
  }

  const skip = (page - 1) * limit;
  const [items, total, sumRow] = await Promise.all([
    Expense.find(filter)
      .populate("category", { name: 1, kind: 1 })
      .populate("createdBy", { firstName: 1, lastName: 1 })
      .sort({ spentAt: -1, createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    Expense.countDocuments(filter),
    Expense.aggregate([
      { $match: filter },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
  ]);

  return { items, total, page, limit, totalAmount: sumRow[0]?.total || 0 };
};

export const getById = async (id) => {
  const doc = await Expense.findOne({
    _id: toObjectId(id),
    isDeleted: { $ne: true },
  })
    .populate("category", { name: 1, kind: 1 })
    .lean();
  if (!doc) throw new ApiError(404, "Chiqim topilmadi");
  // Markaz umumiy chiqimi (branchId=null) hammaga ko'rinadi.
  if (doc.branchId && !isBranchAllowed(doc.branchId)) {
    throw new ApiError(404, "Chiqim topilmadi");
  }
  return doc;
};

export const update = async (id, body, currentUser) => {
  const doc = await Expense.findOne({
    _id: toObjectId(id),
    isDeleted: { $ne: true },
  });
  if (!doc) throw new ApiError(404, "Chiqim topilmadi");
  if (doc.branchId && !isBranchAllowed(doc.branchId)) {
    throw new ApiError(404, "Chiqim topilmadi");
  }
  // TASDIQDAN o'tgan chiqim summasini tahrirlash - limitni aylanib o'tish
  // yo'li bo'lardi (100 mln so'rab, 1 mln tasdiqlatib, keyin 100 mln qilish).
  if (doc.expenseApprovalId && body.amount !== undefined) {
    throw new ApiError(
      400,
      "Tasdiqdan o'tgan chiqim summasini o'zgartirib bo'lmaydi. Bekor qilib qaytadan kiriting.",
    );
  }

  const draft = await buildDraft({ ...doc.toObject(), ...body }, currentUser);
  Object.assign(doc, draft);
  await doc.save();
  return doc;
};

export const remove = async (id, currentUser) => {
  const doc = await Expense.findOne({
    _id: toObjectId(id),
    isDeleted: { $ne: true },
  });
  if (!doc) throw new ApiError(404, "Chiqim topilmadi");
  if (doc.branchId && !isBranchAllowed(doc.branchId)) {
    throw new ApiError(404, "Chiqim topilmadi");
  }
  await doc.softDelete(currentUser?._id);
  return { ok: true };
};

/** Oylik chiqim - kategoriya bo'yicha guruhlangan (hisobot uchun). */
export const summaryByCategory = async ({ year, month }) => {
  const bf = branchFilter();
  const match = {
    isDeleted: { $ne: true },
    accrualYear: Number(year),
    accrualMonth: Number(month),
    ...(Object.keys(bf).length ? { $or: [bf, { branchId: null }] } : {}),
  };

  const rows = await Expense.aggregate([
    { $match: match },
    {
      $group: {
        _id: { category: "$category", name: "$categoryName", kind: "$categoryKind" },
        total: { $sum: "$amount" },
        count: { $sum: 1 },
      },
    },
    { $sort: { total: -1 } },
  ]);

  return rows.map((r) => ({
    categoryId: r._id.category,
    name: r._id.name,
    kind: r._id.kind,
    total: r.total,
    count: r.count,
  }));
};
