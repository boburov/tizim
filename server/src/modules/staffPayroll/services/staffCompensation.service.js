import prisma from "../../../config/prisma.js";
import ApiError from "../../../utils/ApiError.js";
import { withLegacyId, withLegacyIds } from "../../../utils/serialize.js";
import logger from "../../../config/logger.js";
import { ROLES } from "../../../constants/roles.js";
import { loadRoleCatalog } from "../../../helpers/roles.helper.js";
import { toUtcMidnight, parseLocalDay } from "../../../helpers/attendance.helper.js";
import * as payrollService from "./staffPayroll.service.js";
import * as auditService from "./payrollAudit.service.js";

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
 *
 * ═════════════════════════════════════════════════════════════════
 * MONGO → PRISMA
 *   { employee: id } → { employeeId: id }
 *   doc.save()       → prisma.staffCompensation.update(...)
 *   doc.softDelete() → update({ isDeleted, deletedAt, deletedBy })
 *   .distinct("employee") → findMany({ distinct, select })
 *   $nin → notIn
 *
 * ATOMIKLIK: `setCompensation` IKKI yozuv qiladi (eskisini yopish +
 * yangisini ochish). Mongo'da ular alohida edi - ikkinchisi yiqilsa
 * xodim SHARTNOMASIZ qolardi va oyligi jimgina 0 ga tushardi. Endi
 * ikkalasi bitta `$transaction` ichida.
 * ═════════════════════════════════════════════════════════════════
 */
const assertEmployee = async (employeeId) => {
  const user = await prisma.user.findUnique({
    where: { id: String(employeeId) },
    select: { id: true, role: true, homeBranchId: true },
  });
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

const actorId = (u) => u?.id || u?._id || null;

export const listByEmployee = async (employeeId) => {
  const items = await prisma.staffCompensation.findMany({
    where: { employeeId: String(employeeId), isDeleted: false },
    orderBy: { effectiveFrom: "desc" },
  });

  const active = items.find((i) => !i.effectiveTo) || null;
  return {
    items: withLegacyIds(items),
    active: active ? withLegacyId(active) : null,
  };
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

  const open = await prisma.staffCompensation.findFirst({
    where: { employeeId: user.id, effectiveTo: null, isDeleted: false },
    select: { id: true, effectiveFrom: true, salaryType: true, baseAmount: true },
  });

  if (open && open.effectiveFrom >= effectiveFrom) {
    throw new ApiError(
      400,
      "Yangi shartnoma amaldagisidan keyin boshlanishi kerak",
    );
  }

  // Eskisini yopish va yangisini ochish BITTA tranzaksiyada: qisman
  // unique indeks (employeeId) WHERE effectiveTo IS NULL bitta ochiq
  // shartnomaga ruxsat beradi, ya'ni yopish yiqilsa yaratish ham
  // o'tmaydi - "shartnomasiz xodim" holati mumkin emas.
  const created = await prisma.$transaction(async (tx) => {
    if (open) {
      await tx.staffCompensation.update({
        where: { id: open.id },
        data: { effectiveTo: effectiveFrom, updatedById: actorId(currentUser) },
      });
    }
    return tx.staffCompensation.create({
      data: {
        employeeId: user.id,
        branchId,
        salaryType,
        baseAmount: salaryType === "kpi_only" ? 0 : body.baseAmount || 0,
        effectiveFrom,
        note: body.note || "",
        createdById: actorId(currentUser),
      },
    });
  });

  await auditService.record({
    employee: user.id,
    action: auditService.PAYROLL_AUDIT_ACTIONS.SALARY_CHANGED,
    targetType: "compensation",
    targetId: created.id,
    oldValue: open
      ? { salaryType: open.salaryType, baseAmount: open.baseAmount }
      : null,
    newValue: { salaryType, baseAmount: created.baseAmount, effectiveFrom },
    reason: body.note || "",
    actor: currentUser,
  });

  // Joriy oyni darhol qayta hisoblaymiz - egasi natijani ko'rsin.
  const now = new Date();
  try {
    await payrollService.computePayroll(
      user.id,
      now.getUTCFullYear(),
      now.getUTCMonth() + 1,
    );
  } catch (err) {
    // Hisob xatosi shartnoma yaratilishini bekor qilmasin.
    logger.warn(
      { err: err?.message, employee: String(user.id) },
      "Shartnomadan keyin maoshni qayta hisoblab bo'lmadi",
    );
  }

  return withLegacyId(created);
};

/** Xato kiritilgan shartnomani tuzatish (summani/turini o'zgartirish). */
export const amendCompensation = async (id, patch, currentUser) => {
  const doc = await prisma.staffCompensation.findFirst({
    where: { id: String(id), isDeleted: false },
  });
  if (!doc) throw new ApiError(404, "Shartnoma topilmadi");

  const user = await assertEmployee(doc.employeeId);
  const salaryType = patch.salaryType || doc.salaryType;
  assertTeacherKpiOnly(user, salaryType);

  const data = { updatedById: actorId(currentUser) };
  if (patch.baseAmount !== undefined) data.baseAmount = patch.baseAmount;
  if (patch.salaryType !== undefined) data.salaryType = patch.salaryType;
  if (patch.note !== undefined) data.note = patch.note;
  if (patch.branchId !== undefined) data.branchId = patch.branchId || null;

  const saved = await prisma.staffCompensation.update({
    where: { id: doc.id },
    data,
  });

  const now = new Date();
  try {
    await payrollService.computePayroll(
      doc.employeeId,
      now.getUTCFullYear(),
      now.getUTCMonth() + 1,
    );
  } catch (err) {
    logger.warn({ err: err?.message }, "Tuzatishdan keyin qayta hisob xatosi");
  }

  return withLegacyId(saved);
};

/** Shartnomani bekor qilish (yopish emas - xato kiritilgan bo'lsa). */
export const removeCompensation = async (id, currentUser) => {
  const doc = await prisma.staffCompensation.findFirst({
    where: { id: String(id), isDeleted: false },
  });
  if (!doc) throw new ApiError(404, "Shartnoma topilmadi");

  // O'chirish va oldingi davrni qayta ochish BIRGA: ikkinchisi yiqilsa
  // xodimda shartnomasiz teshik qolardi.
  await prisma.$transaction(async (tx) => {
    await tx.staffCompensation.update({
      where: { id: doc.id },
      data: { isDeleted: true, deletedAt: new Date(), deletedBy: actorId(currentUser) },
    });

    // Oldingi davr ochiq qolsin - bo'shliq qolmasin.
    const prev = await tx.staffCompensation.findFirst({
      where: {
        employeeId: doc.employeeId,
        isDeleted: false,
        effectiveTo: doc.effectiveFrom,
      },
      orderBy: { effectiveFrom: "desc" },
      select: { id: true },
    });
    if (prev) {
      await tx.staffCompensation.update({
        where: { id: prev.id },
        data: { effectiveTo: doc.effectiveTo || null },
      });
    }
  });

  return { id: doc.id };
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

  const compRows = await prisma.staffCompensation.findMany({
    where: { isDeleted: false, effectiveTo: null },
    select: { employeeId: true },
    distinct: ["employeeId"],
  });
  const withComp = compRows.map((r) => r.employeeId);

  return withLegacyIds(
    await prisma.user.findMany({
      where: {
        role: { notIn: [...studentValues, ROLES.TEACHER] },
        isActive: true,
        isDeleted: false,
        id: { notIn: withComp },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        role: true,
        homeBranchId: true,
      },
    }),
  );
};
