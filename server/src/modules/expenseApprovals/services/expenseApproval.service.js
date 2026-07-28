import mongoose from "mongoose";
import ExpenseApproval, {
  APPROVAL_STATUSES,
  EXPENSE_KINDS,
} from "../../../models/expenseApproval.model.js";
import Branch from "../../../models/branch.model.js";
import ApiError from "../../../utils/ApiError.js";
import logger from "../../../config/logger.js";
import { PERMISSIONS } from "../../../constants/permissions.js";
import { hasPermission } from "../../../helpers/permission.helper.js";
import { branchFilter } from "../../../helpers/branchContext.helper.js";

// ============================================================
// 1) LIMIT TEKSHIRUVI - chiqim servislaridan chaqiriladi
// ============================================================

/**
 * Chiqim limitdan oshganmi va tasdiq kerakmi.
 *
 * Qaytaradi: { needsApproval: boolean, threshold: number|null }
 *
 * OZOD bo'lganlar:
 *   - owner (["*"])
 *   - finance.approve ruxsati borlar (ular baribir o'zi tasdiqlay olardi)
 *
 * Limit qo'yilmagan bo'lsa (null) - cheksiz. Bu ATAYLAB "fail open":
 * limit ixtiyoriy imkoniyat, aks holda yangilanishdan keyin barcha mavjud
 * markazlarda to'lovlar to'satdan bloklanardi.
 */
export const checkExpenseLimit = async ({ branchId, amount, permissions }) => {
  // Tasdiqlash huquqi borlar limitdan ozod.
  if (hasPermission(permissions, PERMISSIONS.FINANCE_APPROVE)) {
    return { needsApproval: false, threshold: null };
  }
  if (!branchId) return { needsApproval: false, threshold: null };

  const branch = await Branch.findById(branchId).select("expenseApprovalThreshold").lean();
  const threshold = branch?.expenseApprovalThreshold;

  // null / 0 / manfiy => limit yo'q
  if (threshold === null || threshold === undefined || threshold <= 0) {
    return { needsApproval: false, threshold: null };
  }

  // Qat'iy KATTA: limit 10 mln bo'lsa, 10 mln o'tadi, 10 mln + 1 so'm o'tmaydi.
  return { needsApproval: Number(amount) > threshold, threshold };
};

/**
 * Tasdiq so'rovini yaratadi (chiqim limitdan oshganda).
 * Pul HALI chiqmaydi - hech qanday balans o'zgarmaydi.
 */
export const createRequest = async ({
  branchId,
  kind,
  amount,
  payload,
  threshold,
  subjectName,
  contextName,
  requestNote,
  currentUser,
}) => {
  return ExpenseApproval.create({
    branchId,
    kind,
    amount,
    payload: payload || {},
    thresholdAtRequest: threshold ?? null,
    subjectName: subjectName || "",
    contextName: contextName || "",
    requestedBy: currentUser?._id || null,
    requestNote: requestNote || "",
    status: APPROVAL_STATUSES.PENDING,
  });
};

// ============================================================
// 2) O'QISH
// ============================================================

export const list = async ({ status, kind, page = 1, limit = 20 }) => {
  const filter = { ...branchFilter() };
  if (status) filter.status = status;
  if (kind) filter.kind = kind;

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    ExpenseApproval.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate("requestedBy", { firstName: 1, lastName: 1, username: 1 })
      .populate("decidedBy", { firstName: 1, lastName: 1, username: 1 })
      .populate("branchId", { name: 1, code: 1 })
      .lean(),
    ExpenseApproval.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

export const getById = async (id) => {
  const doc = await ExpenseApproval.findById(id)
    .populate("requestedBy", { firstName: 1, lastName: 1, username: 1 })
    .populate("decidedBy", { firstName: 1, lastName: 1, username: 1 })
    .populate("branchId", { name: 1, code: 1 });
  if (!doc) throw new ApiError(404, "So'rov topilmadi");
  return doc;
};

/** Kutilayotgan so'rovlar soni - sidebar belgisi uchun. */
export const pendingCount = async () =>
  ExpenseApproval.countDocuments({
    ...branchFilter(),
    status: APPROVAL_STATUSES.PENDING,
  });

// ============================================================
// 3) QAROR: rad etish / bekor qilish
// ============================================================

export const reject = async (id, { note } = {}, currentUser) => {
  // Compare-and-set: faqat PENDING'dan REJECTED'ga o'tadi. Ikki owner bir
  // vaqtda bosgan bo'lsa, ikkinchisi null oladi.
  const doc = await ExpenseApproval.findOneAndUpdate(
    { _id: id, status: APPROVAL_STATUSES.PENDING },
    {
      $set: {
        status: APPROVAL_STATUSES.REJECTED,
        decidedBy: currentUser?._id || null,
        decidedAt: new Date(),
        decisionNote: note || "",
      },
    },
    { new: true },
  );
  if (!doc) throw new ApiError(409, "So'rov allaqachon ko'rib chiqilgan");
  return doc;
};

/** So'rovchi o'z so'rovini bekor qiladi. */
export const cancel = async (id, currentUser) => {
  const existing = await ExpenseApproval.findById(id).lean();
  if (!existing) throw new ApiError(404, "So'rov topilmadi");
  if (String(existing.requestedBy) !== String(currentUser?._id)) {
    throw new ApiError(403, "Faqat o'z so'rovingizni bekor qila olasiz");
  }
  const doc = await ExpenseApproval.findOneAndUpdate(
    { _id: id, status: APPROVAL_STATUSES.PENDING },
    {
      $set: {
        status: APPROVAL_STATUSES.CANCELED,
        decidedBy: currentUser?._id || null,
        decidedAt: new Date(),
      },
    },
    { new: true },
  );
  if (!doc) throw new ApiError(409, "So'rov allaqachon ko'rib chiqilgan");
  return doc;
};

// ============================================================
// 4) TASDIQLASH VA BAJARISH (eng nozik qism)
// ============================================================

// Bajaruvchilar ro'yxati. Sikldan qochish uchun dinamik import ishlatiladi:
// chiqim servislari bu servisni import qiladi (limit tekshiruvi uchun),
// bu servis esa ularni chaqiradi (bajarish uchun).
const EXECUTORS = {
  [EXPENSE_KINDS.SALARY_PAYMENT]: async (approval) => {
    const svc = await import("../../teacherSalary/services/salaryTransaction.service.js");
    return svc.executeApproved(approval);
  },
  [EXPENSE_KINDS.DEPOSIT_WITHDRAW]: async (approval) => {
    const svc = await import("../../deposits/services/deposit.service.js");
    return svc.executeApprovedWithdraw(approval);
  },
};

/**
 * Tasdiqlaydi va DARHOL bajaradi.
 *
 * AYNAN BIR MARTA kafolati uch qatlamda:
 *  1. Compare-and-set: PENDING -> APPROVED (ikki owner bir vaqtda bossa,
 *     faqat bittasi o'tadi).
 *  2. Partial unique indeks `expenseApprovalId` - tranzaksiya darajasida.
 *     Jarayon o'rtada o'lib qayta urinilsa ham ikkinchi yozuv 11000 beradi.
 *  3. Bajarishdan oldin mavjud tranzaksiya qidiriladi: agar tranzaksiya
 *     yozilgan-u, holat yangilanmagan bo'lsa (jarayon o'rtada o'lgan),
 *     qayta to'lamasdan shunchaki holatni tuzatamiz.
 *
 * O'Z SO'ROVINI O'ZI TASDIQLASH TAQIQLANADI.
 */
export const approve = async (id, { note } = {}, currentUser) => {
  const existing = await ExpenseApproval.findById(id).lean();
  if (!existing) throw new ApiError(404, "So'rov topilmadi");

  // O'ZINI-O'ZI TASDIQLASH TAQIQI: limitning butun ma'nosi shu.
  if (String(existing.requestedBy) === String(currentUser?._id)) {
    throw new ApiError(403, "O'z so'rovingizni o'zingiz tasdiqlay olmaysiz");
  }

  // 1-qatlam: atomik holat o'zgarishi.
  const approval = await ExpenseApproval.findOneAndUpdate(
    { _id: id, status: APPROVAL_STATUSES.PENDING },
    {
      $set: {
        status: APPROVAL_STATUSES.APPROVED,
        decidedBy: currentUser?._id || null,
        decidedAt: new Date(),
        decisionNote: note || "",
      },
    },
    { new: true },
  );
  if (!approval) throw new ApiError(409, "So'rov allaqachon ko'rib chiqilgan");

  const executor = EXECUTORS[approval.kind];
  if (!executor) {
    await markFailed(approval._id, `Noma'lum chiqim turi: ${approval.kind}`);
    throw new ApiError(500, "Bu chiqim turini bajarib bo'lmadi");
  }

  try {
    // 2 va 3-qatlam bajaruvchi ichida (mavjud tranzaksiya tekshiruvi +
    // unique indeks). Bajaruvchi biznes qoidalarini QAYTA tekshiradi.
    const trx = await executor(approval);

    await ExpenseApproval.updateOne(
      { _id: approval._id },
      {
        $set: {
          status: APPROVAL_STATUSES.EXECUTED,
          executedAt: new Date(),
          resultTransactionId: trx?._id || null,
          failureReason: "",
        },
      },
    );
    return ExpenseApproval.findById(approval._id);
  } catch (err) {
    // Re-validatsiya yiqildi (balans yetmadi, guruh arxivlandi, qoldiq
    // o'zgardi) yoki texnik xato. Holatni FAILED qilamiz - owner ko'radi.
    const reason = err?.message || "Noma'lum xato";
    await markFailed(approval._id, reason);
    logger.warn(
      { approvalId: String(approval._id), kind: approval.kind, reason },
      "Tasdiqlangan chiqimni bajarib bo'lmadi",
    );
    throw new ApiError(
      err?.statusCode || 400,
      `Tasdiqlandi, lekin bajarib bo'lmadi: ${reason}`,
    );
  }
};

const markFailed = (id, reason) =>
  ExpenseApproval.updateOne(
    { _id: id },
    { $set: { status: APPROVAL_STATUSES.FAILED, failureReason: String(reason).slice(0, 500) } },
  );

/**
 * FAILED so'rovni qayta urinish (masalan balans to'ldirilgandan keyin).
 * PENDING'ga qaytaradi, owner qaytadan tasdiqlaydi.
 */
export const retry = async (id) => {
  const doc = await ExpenseApproval.findOneAndUpdate(
    { _id: id, status: APPROVAL_STATUSES.FAILED },
    {
      $set: {
        status: APPROVAL_STATUSES.PENDING,
        decidedBy: null,
        decidedAt: null,
        failureReason: "",
      },
    },
    { new: true },
  );
  if (!doc) throw new ApiError(409, "Faqat xato holatidagi so'rovni qayta urinish mumkin");
  return doc;
};

export { APPROVAL_STATUSES, EXPENSE_KINDS };
