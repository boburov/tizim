import prisma from "../../../config/prisma.js";
import { APPROVAL_KINDS } from "../../../constants/approvals.js";
import ApiError from "../../../utils/ApiError.js";
import { withLegacyId, withLegacyIds } from "../../../utils/serialize.js";
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

/**
 * UMUMIY CHIQIMLAR - servis qatlami.
 *
 * Tasdiq oqimi maosh to'lovi bilan AYNAN BIR XIL: summa filial limitidan
 * oshsa hujjat YARATILMAYDI, faqat so'rov ochiladi. Aks holda "tasdiq
 * kutilmoqda" holatidagi chiqim hisobotlarga sizib kirardi.
 *
 * ═════════════════════════════════════════════════════════════════
 * MONGO → PRISMA
 *   { category: id }         → { categoryId: id }
 *   { receipt: id }          → { receiptId: id }
 *   { createdBy: id }        → { createdById: id }
 *   .populate("category")    → include: { category: {...} }
 *   toObjectId(id)           → String(id)
 *   doc.softDelete(by)       → update({ isDeleted, deletedAt, deletedBy })
 *   aggregate($sum)          → prisma.expense.aggregate({ _sum })
 *   aggregate($group)        → prisma.expense.groupBy()
 *
 * `expenseApprovalId` MAYDON NOMI O'ZGARMAYDI - u allaqachon "...Id"
 * bilan tugaydi va Prisma'da ham xuddi shunday ustun.
 * ═════════════════════════════════════════════════════════════════
 */

const actorId = (u) => u?.id || u?._id || null;

const assertCategory = async (categoryId) => {
  if (!categoryId) throw new ApiError(400, "Chiqim kategoriyasi ko'rsatilishi shart");
  const cat = await prisma.expenseCategory.findFirst({
    where: { id: String(categoryId), isDeleted: false },
  });
  if (!cat) throw new ApiError(404, "Chiqim kategoriyasi topilmadi");
  if (!cat.isActive) throw new ApiError(400, "Bu kategoriya faol emas");
  return cat;
};

/**
 * VALYUTA VA KAPITAL INVARIANTLARI - avval Mongoose `pre("validate")` da edi.
 *
 * ═════════════════════════════════════════════════════════════════
 * Hook o'chishi bilan ular JIMGINA yo'qolardi (MIGRATION.md §6, #29).
 * Ikkalasi ham audit uchun hal qiluvchi:
 *
 *   • Kurssiz valyutali chiqim: `amount` qanday chiqqani NOMA'LUM
 *     qoladi. Keyin "nega 12 mln?" degan savolga javob topilmaydi.
 *   • Muddatsiz kapital chiqim: amortizatsiya hisoblanmaydi va butun
 *     summa bitta oyga tushib, o'sha oy foydasini yolg'on kamaytiradi.
 *
 * SERVISDA, Zod'da emas: chiqim `executeApprovedExpense` orqali ham
 * yoziladi (tasdiq payload'idan) - u HTTP validatsiyasini chetlab
 * o'tadi. Aynan shu yo'l eng xavflisi: payload eski bo'lishi mumkin.
 * ═════════════════════════════════════════════════════════════════
 */
const assertExpenseShape = (draft) => {
  if (draft.currency && draft.currency !== "UZS") {
    if (!draft.exchangeRate || draft.exchangeRate <= 0) {
      throw new ApiError(400, "Chet el valyutasida chiqim uchun kurs ko'rsatilishi shart");
    }
    if (!draft.originalAmount || draft.originalAmount <= 0) {
      throw new ApiError(400, "Asl summa (valyutada) ko'rsatilishi shart");
    }
  }
  if (draft.isCapital && !draft.depreciationMonths) {
    throw new ApiError(
      400,
      "Kapital chiqim uchun amortizatsiya muddati (oy) ko'rsatilishi shart",
    );
  }
  return draft;
};

// Kiruvchi ma'lumotdan hujjat maydonlarini tayyorlaydi (create va execute
// ikkalasi ham shu yerdan o'tadi - qoidalar bir joyda).
const buildDraft = async (body, currentUser) => {
  // `category` (eski nom) ham, `categoryId` (Prisma nomi) ham qabul
  // qilinadi: `update()` mavjud yozuvni tarqatib qayta yig'adi va
  // undagi maydon nomi `categoryId`.
  const cat = await assertCategory(body.category ?? body.categoryId);

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

  return assertExpenseShape({
    branchId,
    allocation: body.allocation || "none",
    categoryId: cat.id,
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
    receiptId: body.receipt || body.receiptId || null,
    isCapital: Boolean(body.isCapital),
    depreciationMonths: body.isCapital ? Number(body.depreciationMonths) || 0 : null,
  });
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
    // [MAVJUD XATO] `Approval.branchId` MAJBURIY (Mongo'da ham
    // `required: true` edi, Postgres'da ham NOT NULL). Ya'ni markaz
    // umumiy chiqimi (branchId = null) shu yerda HAR DOIM yiqiladi.
    //
    // Bu ko'chirish regressiyasi EMAS - Mongo'da ham ValidationError
    // berardi, faqat xato matni boshqacha edi. Tuzatish "umumiy
    // chiqimni kim tasdiqlaydi?" degan SIYOSAT savolini talab qiladi
    // (asosiy filial? owner? alohida navbat?), shuning uchun
    // ko'chirish kommitiga jimgina qo'shilmadi.
    // Qarang: MIGRATION.md §5b "Ochiq qarorlar".
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

  const created = await prisma.expense.create({
    data: { ...draft, createdById: actorId(currentUser) },
  });
  // JURNAL: xarajat o'sdi, kassa kamaydi (Faza 4).
  await journalPosting.postExpense(created, journal);
  return withLegacyId(created);
};

/**
 * TASDIQLANGAN chiqim so'rovini bajaradi.
 * AYNAN BIR MARTA: avval shu so'rov bo'yicha yozuv bor-yo'qligi tekshiriladi
 * (jarayon o'rtada o'lgan bo'lishi mumkin), keyin qisman unique indeks.
 */
export const executeApprovedExpense = async (approval) => {
  const approvalId = approval.id || approval._id;

  const existing = await prisma.expense.findFirst({
    where: { expenseApprovalId: String(approvalId) },
  });
  if (existing) return withLegacyId(existing);

  // QAYTA VALIDATSIYA: kategoriya o'chirilgan/nofaol bo'lib qolgan bo'lishi
  // mumkin - payload'ga ko'r-ko'rona ishonilmaydi.
  const draft = await buildDraft(approval.payload || {}, {
    id: approval.requestedById || approval.requestedBy,
    // Filial so'rov paytida hal qilingan - qayta hal qilinmaydi.
    canSeeAllBranches: true,
  });

  const created = await prisma.expense.create({
    data: {
      ...draft,
      branchId: approval.payload?.resolvedBranchId || null,
      amount: approval.amount ?? draft.amount,
      createdById: approval.requestedById || approval.requestedBy || null,
      expenseApprovalId: String(approvalId),
    },
  });

  // JURNAL: tasdiqlangan chiqim ham xuddi to'g'ridan-to'g'ri yozilgani
  // kabi pul harakati - shuning uchun bu yerda ham yoziladi.
  await journalPosting.postExpense(created, journal);
  return withLegacyId(created);
};

// Ro'yxat va tafsilotda kategoriya/muallif nomi kerak.
const LIST_INCLUDE = {
  category: { select: { id: true, name: true, kind: true } },
  createdBy: { select: { id: true, firstName: true, lastName: true } },
};

/**
 * Filial ko'lami + MARKAZ UMUMIY chiqimlari.
 *
 * Mongo'da: `{ $or: [branchFilter, { branchId: null }] }`.
 *
 * NEGA `$or` KERAK: markaz umumiy chiqimlarida `branchId = null` va
 * ular filial filtriga TUSHMAYDI. Oddiy `AND` qilinsa ular hech
 * qayerda ko'rinmay qolardi - ijara va reklama kabi ENG KATTA
 * xarajatlar hisobotdan yo'qolardi va foyda yolg'on yuqori ko'rinardi.
 *
 * `branchScope === "branch-only"` bo'lsa umumiylar QO'SHILMAYDI -
 * "faqat shu filialning o'z xarajati" ko'rinishi uchun.
 */
const scopeClause = (branchScope) => {
  const bf = branchFilter();
  if (!Object.keys(bf).length) return [];
  if (branchScope === "branch-only") return [bf];
  return [{ OR: [bf, { branchId: null }] }];
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
  const where = { isDeleted: false, AND: scopeClause(branchScope) };

  if (categoryId) where.categoryId = String(categoryId);
  if (kind) where.categoryKind = kind;
  if (year) where.accrualYear = Number(year);
  if (month) where.accrualMonth = Number(month);
  if (from || to) {
    where.spentAt = {};
    if (from) where.spentAt.gte = parseLocalDay(from);
    if (to) where.spentAt.lte = parseLocalDay(to);
  }

  const skip = (page - 1) * limit;
  const [items, total, sum] = await Promise.all([
    prisma.expense.findMany({
      where,
      orderBy: [{ spentAt: "desc" }, { createdAt: "desc" }],
      skip,
      take: limit,
      include: LIST_INCLUDE,
    }),
    prisma.expense.count({ where }),
    // Mongo'da bu `aggregate([{$match},{$group:{$sum}}])` edi.
    // JAMI SUMMA SAHIFADAN MUSTAQIL: `items` faqat joriy sahifa,
    // `totalAmount` esa BUTUN filtr bo'yicha - aks holda "jami"
    // sahifa almashganda o'zgarib turardi.
    prisma.expense.aggregate({ where, _sum: { amount: true } }),
  ]);

  return {
    items: withLegacyIds(items),
    total,
    page,
    limit,
    totalAmount: sum._sum.amount || 0,
  };
};

export const getById = async (id) => {
  const doc = await prisma.expense.findFirst({
    where: { id: String(id), isDeleted: false },
    include: LIST_INCLUDE,
  });
  if (!doc) throw new ApiError(404, "Chiqim topilmadi");
  // Markaz umumiy chiqimi (branchId=null) hammaga ko'rinadi.
  if (doc.branchId && !isBranchAllowed(doc.branchId)) {
    throw new ApiError(404, "Chiqim topilmadi");
  }
  return withLegacyId(doc);
};

/** Yozish uchun XOM yozuv (ko'lam tekshiruvi bilan). */
const loadForWrite = async (id) => {
  const doc = await prisma.expense.findFirst({
    where: { id: String(id), isDeleted: false },
  });
  if (!doc) throw new ApiError(404, "Chiqim topilmadi");
  if (doc.branchId && !isBranchAllowed(doc.branchId)) {
    throw new ApiError(404, "Chiqim topilmadi");
  }
  return doc;
};

export const update = async (id, body, currentUser) => {
  const doc = await loadForWrite(id);

  // TASDIQDAN o'tgan chiqim summasini tahrirlash - limitni aylanib o'tish
  // yo'li bo'lardi (100 mln so'rab, 1 mln tasdiqlatib, keyin 100 mln qilish).
  if (doc.expenseApprovalId && body.amount !== undefined) {
    throw new ApiError(
      400,
      "Tasdiqdan o'tgan chiqim summasini o'zgartirib bo'lmaydi. Bekor qilib qaytadan kiriting.",
    );
  }

  // Mongo'da bu `doc.toObject()` edi. Prisma yozuvi allaqachon oddiy
  // obyekt, lekin unda USTUN BO'LMAGAN maydonlar yo'q - shuning uchun
  // `include` siz o'qilgan XOM yozuv tarqatiladi (aks holda `category`
  // obyekti `data` ga tushib, "Unknown argument" berardi).
  const draft = await buildDraft({ ...doc, ...body }, currentUser);

  const saved = await prisma.expense.update({ where: { id: doc.id }, data: draft });
  return withLegacyId(saved);
};

export const remove = async (id, currentUser) => {
  const doc = await loadForWrite(id);
  await prisma.expense.update({
    where: { id: doc.id },
    data: { isDeleted: true, deletedAt: new Date(), deletedBy: actorId(currentUser) },
  });
  return { ok: true };
};

/** Oylik chiqim - kategoriya bo'yicha guruhlangan (hisobot uchun). */
export const summaryByCategory = async ({ year, month }) => {
  const where = {
    isDeleted: false,
    accrualYear: Number(year),
    accrualMonth: Number(month),
    AND: scopeClause(),
  };

  // Mongo'da `$group` kalitida uchta maydon bor edi
  // ({category, name, kind}). Prisma `groupBy` ham bir nechta maydon
  // bo'yicha guruhlay oladi, shuning uchun snapshot nomlari
  // (`categoryName`, `categoryKind`) kalitga qo'shiladi - ular
  // yozuvda MUZLATILGAN, ya'ni kategoriya keyin qayta nomlansa ham
  // eski hisobot o'zgarmaydi.
  const rows = await prisma.expense.groupBy({
    by: ["categoryId", "categoryName", "categoryKind"],
    where,
    _sum: { amount: true },
    _count: { _all: true },
    orderBy: { _sum: { amount: "desc" } },
  });

  return rows.map((r) => ({
    categoryId: r.categoryId,
    name: r.categoryName,
    kind: r.categoryKind,
    total: r._sum.amount || 0,
    count: r._count._all,
  }));
};
