import mongoose from "mongoose";
import User from "../../../models/user.model.js";
import StaffCompensation from "../../../models/staffCompensation.model.js";
import StaffPayroll from "../../../models/staffPayroll.model.js";
import StaffPayrollItem from "../../../models/staffPayrollItem.model.js";
import StaffPayrollAdjustment from "../../../models/staffPayrollAdjustment.model.js";
import ApiError from "../../../utils/ApiError.js";
import logger from "../../../config/logger.js";
import { ROLES } from "../../../constants/roles.js";
import { loadRoleCatalog, staffRoleFilter } from "../../../helpers/roles.helper.js";
import { userBranchCondition } from "../../../helpers/branchContext.helper.js";
import { daysInMonth, deriveStatus } from "../../finance/services/proration.helper.js";
import { rebuildAutoKpi } from "./kpiEngine.service.js";
import { monthRange } from "./kpiTriggers.js";

/**
 * XODIMLAR MAOSHI - hisoblash yadrosi.
 *
 * O'QITUVCHI MODULIGA UMUMAN TEGMAYDI: bu servis TeacherSalary,
 * TeacherCompensation, SalaryTransaction va teacherSalary.service ni
 * na o'qiydi, na yozadi. Yagona umumiy narsa - proration.helper dagi
 * sof matematik yordamchilar (daysInMonth, deriveStatus), ular hech
 * qanday o'qituvchi/guruh farazini olib yurmaydi.
 */

const toId = (v) => new mongoose.Types.ObjectId(String(v));

/** Oy ichida amal qilgan shartnoma bo'laklari (ishga kirish/bo'shash proratsiyasi). */
const compensationSegmentsForMonth = (comps, year, month) => {
  const { start, endExcl } = monthRange(year, month);
  const segments = [];

  for (const c of comps) {
    const from = c.effectiveFrom > start ? c.effectiveFrom : start;
    // effectiveTo EXCLUSIVE - loyihadagi barcha davrlar bilan bir xil.
    const toExcl = c.effectiveTo && c.effectiveTo < endExcl ? c.effectiveTo : endExcl;
    if (from >= toExcl) continue;

    const days = Math.round((toExcl - from) / 86400000);
    if (days <= 0) continue;
    segments.push({ comp: c, from, toExcl, days });
  }

  return segments;
};

/**
 * Bitta xodimning bitta oyi. Idempotent - istalgan marta chaqirsa bo'ladi.
 *
 * TO'LANGAN OY: qayta hisoblash to'langan oyni ham yangilaydi (o'qituvchi
 * moduli ham shunday ishlaydi) - lekin `finalAmount` to'langan summadan
 * pastga tushsa, holat "paid" dan "partial"ga qaytmaydi, `overpaid`
 * ko'rinadi. Bu ataylab: ma'lumot keyin to'g'rilangani uchun pulni
 * qaytarib olish qarori ODAMNIKI, tizimniki emas.
 */
export const computePayroll = async (
  employeeId,
  year,
  month,
  { save = true, force = false } = {},
) => {
  const employee = await User.findById(employeeId).lean();
  if (!employee) throw new ApiError(404, "Xodim topilmadi");
  if (employee.role === ROLES.STUDENT) {
    throw new ApiError(400, "O'quvchiga maosh hisoblanmaydi");
  }

  // YOPILGAN OY tegilmaydi: egasi ko'rib qabul qilgan raqam keyin
  // o'z-o'zidan o'zgarmasligi kerak. Faqat ataylab qayta ochish orqali.
  if (save && !force) {
    const existing = await StaffPayroll.findOne(
      { employee: employee._id, year, month },
      { lifecycle: 1 },
    ).lean();
    if (existing?.lifecycle === "finalized") {
      return StaffPayroll.findById(existing._id);
    }
  }

  const { start, endExcl } = monthRange(year, month);

  // Amal qilayotgan shartnomalar (oy bilan kesishganlari).
  const comps = await StaffCompensation.find({
    employee: employee._id,
    isDeleted: { $ne: true },
    effectiveFrom: { $lt: endExcl },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gt: start } }],
  })
    .sort({ effectiveFrom: 1 })
    .lean();

  const segments = compensationSegmentsForMonth(comps, year, month);
  const totalDays = daysInMonth(year, month);

  // FIXED qism - bo'laklar bo'yicha proratsiya.
  let fixedAmount = 0;
  let payableDays = 0;
  for (const seg of segments) {
    if (seg.comp.salaryType === "kpi_only") continue;
    payableDays += seg.days;
    fixedAmount += Math.round((seg.comp.baseAmount * seg.days) / totalDays);
  }

  // Oxirgi amaldagi shartnoma - snapshot uchun (nima asosida hisoblandi).
  const lastComp = segments.length ? segments[segments.length - 1].comp : null;
  const salaryType = lastComp?.salaryType || "fixed";
  const branchId = lastComp?.branchId || employee.homeBranchId || null;

  if (!save) {
    return { employee, salaryType, fixedAmount, payableDays, totalDays, branchId };
  }

  // Qator (yo'q bo'lsa yaratiladi) - KPI qatorlari unga bog'lanadi.
  const payroll = await StaffPayroll.findOneAndUpdate(
    { employee: employee._id, year, month },
    {
      $set: { branchId, salaryType, baseAmount: lastComp?.baseAmount || 0 },
      $setOnInsert: { paidAmount: 0 },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );

  // AVTOMATIK KPI - shartnoma turi ruxsat bersagina.
  let autoKpiTotal = 0;
  if (salaryType === "fixed_plus_kpi" || salaryType === "kpi_only") {
    const res = await rebuildAutoKpi({ payroll, employee });
    autoKpiTotal = res.total;
  } else {
    // Tur "fixed"ga o'zgartirilgan bo'lsa eski KPI qatorlari qolib
    // ketmasin.
    await StaffPayrollItem.deleteMany({ payroll: payroll._id });
  }

  // QO'LDA kiritilgan bonus/jarima - qayta hisoblash ularga TEGMAYDI,
  // faqat yig'indisini oladi.
  const adjustments = await StaffPayrollAdjustment.aggregate([
    {
      $match: {
        employee: toId(employee._id),
        year,
        month,
        isDeleted: { $ne: true },
      },
    },
    { $group: { _id: "$kind", total: { $sum: "$amount" } } },
  ]);
  const manualBonusTotal =
    adjustments.find((a) => a._id === "bonus")?.total || 0;
  const penaltyTotal = adjustments.find((a) => a._id === "penalty")?.total || 0;

  // YAKUNIY FORMULA.
  // Manfiy chiqmaydi: jarima oylikdan katta bo'lsa 0 (qarz keyingi oyga
  // ko'chirilmaydi - buni odam qo'lda hal qiladi).
  const finalAmount = Math.max(
    0,
    fixedAmount + autoKpiTotal + manualBonusTotal - penaltyTotal,
  );

  const updated = await StaffPayroll.findByIdAndUpdate(
    payroll._id,
    {
      $set: {
        branchId,
        salaryType,
        baseAmount: lastComp?.baseAmount || 0,
        prorationFactor: totalDays ? payableDays / totalDays : 0,
        payableDays,
        totalDays,
        fixedAmount,
        autoKpiTotal,
        manualBonusTotal,
        penaltyTotal,
        finalAmount,
        status: deriveStatus(payroll.paidAmount || 0, finalAmount),
        computedAt: new Date(),
      },
    },
    { new: true },
  );

  return updated;
};

/**
 * Oylik generatsiya - barcha xodimlar uchun.
 *
 * Kimlar? Shu oyda amal qilgan shartnomasi bor xodimlar. O'qituvchi
 * moduli guruhlar bo'ylab yuradi va xodimni HECH QACHON topmasdi -
 * shuning uchun bu yerda enumeratsiya shartnomadan boshlanadi.
 */
export const generateMonth = async (year, month) => {
  const { start, endExcl } = monthRange(year, month);

  const employeeIds = await StaffCompensation.distinct("employee", {
    isDeleted: { $ne: true },
    effectiveFrom: { $lt: endExcl },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gt: start } }],
  });

  let computed = 0;
  for (const id of employeeIds) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await computePayroll(id, year, month);
      computed += 1;
    } catch (err) {
      // Bitta xodimning xatosi butun generatsiyani to'xtatmasin.
      logger.warn(
        { err: err?.message, employee: String(id), year, month },
        "Xodim maoshini hisoblab bo'lmadi",
      );
    }
  }

  return { employees: employeeIds.length, computed };
};

/**
 * OYNI YOPISH / QAYTA OCHISH.
 *
 * Yopilgandan keyin avtomatik qayta hisoblash bu qatorga tegmaydi.
 * Qayta ochish - ataylab qilinadigan amal (egasi xato topgan bo'lsa).
 */
export const setLifecycle = async (id, lifecycle, currentUser) => {
  const payroll = await StaffPayroll.findById(id);
  if (!payroll) throw new ApiError(404, "Maosh qatori topilmadi");

  if (lifecycle === "finalized") {
    payroll.lifecycle = "finalized";
    payroll.finalizedAt = new Date();
    payroll.finalizedBy = currentUser?._id || null;
  } else {
    payroll.lifecycle = "draft";
    payroll.finalizedAt = null;
    payroll.finalizedBy = null;
  }
  await payroll.save();

  // Qayta ochilganda darhol yangi raqamni ko'rsatamiz.
  if (lifecycle !== "finalized") {
    return computePayroll(payroll.employee, payroll.year, payroll.month, {
      force: true,
    });
  }
  return payroll;
};

/** Maosh qatorlari ro'yxati (filial ko'lami bilan). */
export const list = async ({
  year,
  month,
  employeeId,
  status,
  page = 1,
  limit = 50,
}) => {
  const filter = {};
  if (year) filter.year = Number(year);
  if (month) filter.month = Number(month);
  if (employeeId) filter.employee = toId(employeeId);
  if (status) filter.status = status;

  // FILIAL KO'LAMI.
  //
  // DIQQAT: shart `$and` ichiga qo'shiladi va `employee` filtri bilan
  // ALMASHTIRILMAYDI. Aks holda aniq employeeId berilganda filial sharti
  // butunlay tushib qolardi - ya'ni boshqa filial xodimining maoshini
  // ID bilan so'rab olish mumkin bo'lardi (jimgina sizish).
  const branchCond = userBranchCondition();
  if (branchCond) {
    const ids = await User.find(
      { $and: [branchCond], isDeleted: { $ne: true } },
      { _id: 1 },
    ).lean();
    filter.$and = [
      ...(filter.$and || []),
      { employee: { $in: ids.map((u) => u._id) } },
    ];
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    StaffPayroll.find(filter)
      .sort({ year: -1, month: -1, finalAmount: -1 })
      .skip(skip)
      .limit(limit)
      .populate("employee", { firstName: 1, lastName: 1, role: 1, username: 1 })
      .populate("branchId", { name: 1, code: 1 })
      .lean(),
    StaffPayroll.countDocuments(filter),
  ]);

  // Rol yorlig'i - ro'yxatda "direktor" xom qiymat bo'lib ko'rinmasin.
  const catalog = await loadRoleCatalog();
  const withRole = items.map((p) => ({
    ...p,
    roleLabel: catalog.get(p.employee?.role)?.label || p.employee?.role || "",
  }));

  return { items: withRole, total, page, limit };
};

/** Bitta qator + to'liq tafsilot (KPI qatorlari, bonus/jarima). */
export const getById = async (id) => {
  const payroll = await StaffPayroll.findById(id)
    .populate("employee", { firstName: 1, lastName: 1, role: 1, username: 1 })
    .populate("branchId", { name: 1, code: 1 })
    .lean();
  if (!payroll) throw new ApiError(404, "Maosh qatori topilmadi");

  const [items, adjustments] = await Promise.all([
    StaffPayrollItem.find({ payroll: payroll._id }).sort({ amount: -1 }).lean(),
    StaffPayrollAdjustment.find({
      employee: payroll.employee._id,
      year: payroll.year,
      month: payroll.month,
      isDeleted: { $ne: true },
    })
      .sort({ createdAt: -1 })
      .populate("createdBy", { firstName: 1, lastName: 1 })
      .lean(),
  ]);

  return {
    ...payroll,
    items,
    bonuses: adjustments.filter((a) => a.kind === "bonus"),
    penalties: adjustments.filter((a) => a.kind === "penalty"),
  };
};

/** Xodimning maosh tarixi (profil bo'limi uchun). */
export const historyByEmployee = async (employeeId, { limit = 12 } = {}) => {
  const items = await StaffPayroll.find({ employee: toId(employeeId) })
    .sort({ year: -1, month: -1 })
    .limit(limit)
    .lean();

  const summary = items.reduce(
    (acc, p) => ({
      months: acc.months + 1,
      totalFinal: acc.totalFinal + (p.finalAmount || 0),
      totalPaid: acc.totalPaid + (p.paidAmount || 0),
    }),
    { months: 0, totalFinal: 0, totalPaid: 0 },
  );
  summary.totalRemaining = Math.max(0, summary.totalFinal - summary.totalPaid);

  return { items, summary };
};

/**
 * To'lov keshini ATOMAR o'zgartirish.
 *
 * capToRemaining - qoldiqdan oshib ketishga yo'l qo'ymaydi: ikki marta
 * bosilgan "To'lash" tugmasi ikki barobar to'lovga aylanmaydi.
 * Yangilanish bitta agregatsiya-quvuri bilan bajariladi, ya'ni holat
 * DB'dagi JORIY paidAmount asosida chiqadi (poyga yo'q).
 */
export const applyPaidDelta = async (payrollId, delta, { capToRemaining = false } = {}) => {
  const filter = { _id: payrollId };
  if (capToRemaining && delta > 0) {
    filter.$expr = {
      $lte: [{ $add: ["$paidAmount", delta] }, "$finalAmount"],
    };
  }

  return StaffPayroll.findOneAndUpdate(
    filter,
    [
      {
        $set: {
          paidAmount: { $max: [0, { $add: ["$paidAmount", delta] }] },
        },
      },
      {
        $set: {
          status: {
            $switch: {
              branches: [
                { case: { $lte: ["$paidAmount", 0] }, then: "unpaid" },
                {
                  case: { $gte: ["$paidAmount", "$finalAmount"] },
                  then: "paid",
                },
              ],
              default: "partial",
            },
          },
        },
      },
    ],
    { new: true },
  );
};
