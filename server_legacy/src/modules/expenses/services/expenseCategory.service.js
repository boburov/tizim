import prisma from "../../../config/prisma.js";
import ApiError from "../../../utils/ApiError.js";
import { withLegacyId, withLegacyIds } from "../../../utils/serialize.js";
import { branchFilter } from "../../../helpers/branchContext.helper.js";

/**
 * CHIQIM KATEGORIYALARI - owner boshqaradi (ArchiveReason naqshi).
 *
 * ═════════════════════════════════════════════════════════════════
 * MONGO → PRISMA
 *   { category: id }      → { categoryId: id }
 *   toObjectId(id)        → String(id)
 *   doc.softDelete(by)    → update({ isDeleted, deletedAt, deletedBy })
 *   Expense.exists(...)   → prisma.expense.count(...) > 0
 *   11000                 → P2002
 *
 * UMUMIY KATEGORIYA (branchId = null) - `$or` NING O'RNI:
 * Mongo'da `filter.$or = [branchFilter, {branchId: null}]` edi.
 * Prisma'da `OR` mavjud, lekin u boshqa shartlar bilan BIR DARAJADA
 * turolmaydi (`isDeleted` va `isActive` ham kerak), shuning uchun
 * `AND: [{ OR: [...] }, ...]` shakli ishlatiladi.
 * ═════════════════════════════════════════════════════════════════
 */

const actorId = (u) => u?.id || u?._id || null;

/**
 * Filial ko'lami + UMUMIY yozuvlar.
 *
 * Umumiy (branchId = null) kategoriyalar HAR DOIM ko'rinadi - aks
 * holda "Ijara" kabi standart kategoriyalar filial tanlanganda
 * yo'qolardi va operator ularni qaytadan yaratib, dublikat qilardi.
 */
const scopeWithShared = () => {
  const bf = branchFilter();
  if (!Object.keys(bf).length) return [];
  return [{ OR: [bf, { branchId: null }] }];
};

export const list = async ({ includeInactive = false } = {}) => {
  const where = {
    isDeleted: false,
    ...(includeInactive ? {} : { isActive: true }),
    AND: scopeWithShared(),
  };

  return withLegacyIds(
    await prisma.expenseCategory.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  );
};

export const create = async (body, currentUser) => {
  try {
    return withLegacyId(
      await prisma.expenseCategory.create({
        data: {
          name: String(body.name).trim(),
          code: body.code ? String(body.code).trim().toLowerCase() : null,
          kind: body.kind || "operating",
          branchId: body.branchId || null,
          sortOrder: Number(body.sortOrder) || 0,
          isActive: body.isActive !== false,
          createdById: actorId(currentUser),
        },
      }),
    );
  } catch (err) {
    // QISMAN UNIQUE: (branchId, name) WHERE isDeleted = false.
    if (err?.code === "P2002") {
      throw new ApiError(409, "Bunday nomli kategoriya allaqachon mavjud");
    }
    throw err;
  }
};

const loadCategory = async (id) => {
  const doc = await prisma.expenseCategory.findFirst({
    where: { id: String(id), isDeleted: false },
  });
  if (!doc) throw new ApiError(404, "Kategoriya topilmadi");
  return doc;
};

export const update = async (id, body, currentUser) => {
  const doc = await loadCategory(id);

  // TIZIM kategoriyasining TURINI o'zgartirib bo'lmaydi: maosh
  // "payroll" dan chiqarilsa hisobotda ikki marta sanalardi.
  if (doc.isSystem && body.kind && body.kind !== doc.kind) {
    throw new ApiError(400, "Tizim kategoriyasining turini o'zgartirib bo'lmaydi");
  }

  const data = {};
  if (body.name !== undefined) data.name = String(body.name).trim();
  if (body.kind !== undefined) data.kind = body.kind;
  if (body.sortOrder !== undefined) data.sortOrder = Number(body.sortOrder) || 0;
  if (body.isActive !== undefined) data.isActive = Boolean(body.isActive);

  // `updatedBy` USTUNI YO'Q.
  //
  // Mongoose sxemada ham yo'q edi - `doc.updatedBy = ...` jimgina
  // tashlab yuborilardi (noma'lum yo'l). Postgres bunday ustunni
  // qabul qilmaydi va "Unknown argument" bilan yiqilardi, shuning
  // uchun u ko'chirilmadi. Kim o'zgartirgani `activity-logs` da bor.

  try {
    return withLegacyId(
      await prisma.expenseCategory.update({ where: { id: doc.id }, data }),
    );
  } catch (err) {
    if (err?.code === "P2002") {
      throw new ApiError(409, "Bunday nomli kategoriya allaqachon mavjud");
    }
    throw err;
  }
};

/**
 * Kategoriyani o'chiradi (soft).
 *
 * ISHLATILGAN kategoriyani o'chirish MUMKIN EMAS - hisobotdagi eski
 * chiqimlar "kategoriyasiz" bo'lib qolardi. Buning o'rniga NOFAOL
 * qilish taklif etiladi (chiqim hujjatida `categoryName` snapshot
 * bo'lgani uchun tarix baribir saqlanadi, lekin ro'yxatlarda
 * chalkashlik bo'lmasligi uchun ochiq to'siq qo'yamiz).
 *
 * POSTGRES'DA BU ENDI IKKI QATLAMLI: `Expense.categoryId` haqiqiy FK
 * (RESTRICT), ya'ni yumshoq o'chirish qatorni qoldiradi va bog'lanish
 * uzilmaydi. Quyidagi tekshiruv esa foydalanuvchiga TUSHUNARLI xato
 * beradi - FK xatosi "violates foreign key constraint" deb chiqardi.
 */
export const remove = async (id, currentUser) => {
  const doc = await loadCategory(id);
  if (doc.isSystem) throw new ApiError(400, "Tizim kategoriyasini o'chirib bo'lmaydi");

  const used = await prisma.expense.count({
    where: { categoryId: doc.id, isDeleted: false },
  });
  if (used) {
    throw new ApiError(
      400,
      "Bu kategoriya bo'yicha chiqimlar mavjud. O'chirish o'rniga uni nofaol qiling.",
    );
  }

  await prisma.expenseCategory.update({
    where: { id: doc.id },
    data: { isDeleted: true, deletedAt: new Date(), deletedBy: actorId(currentUser) },
  });
  return { ok: true };
};
