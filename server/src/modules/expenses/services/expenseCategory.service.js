import mongoose from "mongoose";
import ExpenseCategory from "../../../models/expenseCategory.model.js";
import Expense from "../../../models/expense.model.js";
import ApiError from "../../../utils/ApiError.js";
import { branchFilter } from "../../../helpers/branchContext.helper.js";

// CHIQIM KATEGORIYALARI - owner boshqaradi (ArchiveReason naqshi).

const toObjectId = (id) => {
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, "Noto'g'ri identifikator");
  return new mongoose.Types.ObjectId(String(id));
};

export const list = async ({ includeInactive = false } = {}) => {
  const bf = branchFilter();
  const filter = { isDeleted: { $ne: true } };
  // Umumiy (branchId=null) kategoriyalar HAR DOIM ko'rinadi - aks holda
  // "Ijara" kabi standart kategoriyalar filial tanlanganda yo'qolardi.
  if (Object.keys(bf).length) filter.$or = [bf, { branchId: null }];
  if (!includeInactive) filter.isActive = true;

  return ExpenseCategory.find(filter)
    .sort({ sortOrder: 1, name: 1 })
    .lean();
};

export const create = async (body, currentUser) => {
  try {
    return await ExpenseCategory.create({
      name: String(body.name).trim(),
      code: body.code ? String(body.code).trim().toLowerCase() : null,
      kind: body.kind || "operating",
      branchId: body.branchId || null,
      sortOrder: Number(body.sortOrder) || 0,
      isActive: body.isActive !== false,
      createdBy: currentUser?._id || null,
    });
  } catch (err) {
    if (err?.code === 11000) {
      throw new ApiError(409, "Bunday nomli kategoriya allaqachon mavjud");
    }
    throw err;
  }
};

export const update = async (id, body, currentUser) => {
  const doc = await ExpenseCategory.findOne({
    _id: toObjectId(id),
    isDeleted: { $ne: true },
  });
  if (!doc) throw new ApiError(404, "Kategoriya topilmadi");

  // TIZIM kategoriyasining TURINI o'zgartirib bo'lmaydi: maosh "payroll"
  // dan chiqarilsa hisobotda ikki marta sanalardi.
  if (doc.isSystem && body.kind && body.kind !== doc.kind) {
    throw new ApiError(400, "Tizim kategoriyasining turini o'zgartirib bo'lmaydi");
  }

  if (body.name !== undefined) doc.name = String(body.name).trim();
  if (body.kind !== undefined) doc.kind = body.kind;
  if (body.sortOrder !== undefined) doc.sortOrder = Number(body.sortOrder) || 0;
  if (body.isActive !== undefined) doc.isActive = Boolean(body.isActive);
  doc.updatedBy = currentUser?._id || null;

  try {
    await doc.save();
  } catch (err) {
    if (err?.code === 11000) {
      throw new ApiError(409, "Bunday nomli kategoriya allaqachon mavjud");
    }
    throw err;
  }
  return doc;
};

/**
 * Kategoriyani o'chiradi (soft).
 * ISHLATILGAN kategoriyani o'chirish MUMKIN EMAS - hisobotdagi eski chiqimlar
 * "kategoriyasiz" bo'lib qolardi. Buning o'rniga NOFAOL qilish taklif etiladi
 * (chiqim hujjatida categoryName snapshot bo'lgani uchun tarix baribir saqlanadi,
 * lekin ro'yxatlarda chalkashlik bo'lmasligi uchun ochiq to'siq qo'yamiz).
 */
export const remove = async (id, currentUser) => {
  const doc = await ExpenseCategory.findOne({
    _id: toObjectId(id),
    isDeleted: { $ne: true },
  });
  if (!doc) throw new ApiError(404, "Kategoriya topilmadi");
  if (doc.isSystem) throw new ApiError(400, "Tizim kategoriyasini o'chirib bo'lmaydi");

  const used = await Expense.exists({ category: doc._id, isDeleted: { $ne: true } });
  if (used) {
    throw new ApiError(
      400,
      "Bu kategoriya bo'yicha chiqimlar mavjud. O'chirish o'rniga uni nofaol qiling.",
    );
  }

  await doc.softDelete(currentUser?._id);
  return { ok: true };
};
