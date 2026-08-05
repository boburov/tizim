import User from "../../../models/user.model.js";
import StaffCompensation from "../../../models/staffCompensation.model.js";
import ApiError from "../../../utils/ApiError.js";
import logger from "../../../config/logger.js";
import { ROLES } from "../../../constants/roles.js";
import { loadRoleCatalog } from "../../../helpers/roles.helper.js";
import { toUtcMidnight, parseLocalDay } from "../../../helpers/attendance.helper.js";
import * as payrollService from "./staffPayroll.service.js";

/**
 * XODIM MAOSH SHARTNOMASI - hayot sikli.
 *
 * O'qituvchi moduli bilan aralashmaydi: u yerda `assertTeacher` roldan
 * o'tkazmaydi, bu yerda esa aksincha - o'quvchi rad etiladi, qolgan
 * hamma (owner, o'qituvchi, custom rollar) qabul qilinadi.
 *
 * O'QITUVCHI HAQIDA MUHIM: o'qituvchining ASOSIY maoshi eski modulda
 * (TeacherCompensation) qoladi va TEGILMAYDI. Bu yerda unga shartnoma
 * ochilsa, u faqat KPI uchun bo'lishi kerak (salaryType="kpi_only") -
 * aks holda oylik IKKI marta hisoblanardi. Shuning uchun o'qituvchiga
 * "fixed" tur berilishi bloklanadi.
 */
const assertEmployee = async (employeeId) => {
  const user = await User.findById(employeeId).lean();
  if (!user) throw new ApiError(404, "Xodim topilmadi");
  if (user.role === ROLES.STUDENT) {
    throw new ApiError(400, "O'quvchiga maosh shartnomasi ochilmaydi");
  }
  return user;
};

const assertTeacherKpiOnly = (user, salaryType) => {
  if (user.role !== ROLES.TEACHER) return;
  if (salaryType === "kpi_only") return;
  throw new ApiError(
    400,
    "O'qituvchining oyligi o'qituvchi maoshi modulida hisoblanadi. Bu yerda unga faqat KPI shartnomasi ochiladi.",
  );
};

export const listByEmployee = async (employeeId) => {
  const items = await StaffCompensation.find({
    employee: employeeId,
    isDeleted: { $ne: true },
  })
    .sort({ effectiveFrom: -1 })
    .lean();

  const active = items.find((i) => !i.effectiveTo) || null;
  return { items, active };
};

/**
 * Yangi shartnoma o'rnatish (oshirish/o'zgartirish).
 *
 * Ochiq shartnoma effectiveTo bilan yopiladi va yangisi ochiladi -
 * TARIX saqlanadi. Yanvar maoshi martdagi oshirishdan keyin ham yanvar
 * stavkasi bo'yicha qoladi.
 */
export const setCompensation = async (body, currentUser) => {
  const user = await assertEmployee(body.employee);
  const salaryType = body.salaryType || "fixed";
  assertTeacherKpiOnly(user, salaryType);

  const effectiveFrom = toUtcMidnight(
    parseLocalDay(body.effectiveFrom) || new Date(),
  );

  // Filial: shartnomada berilmasa xodimning asosiy filiali. Ikkalasi ham
  // yo'q bo'lsa - ANIQ xato. O'qituvchi modulida bu holat jimgina
  // "maosh qatori umuman yaratilmaydi"ga olib kelardi (yo'qolgan maosh).
  const branchId = body.branchId || user.homeBranchId || null;
  if (!branchId) {
    throw new ApiError(
      400,
      "Xodimga filial biriktirilmagan - avval filialni belgilang",
    );
  }

  const open = await StaffCompensation.findOne({
    employee: user._id,
    effectiveTo: null,
    isDeleted: { $ne: true },
  });

  if (open) {
    if (open.effectiveFrom >= effectiveFrom) {
      throw new ApiError(
        400,
        "Yangi shartnoma amaldagisidan keyin boshlanishi kerak",
      );
    }
    open.effectiveTo = effectiveFrom;
    open.updatedBy = currentUser?._id || null;
    await open.save();
  }

  const created = await StaffCompensation.create({
    employee: user._id,
    branchId,
    salaryType,
    baseAmount: salaryType === "kpi_only" ? 0 : body.baseAmount || 0,
    effectiveFrom,
    note: body.note || "",
    createdBy: currentUser?._id || null,
  });

  // Joriy oyni darhol qayta hisoblaymiz - egasi natijani ko'rsin.
  const now = new Date();
  try {
    await payrollService.computePayroll(
      user._id,
      now.getUTCFullYear(),
      now.getUTCMonth() + 1,
    );
  } catch (err) {
    // Hisob xatosi shartnoma yaratilishini bekor qilmasin.
    logger.warn(
      { err: err?.message, employee: String(user._id) },
      "Shartnomadan keyin maoshni qayta hisoblab bo'lmadi",
    );
  }

  return created;
};

/** Xato kiritilgan shartnomani tuzatish (summani/turini o'zgartirish). */
export const amendCompensation = async (id, patch, currentUser) => {
  const doc = await StaffCompensation.findOne({
    _id: id,
    isDeleted: { $ne: true },
  });
  if (!doc) throw new ApiError(404, "Shartnoma topilmadi");

  const user = await assertEmployee(doc.employee);
  const salaryType = patch.salaryType || doc.salaryType;
  assertTeacherKpiOnly(user, salaryType);

  if (patch.baseAmount !== undefined) doc.baseAmount = patch.baseAmount;
  if (patch.salaryType !== undefined) doc.salaryType = patch.salaryType;
  if (patch.note !== undefined) doc.note = patch.note;
  if (patch.branchId !== undefined) doc.branchId = patch.branchId;
  doc.updatedBy = currentUser?._id || null;
  await doc.save();

  const now = new Date();
  try {
    await payrollService.computePayroll(
      doc.employee,
      now.getUTCFullYear(),
      now.getUTCMonth() + 1,
    );
  } catch (err) {
    logger.warn({ err: err?.message }, "Tuzatishdan keyin qayta hisob xatosi");
  }

  return doc;
};

/** Shartnomani bekor qilish (yopish emas - xato kiritilgan bo'lsa). */
export const removeCompensation = async (id, currentUser) => {
  const doc = await StaffCompensation.findOne({
    _id: id,
    isDeleted: { $ne: true },
  });
  if (!doc) throw new ApiError(404, "Shartnoma topilmadi");

  await doc.softDelete(currentUser?._id);

  // Oldingi davr ochiq qolsin - bo'shliq qolmasin.
  const prev = await StaffCompensation.findOne({
    employee: doc.employee,
    isDeleted: { $ne: true },
    effectiveTo: doc.effectiveFrom,
  }).sort({ effectiveFrom: -1 });
  if (prev) {
    prev.effectiveTo = doc.effectiveTo || null;
    await prev.save();
  }

  return { id };
};

/**
 * Maosh shartnomasi YO'Q xodimlar - "kim e'tibordan chetda qolgan".
 * Xodimlar ro'yxatida shartnomasiz odam ko'rinmay qolardi.
 */
export const employeesWithoutCompensation = async () => {
  const catalog = await loadRoleCatalog();
  const studentValues = [...catalog.values()]
    .filter((r) => r.roleType === "student")
    .map((r) => r.value);
  if (!studentValues.includes(ROLES.STUDENT)) studentValues.push(ROLES.STUDENT);

  const withComp = await StaffCompensation.distinct("employee", {
    isDeleted: { $ne: true },
    effectiveTo: null,
  });

  return User.find(
    {
      role: { $nin: [...studentValues, ROLES.TEACHER] },
      isActive: true,
      isDeleted: { $ne: true },
      _id: { $nin: withComp },
    },
    { firstName: 1, lastName: 1, role: 1, homeBranchId: 1 },
  ).lean();
};
