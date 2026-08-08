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
import * as auditService from "./payrollAudit.service.js";
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
  { save = true, force = false, source = "auto", actor = null, reason = "" } = {},
) => {
  const employee = await User.findById(employeeId).lean();
  if (!employee) throw new ApiError(404, "Xodim topilmadi");
  if (employee.role === ROLES.STUDENT) {
    throw new ApiError(400, "O'quvchiga maosh hisoblanmaydi");
  }

  // ─── MOLIYAVIY CHEGARA ───
  //
  // `payrollStartFrom` - tizim qaysi sanadan boshlab maosh hisoblaydi.
  // Markaz boshqa CRM'dan ko'chib kelgan bo'lsa, undan oldingi oylar
  // ALLAQACHON to'langan va bu yerda qayta yaratilmasligi kerak.
  //
  // Tekshiruv aynan SHU YERDA turadi - hamma yo'l (oylik job, qo'lda
  // hisoblash, shartnoma o'zgarishi, bonus qo'shish) shu funksiyadan
  // o'tadi. Uni yuqoriroq qatlamga qo'yish bitta yo'lni ochiq qoldirardi.
  if (employee.payrollStartFrom) {
    const boundary = employee.payrollStartFrom;
    const monthEnd = new Date(Date.UTC(year, month, 1));
    if (monthEnd <= boundary) {
      const existing = await StaffPayroll.findOne({
        employee: employee._id,
        year,
        month,
      });
      // Mavjud qatorni O'CHIRMAYMIZ - u qo'lda kiritilgan bo'lishi mumkin.
      return existing || null;
    }
  }

  // ─── O'ZGARMAS DAVR ───
  //
  // Yopilgan YOKI to'lov qilingan oy qayta hisoblanmaydi. To'langanlik
  // ham kiritilgan: pul chiqib bo'lgandan keyin summani o'zgartirish
  // kassa bilan hisobot orasida farq qoldirardi.
  //
  // `force` bu to'siqni OCHMAYDI - u faqat "yopilganini bilaman, baribir
  // hisobla" degan ichki chaqiruvlar uchun emas, balki qayta ochilgan
  // oyni darhol hisoblash uchun ishlatiladi (setLifecycle).
  if (save) {
    const existing = await StaffPayroll.findOne(
      { employee: employee._id, year, month },
      { lifecycle: 1, paidAmount: 1, finalAmount: 1, employee: 1, year: 1, month: 1 },
    ).lean();

    const immutable =
      existing &&
      (existing.lifecycle === "finalized" || (existing.paidAmount || 0) > 0);

    if (immutable && !force) {
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

  // Yaratilishidan OLDINGI holat - audit uchun ("nima edi").
  const before = await StaffPayroll.findOne(
    { employee: employee._id, year, month },
    { finalAmount: 1, fixedAmount: 1, autoKpiTotal: 1, manualBonusTotal: 1, penaltyTotal: 1 },
  ).lean();

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
  let appliedRules = [];
  if (salaryType === "fixed_plus_kpi" || salaryType === "kpi_only") {
    const res = await rebuildAutoKpi({ payroll, employee });
    autoKpiTotal = res.total;
    appliedRules = res.appliedRules || [];
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
  const totalOf = (kind) => adjustments.find((a) => a._id === kind)?.total || 0;
  const manualBonusTotal = totalOf("bonus");
  const penaltyTotal = totalOf("penalty");
  const openingCreditTotal = totalOf("opening_credit");
  const openingDebtTotal = totalOf("opening_debt");

  // YAKUNIY FORMULA.
  //
  // Jarima: manfiy chiqmaydi, ortiqchasi YO'QOLADI (eski qoida - buni
  // odam qo'lda hal qiladi).
  //
  // Boshlang'ich qarz: BOSHQACHA. U haqiqiy pul, shuning uchun shu oyda
  // ushlab qololmagan qismi yo'qolmaydi - `openingDebtApplied` bilan
  // qayd etiladi va farqi keyingi oyga ko'chiriladi (carryOverOpeningDebt).
  const gross =
    fixedAmount + autoKpiTotal + manualBonusTotal + openingCreditTotal - penaltyTotal;
  const availableForDebt = Math.max(0, gross);
  const openingDebtApplied = Math.min(openingDebtTotal, availableForDebt);
  const finalAmount = Math.max(0, gross - openingDebtApplied);

  // ─── SNAPSHOT ───
  //
  // Qator hisob KUNIDAGI holatni o'zida saqlaydi. Ertaga stavka
  // oshirilsa yoki KPI qoidasi o'zgartirilsa ham, bu oyni ochgan odam
  // raqam QANDAY chiqqanini ko'radi. Aks holda tarix qayta yozilgandek
  // ko'rinardi.
  const snapshot = {
    takenAt: new Date(),
    compensation: lastComp
      ? {
          id: String(lastComp._id),
          salaryType: lastComp.salaryType,
          baseAmount: lastComp.baseAmount,
          effectiveFrom: lastComp.effectiveFrom,
          effectiveTo: lastComp.effectiveTo,
        }
      : null,
    segments: segments.map((seg) => ({
      from: seg.from,
      toExcl: seg.toExcl,
      days: seg.days,
      salaryType: seg.comp.salaryType,
      baseAmount: seg.comp.baseAmount,
    })),
    kpiRules: appliedRules,
    proration: { payableDays, totalDays },
    totals: {
      fixedAmount,
      autoKpiTotal,
      manualBonusTotal,
      penaltyTotal,
      openingCreditTotal,
      openingDebtTotal,
      openingDebtApplied,
      finalAmount,
    },
  };

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
        openingCreditTotal,
        openingDebtTotal,
        openingDebtApplied,
        finalAmount,
        status: deriveStatus(payroll.paidAmount || 0, finalAmount),
        computedAt: new Date(),
        source,
        snapshot,
      },
    },
    { new: true },
  );

  // AUDIT: yaratildimi yoki qayta hisoblandimi - ikkalasi ham yoziladi.
  await auditService.record({
    employee: employee._id,
    year,
    month,
    action: before
      ? auditService.PAYROLL_AUDIT_ACTIONS.RECALCULATED
      : auditService.PAYROLL_AUDIT_ACTIONS.GENERATED,
    targetType: "staffPayroll",
    targetId: updated._id,
    oldValue: before
      ? {
          finalAmount: before.finalAmount,
          fixedAmount: before.fixedAmount,
          autoKpiTotal: before.autoKpiTotal,
        }
      : null,
    newValue: { finalAmount, fixedAmount, autoKpiTotal },
    reason,
    actor,
    meta: { source },
  });

  return updated;
};

/**
 * USHLAB QOLINMAGAN BOSHLANG'ICH QARZNI KEYINGI OYGA KO'CHIRADI.
 *
 * MUAMMO: xodimning boshlang'ich qarzi 3 mln, oylik maoshi 2 mln.
 * finalAmount manfiy bo'la olmaydi, ya'ni o'sha oy 0 to'lanadi va
 * qolgan 1 mln HECH QAYERDA QOLMAYDI - pul jimgina yo'qoladi.
 * Jarima uchun bu qabul qilingan (odam qo'lda hal qiladi), boshlang'ich
 * qarz uchun esa YO'Q: u tizimga import qilingan haqiqiy summa va
 * balansdan yo'qolsa hisob-kitob abadiy noto'g'ri qoladi.
 *
 * YECHIM: o'tgan oyning `openingDebtTotal - openingDebtApplied` farqi
 * shu oyga yangi `opening_debt` qatori bo'lib ko'chiriladi.
 *
 * IKKI BARAVAR USHLAB QOLISHDAN HIMOYA - bu yerda eng muhimi. Funksiya
 * har oy boshida job orqali, server qayta yonganida catch-up orqali va
 * qo'lda regenerate orqali ham chaqiriladi. Himoya ikki qavatli:
 *   1) partial unique indeks {employee,year,month,kind} - DB darajasida
 *      bitta oyga ikkinchi opening_debt qatori UMUMAN yozilmaydi;
 *   2) E11000 jimgina yutiladi (qator allaqachon bor = ish bajarilgan).
 *
 * DIQQAT (ma'lum cheklov): ko'chirilgandan KEYIN o'tgan oy qayta
 * hisoblansa va `openingDebtApplied` o'zgarsa, ko'chirilgan summa
 * eskirib qoladi. Avtomatik tuzatilmaydi - ataylab: qarzni jimgina
 * qayta yozish undan ham xavfliroq. Farq audit hisobotida ko'rinadi.
 */
export const carryOverOpeningDebt = async (year, month) => {
  // O'tgan oy (yanvarda - o'tgan yilning dekabri).
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;

  // XODIMLAR RO'YXATI BO'YICHA FILTRLANMAYDI - ataylab.
  //
  // generateMonth xodimlarni SHARTNOMA (StaffCompensation) bo'yicha
  // sanaydi. Shartnomasi tugagan, lekin qarzi qolgan xodim o'sha
  // ro'yxatga tushmaydi - va agar bu yerda ham filtrlasak, uning qarzi
  // ko'chirilmay zanjir UZILARDI va pul yo'qolardi. Shuning uchun manba
  // faqat "o'tgan oyda ushlanmagan qarzi bor" sharti.
  const prevPayrolls = await StaffPayroll.find(
    {
      year: prevYear,
      month: prevMonth,
      $expr: { $gt: ["$openingDebtTotal", "$openingDebtApplied"] },
    },
    { employee: 1, branchId: 1, openingDebtTotal: 1, openingDebtApplied: 1 },
  ).lean();

  const carriedEmployeeIds = [];
  let carried = 0;
  for (const p of prevPayrolls) {
    const remaining =
      (p.openingDebtTotal || 0) - (p.openingDebtApplied || 0);
    if (remaining <= 0) continue;

    try {
      // eslint-disable-next-line no-await-in-loop
      await StaffPayrollAdjustment.create({
        employee: p.employee,
        branchId: p.branchId || null,
        year,
        month,
        kind: "opening_debt",
        amount: remaining,
        reason: `Boshlang'ich qarz qoldig'i (${prevMonth}/${prevYear} oyidan ko'chirildi)`,
        carriedFrom: { year: prevYear, month: prevMonth },
      });
      carried += 1;
      carriedEmployeeIds.push(p.employee);
    } catch (err) {
      // E11000 = shu oyga allaqachon ko'chirilgan. Bu XATO EMAS, bu
      // idempotentlik ishlagani. Lekin xodim baribir ro'yxatga tushadi:
      // qator bor, ammo uning oylik hisobi hali qurilmagan bo'lishi
      // mumkin (birinchi urinish yarim yo'lda uzilgan bo'lsa).
      if (err?.code === 11000) {
        carriedEmployeeIds.push(p.employee);
        continue;
      }
      logger.warn(
        { err: err?.message, employee: String(p.employee), year, month },
        "Boshlang'ich qarz qoldig'ini ko'chirib bo'lmadi",
      );
    }
  }

  if (carried) {
    logger.info({ year, month, carried }, "Boshlang'ich qarz qoldiqlari ko'chirildi");
  }
  return { carried, employeeIds: carriedEmployeeIds };
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

  // KO'CHIRISH HISOBLASHDAN OLDIN: yangi oyning qatori yaratilishidan
  // avval o'tgan oyda ushlab qololmagan boshlang'ich qarz shu oyga
  // o'tkaziladi - aks holda birinchi computePayroll qarzsiz hisoblanib,
  // keyin ikkinchi marta qayta hisoblash kerak bo'lardi.
  const carryOver = await carryOverOpeningDebt(year, month);

  // Qarzi ko'chirilgan xodim shartnoma ro'yxatida bo'lmasligi mumkin
  // (shartnomasi tugagan, lekin qarzi qolgan). Uni qo'shmasak shu oyga
  // payroll qatori yaratilmasdi va KEYINGI oy ko'chirish zanjiri
  // uzilardi - qarz o'sha oyda muzlab qolardi.
  const targetIds = [
    ...new Map(
      [...employeeIds, ...carryOver.employeeIds].map((id) => [String(id), id]),
    ).values(),
  ];

  let computed = 0;
  for (const id of targetIds) {
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

  return { employees: targetIds.length, computed, carried: carryOver.carried };
};

/**
 * OYNI YOPISH / QAYTA OCHISH.
 *
 * Yopilgandan keyin avtomatik qayta hisoblash bu qatorga tegmaydi.
 * Qayta ochish - ataylab qilinadigan amal (egasi xato topgan bo'lsa).
 */
export const setLifecycle = async (id, lifecycle, currentUser, { reason = "" } = {}) => {
  const payroll = await StaffPayroll.findById(id);
  if (!payroll) throw new ApiError(404, "Maosh qatori topilmadi");

  // QULFNI OCHISH - sabab MAJBURIY. Yopilgan moliyaviy davrni qayta
  // ochish istisno hodisa; auditda "nega" yozilmasa, keyin tushuntirib
  // bo'lmaydi.
  if (lifecycle !== "finalized" && payroll.lifecycle === "finalized" && !reason.trim()) {
    throw new ApiError(400, "Qulfni ochish sababini ko'rsating");
  }

  const previous = payroll.lifecycle;

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

  await auditService.record({
    employee: payroll.employee,
    year: payroll.year,
    month: payroll.month,
    action:
      lifecycle === "finalized"
        ? auditService.PAYROLL_AUDIT_ACTIONS.LOCKED
        : auditService.PAYROLL_AUDIT_ACTIONS.UNLOCKED,
    targetType: "staffPayroll",
    targetId: payroll._id,
    oldValue: { lifecycle: previous },
    newValue: { lifecycle },
    reason,
    actor: currentUser,
  });

  // Qayta ochilganda darhol yangi raqamni ko'rsatamiz. `force` shu yerda
  // O'RINLI: qulf ataylab ochildi, ya'ni bu egasining qarori.
  if (lifecycle !== "finalized") {
    return computePayroll(payroll.employee, payroll.year, payroll.month, {
      force: true,
      source: "manual",
      actor: currentUser,
      reason,
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
