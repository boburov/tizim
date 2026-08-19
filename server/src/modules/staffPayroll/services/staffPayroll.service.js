import { Prisma } from "@prisma/client";
import prisma from "../../../config/prisma.js";
import ApiError from "../../../utils/ApiError.js";
import logger from "../../../config/logger.js";
import { ROLES } from "../../../constants/roles.js";
import { loadRoleCatalog } from "../../../helpers/roles.helper.js";
import {
  userBranchCondition,
  assertUserInBranchScope,
} from "../../../helpers/branchContext.helper.js";
import { daysInMonth, deriveStatus } from "../../finance/services/proration.helper.js";
import { withLegacyId, withLegacyIds } from "../../../utils/serialize.js";
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
 *
 * ═══════════════════════════════════════════════════════════════════
 * MONGO → PRISMA
 *   { employee: id } → { employeeId: id }   (relation emas, USTUN)
 *   { payroll: id }  → { payrollId: id }
 *   carriedFrom: { year, month } → carriedFromYear / carriedFromMonth
 *       (Mongo'dagi ichki obyekt Prisma'da YASSILANGAN)
 *   $expr: { $gt: [a, b] } → { a: { gt: prisma.model.fields.b } }
 *   .distinct("employee") → findMany({ distinct, select })
 *   err.code 11000 → err.code "P2002"
 *   findOneAndUpdate(..., upsert) → upsert (@@unique([employeeId,year,month]))
 *
 * ATOMIK TO'LOV: `applyPaidDelta` Mongo'da aggregation update pipeline
 * edi - status BAZADAGI joriy `paidAmount` dan bitta amalda chiqarilardi.
 * Prisma'da bunday quvur yo'q, shuning uchun u BITTA XOM `UPDATE` ga
 * ko'chirildi (teacherSalary/studentPayment bilan bir xil naqsh).
 * "O'qi → hisobla → yoz" naqshi YO'Q - u yo'qolgan to'lov demakdir.
 * ═══════════════════════════════════════════════════════════════════
 */

const actorId = (u) => u?.id || u?._id || null;

// Xodim/filial ma'lumoti ro'yxat va tafsilotda bir xil bo'lsin.
const EMPLOYEE_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  role: true,
  username: true,
};
const BRANCH_SELECT = { id: true, name: true, code: true };

// `branch` relation'ini eski `branchId` nomiga qaytaradi.
//
// Mongoose `.populate("branchId")` maydonning O'ZINI obyektga
// aylantirardi va client shunga tayanadi. Prisma esa `branchId` ni satr
// qoldirib, obyektni `branch` deb alohida beradi.
const shapePayroll = (row) => {
  if (!row) return row;
  const out = withLegacyId(row);
  if (row.branch !== undefined) {
    out.branchId = row.branch ? withLegacyId(row.branch) : null;
    delete out.branch;
  }
  return out;
};

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
  const employee = await prisma.user.findUnique({
    where: { id: String(employeeId) },
    select: {
      id: true,
      role: true,
      homeBranchId: true,
      payrollStartFrom: true,
      firstName: true,
      lastName: true,
      username: true,
    },
  });
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
      const existing = await prisma.staffPayroll.findUnique({
        where: { employeeId_year_month: { employeeId: employee.id, year, month } },
      });
      // Mavjud qatorni O'CHIRMAYMIZ - u qo'lda kiritilgan bo'lishi mumkin.
      return existing ? withLegacyId(existing) : null;
    }
  }

  // ─── O'ZGARMAS DAVR ───
  //
  // Yopilgan YOKI to'lov qilingan oy qayta hisoblanmaydi. To'langanlik
  // ham kiritilgan: pul chiqib bo'lgandan keyin summani o'zgartirish
  // kassa bilan hisobot orasida farq qoldirardi.
  //
  // `force` bu to'siqni faqat OCHIQ qaror bilan chetlab o'tadi
  // (setLifecycle - qulf ataylab ochilgan).
  if (save) {
    const existing = await prisma.staffPayroll.findUnique({
      where: { employeeId_year_month: { employeeId: employee.id, year, month } },
      select: { id: true, lifecycle: true, paidAmount: true },
    });

    const immutable =
      existing &&
      (existing.lifecycle === "finalized" || (existing.paidAmount || 0) > 0);

    if (immutable && !force) {
      const row = await prisma.staffPayroll.findUnique({ where: { id: existing.id } });
      return withLegacyId(row);
    }
  }

  const { start, endExcl } = monthRange(year, month);

  // Amal qilayotgan shartnomalar (oy bilan kesishganlari).
  //
  // TARTIB `createdAt` bilan mustahkamlangan: bir xil `effectiveFrom`
  // bo'lgan ikki shartnomada oxirgi segment (lastComp) qaysi biri
  // ekani BARQAROR bo'lishi kerak, aks holda `salaryType`/`branchId`
  // har qayta hisoblanganda o'zgarib ketardi.
  const comps = await prisma.staffCompensation.findMany({
    where: {
      employeeId: employee.id,
      isDeleted: false,
      effectiveFrom: { lt: endExcl },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: start } }],
    },
    orderBy: [{ effectiveFrom: "asc" }, { createdAt: "asc" }],
  });

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
  const before = await prisma.staffPayroll.findUnique({
    where: { employeeId_year_month: { employeeId: employee.id, year, month } },
    select: {
      finalAmount: true,
      fixedAmount: true,
      autoKpiTotal: true,
      manualBonusTotal: true,
      penaltyTotal: true,
    },
  });

  // Qator (yo'q bo'lsa yaratiladi) - KPI qatorlari unga bog'lanadi.
  // `@@unique([employeeId, year, month])` HAQIQIY unique kalit, shuning
  // uchun Prisma'ning tabiiy `upsert` i ishlaydi: bir xodimga bir oyda
  // ikkinchi maosh qatori bazada yaratilishi MUMKIN EMAS.
  const payroll = await prisma.staffPayroll.upsert({
    where: { employeeId_year_month: { employeeId: employee.id, year, month } },
    update: { branchId, salaryType, baseAmount: lastComp?.baseAmount || 0 },
    create: {
      employeeId: employee.id,
      year,
      month,
      branchId,
      salaryType,
      baseAmount: lastComp?.baseAmount || 0,
      paidAmount: 0,
    },
  });

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
    await prisma.staffPayrollItem.deleteMany({ where: { payrollId: payroll.id } });
  }

  // QO'LDA kiritilgan bonus/jarima - qayta hisoblash ularga TEGMAYDI,
  // faqat yig'indisini oladi.
  const adjustments = await prisma.staffPayrollAdjustment.groupBy({
    by: ["kind"],
    where: { employeeId: employee.id, year, month, isDeleted: false },
    _sum: { amount: true },
  });
  const totalOf = (kind) =>
    adjustments.find((a) => a.kind === kind)?._sum.amount || 0;
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
          id: String(lastComp.id),
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

  const updated = await prisma.staffPayroll.update({
    where: { id: payroll.id },
    data: {
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
      // `snapshot` Prisma'da `Json?` - Date obyektlari JSON'ga
      // seriyalanadi (Mongo'da ham Mixed edi, xulq bir xil).
      snapshot,
    },
  });

  // AUDIT: yaratildimi yoki qayta hisoblandimi - ikkalasi ham yoziladi.
  await auditService.record({
    employee: employee.id,
    year,
    month,
    action: before
      ? auditService.PAYROLL_AUDIT_ACTIONS.RECALCULATED
      : auditService.PAYROLL_AUDIT_ACTIONS.GENERATED,
    targetType: "staffPayroll",
    targetId: updated.id,
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

  return withLegacyId(updated);
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
 *   1) qisman unique indeks (employeeId, year, month, kind)
 *      WHERE kind IN ('opening_credit','opening_debt') - DB darajasida
 *      bitta oyga ikkinchi opening_debt qatori UMUMAN yozilmaydi;
 *   2) P2002 jimgina yutiladi (qator allaqachon bor = ish bajarilgan).
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
  //
  // Mongo `$expr: { $gt: [...] }` → Prisma "field reference".
  const prevPayrolls = await prisma.staffPayroll.findMany({
    where: {
      year: prevYear,
      month: prevMonth,
      openingDebtTotal: { gt: prisma.staffPayroll.fields.openingDebtApplied },
    },
    select: {
      employeeId: true,
      branchId: true,
      openingDebtTotal: true,
      openingDebtApplied: true,
    },
  });

  const carriedEmployeeIds = [];
  let carried = 0;
  for (const p of prevPayrolls) {
    const remaining =
      (p.openingDebtTotal || 0) - (p.openingDebtApplied || 0);
    if (remaining <= 0) continue;

    try {
      // eslint-disable-next-line no-await-in-loop
      await prisma.staffPayrollAdjustment.create({
        data: {
          employeeId: p.employeeId,
          branchId: p.branchId || null,
          year,
          month,
          kind: "opening_debt",
          amount: remaining,
          reason: `Boshlang'ich qarz qoldig'i (${prevMonth}/${prevYear} oyidan ko'chirildi)`,
          // Mongo'da `carriedFrom: { year, month }` ichki obyekt edi -
          // Prisma'da YASSILANGAN ikki ustun.
          carriedFromYear: prevYear,
          carriedFromMonth: prevMonth,
        },
      });
      carried += 1;
      carriedEmployeeIds.push(p.employeeId);
    } catch (err) {
      // P2002 = shu oyga allaqachon ko'chirilgan. Bu XATO EMAS, bu
      // idempotentlik ishlagani. Lekin xodim baribir ro'yxatga tushadi:
      // qator bor, ammo uning oylik hisobi hali qurilmagan bo'lishi
      // mumkin (birinchi urinish yarim yo'lda uzilgan bo'lsa).
      if (err?.code === "P2002") {
        carriedEmployeeIds.push(p.employeeId);
        continue;
      }
      logger.warn(
        { err: err?.message, employee: String(p.employeeId), year, month },
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

  const compRows = await prisma.staffCompensation.findMany({
    where: {
      isDeleted: false,
      effectiveFrom: { lt: endExcl },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: start } }],
    },
    select: { employeeId: true },
    distinct: ["employeeId"],
  });
  const employeeIds = compRows.map((r) => r.employeeId);

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
  const payroll = await prisma.staffPayroll.findUnique({ where: { id: String(id) } });
  if (!payroll) throw new ApiError(404, "Maosh qatori topilmadi");
  // FILIAL QO'RIQCHISI - `id` params/body dan keladi (xavfsizlik tuzatishi).
  // Bu yo'l oyni QULFLAYDI/OCHADI va ochilganda darhol qayta hisoblaydi,
  // ya'ni begona filial maoshini o'zgartira olardi.
  await assertUserInBranchScope(payroll.employeeId);

  // QULFNI OCHISH - sabab MAJBURIY. Yopilgan moliyaviy davrni qayta
  // ochish istisno hodisa; auditda "nega" yozilmasa, keyin tushuntirib
  // bo'lmaydi.
  if (lifecycle !== "finalized" && payroll.lifecycle === "finalized" && !reason.trim()) {
    throw new ApiError(400, "Qulfni ochish sababini ko'rsating");
  }

  const previous = payroll.lifecycle;

  const data =
    lifecycle === "finalized"
      ? {
          lifecycle: "finalized",
          finalizedAt: new Date(),
          finalizedById: actorId(currentUser),
        }
      : { lifecycle: "draft", finalizedAt: null, finalizedById: null };

  const saved = await prisma.staffPayroll.update({ where: { id: payroll.id }, data });

  await auditService.record({
    employee: payroll.employeeId,
    year: payroll.year,
    month: payroll.month,
    action:
      lifecycle === "finalized"
        ? auditService.PAYROLL_AUDIT_ACTIONS.LOCKED
        : auditService.PAYROLL_AUDIT_ACTIONS.UNLOCKED,
    targetType: "staffPayroll",
    targetId: payroll.id,
    oldValue: { lifecycle: previous },
    newValue: { lifecycle },
    reason,
    actor: currentUser,
  });

  // Qayta ochilganda darhol yangi raqamni ko'rsatamiz. `force` shu yerda
  // O'RINLI: qulf ataylab ochildi, ya'ni bu egasining qarori.
  if (lifecycle !== "finalized") {
    return computePayroll(payroll.employeeId, payroll.year, payroll.month, {
      force: true,
      source: "manual",
      actor: currentUser,
      reason,
    });
  }
  return withLegacyId(saved);
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
  const where = {};
  if (year) where.year = Number(year);
  if (month) where.month = Number(month);
  if (employeeId) where.employeeId = String(employeeId);
  if (status) where.status = status;

  // FILIAL KO'LAMI.
  //
  // DIQQAT: shart `AND` ichiga qo'shiladi va `employeeId` filtri bilan
  // ALMASHTIRILMAYDI. Aks holda aniq employeeId berilganda filial sharti
  // butunlay tushib qolardi - ya'ni boshqa filial xodimining maoshini
  // ID bilan so'rab olish mumkin bo'lardi (jimgina sizish).
  //
  // `userBranchCondition()` FOYDALANUVCHI ustidagi shartni beradi
  // (homeBranchId YOKI branchAssignments), shuning uchun u
  // `employee` relation'iga qo'llanadi - StaffPayroll.branchId
  // shartnomadan meros bo'lgani uchun undan ishonchliroq.
  const branchCond = userBranchCondition();
  if (branchCond) {
    where.AND = [
      ...(where.AND || []),
      { employee: { AND: [branchCond], isDeleted: false } },
    ];
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    prisma.staffPayroll.findMany({
      where,
      orderBy: [{ year: "desc" }, { month: "desc" }, { finalAmount: "desc" }],
      skip,
      take: limit,
      include: {
        employee: { select: EMPLOYEE_SELECT },
        branch: { select: BRANCH_SELECT },
      },
    }),
    prisma.staffPayroll.count({ where }),
  ]);

  // Rol yorlig'i - ro'yxatda "direktor" xom qiymat bo'lib ko'rinmasin.
  const catalog = await loadRoleCatalog();
  const withRole = items.map((p) => ({
    ...shapePayroll(p),
    roleLabel: catalog.get(p.employee?.role)?.label || p.employee?.role || "",
  }));

  return { items: withRole, total, page, limit };
};

/** Bitta qator + to'liq tafsilot (KPI qatorlari, bonus/jarima). */
export const getById = async (id) => {
  const payroll = await prisma.staffPayroll.findUnique({
    where: { id: String(id) },
    include: {
      employee: { select: EMPLOYEE_SELECT },
      branch: { select: BRANCH_SELECT },
    },
  });
  if (!payroll) throw new ApiError(404, "Maosh qatori topilmadi");
  // FILIAL QO'RIQCHISI (xavfsizlik tuzatishi, ko'chirish emas).
  // `id` to'g'ridan-to'g'ri params dan keladi va hech qanday filtr
  // qo'llanmaydi - filial direktori boshqa filial xodimining maosh
  // qatorini ID ni qo'lda kiritib ocha olardi.
  await assertUserInBranchScope(payroll.employeeId);

  const [items, adjustments] = await Promise.all([
    prisma.staffPayrollItem.findMany({
      where: { payrollId: payroll.id },
      orderBy: { amount: "desc" },
    }),
    prisma.staffPayrollAdjustment.findMany({
      where: {
        employeeId: payroll.employeeId,
        year: payroll.year,
        month: payroll.month,
        isDeleted: false,
      },
      orderBy: { createdAt: "desc" },
      include: {
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    }),
  ]);

  return {
    ...shapePayroll(payroll),
    items: withLegacyIds(items),
    bonuses: withLegacyIds(adjustments.filter((a) => a.kind === "bonus")),
    penalties: withLegacyIds(adjustments.filter((a) => a.kind === "penalty")),
  };
};

/** Xodimning maosh tarixi (profil bo'limi uchun). */
export const historyByEmployee = async (employeeId, { limit = 12 } = {}) => {
  // FILIAL QO'RIQCHISI - `employeeId` params dan keladi (xavfsizlik tuzatishi).
  await assertUserInBranchScope(employeeId);
  const items = await prisma.staffPayroll.findMany({
    where: { employeeId: String(employeeId) },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    take: limit,
  });

  const summary = items.reduce(
    (acc, p) => ({
      months: acc.months + 1,
      totalFinal: acc.totalFinal + (p.finalAmount || 0),
      totalPaid: acc.totalPaid + (p.paidAmount || 0),
    }),
    { months: 0, totalFinal: 0, totalPaid: 0 },
  );
  summary.totalRemaining = Math.max(0, summary.totalFinal - summary.totalPaid);

  return { items: withLegacyIds(items), summary };
};

/**
 * To'lov keshini ATOMAR o'zgartirish.
 *
 * capToRemaining - qoldiqdan oshib ketishga yo'l qo'ymaydi: ikki marta
 * bosilgan "To'lash" tugmasi ikki barobar to'lovga aylanmaydi.
 *
 * BITTA XOM `UPDATE`: SQL'da o'ng tomondagi ustun ESKI qiymatni beradi,
 * ya'ni Mongo'dagi update-pipeline bilan aynan bir xil semantika -
 * status DB'dagi JORIY `paidAmount` dan chiqadi va poyga oynasi yo'q.
 *
 * DIQQAT - KLAMP: yangi `paidAmount` NOLDAN PASTGA tushmaydi
 * (`GREATEST(0, ...)`), va status AYNAN shu klamplangan qiymatdan
 * hisoblanadi. Mongo quvurida ham ikkinchi `$set` bosqichi birinchisi
 * yozgan qiymatni ko'rardi - shuning uchun bu yerda ham bitta ifoda
 * ikki marta takrorlanadi, xom `paidAmount + delta` EMAS.
 *
 * `updatedAt`: Prisma'ning `@updatedAt` KLIENT tomonida ishlaydi, xom
 * SQL uni chetlab o'tadi - ochiq yoziladi.
 */
export const applyPaidDelta = async (payrollId, delta, { capToRemaining = false } = {}) => {
  const id = String(payrollId);
  const d = Number(delta) || 0;

  const setClause = Prisma.sql`
    SET "paidAmount" = GREATEST(0, "paidAmount" + ${d}::numeric),
        "status"     = CASE
          WHEN GREATEST(0, "paidAmount" + ${d}::numeric) <= 0
            THEN 'unpaid'::"PayStatus"
          WHEN GREATEST(0, "paidAmount" + ${d}::numeric) >= "finalAmount"
            THEN 'paid'::"PayStatus"
          ELSE 'partial'::"PayStatus"
        END,
        "updatedAt"  = NOW()
  `;

  const affected =
    capToRemaining && d > 0
      ? await prisma.$executeRaw`
          UPDATE "staff_payrolls" ${setClause}
          WHERE "id" = ${id}
            AND "paidAmount" + ${d}::numeric <= "finalAmount"
        `
      : await prisma.$executeRaw`
          UPDATE "staff_payrolls" ${setClause}
          WHERE "id" = ${id}
        `;

  if (affected === 0) return null;
  const row = await prisma.staffPayroll.findUnique({ where: { id } });
  return row ? withLegacyId(row) : null;
};
