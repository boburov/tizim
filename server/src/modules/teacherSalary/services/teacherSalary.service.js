import mongoose from "mongoose";
import TeacherSalary from "../../../models/teacherSalary.model.js";
import TeacherCompensation from "../../../models/teacherCompensation.model.js";
import SalaryTransaction from "../../../models/salaryTransaction.model.js";
import StudentPayment from "../../../models/studentPayment.model.js";
import Group from "../../../models/group.model.js";
import User from "../../../models/user.model.js";
import ApiError from "../../../utils/ApiError.js";
import { ROLES } from "../../../constants/roles.js";
import {
  branchFilter,
  userBranchCondition,
  resolveBranchFromGroup,
} from "../../../helpers/branchContext.helper.js";
import { computePeriodsSnapshot, deriveStatus } from "./salaryCompute.helper.js";
import * as teacherGroupPeriodService from "../../groups/services/teacherGroupPeriod.service.js";
import logger from "../../../config/logger.js";
import {
  compensationsForRange,
  segmentPeriod,
  baseSegmentsForMonth,
} from "./rateResolver.helper.js";
import {
  computeStudentUnits,
  computeLessonHours,
  computeGroupRevenueBase,
  segmentFactor,
} from "./variableBase.helper.js";

const safeTeacherProjection = {
  firstName: 1,
  lastName: 1,
  username: 1,
  phone: 1,
};

const toObjectId = (id) => {
  if (id instanceof mongoose.Types.ObjectId) return id;
  if (!mongoose.isValidObjectId(id)) throw new ApiError(400, "Noto'g'ri identifikator");
  return new mongoose.Types.ObjectId(String(id));
};

// Guruhning o'sha oy hisoblangan (billed) tushumi - foiz maoshi bazasi.
// O'quvchilarning to'lashi kerak bo'lgan summalar yig'indisi (guruh to'lovi,
// proratsiya va chegirma hisobga olingan). Guruh to'lovi o'zgarsa bu ham o'zgaradi.
export const computeGroupRevenue = async (group, year, month) => {
  const agg = await StudentPayment.aggregate([
    { $match: { group: toObjectId(group), year, month, isDeleted: { $ne: true } } },
    { $group: { _id: null, total: { $sum: "$expectedAmount" } } },
  ]);
  return agg.length ? agg[0].total : 0;
};

// GURUH qatori (kind="group") uchun snapshot - SEGMENT asosida.
//
// MANBA HAQIQATI ikkita: (1) TeacherGroupPeriod - o'qituvchi qachon dars bergani
// va (ixtiyoriy) guruhga xos stavka; (2) TeacherCompensation - o'qituvchining
// markaz darajasidagi STANDART stavkasi. Oy ikkalasining kesishmasi bo'yicha
// segmentlarga bo'linadi (rateResolver), har segment o'z stavkasi va o'z bazasi
// bilan hisoblanadi, summalar QO'SHILADI.
//
// Shu tufayli 15-martda oylik oshirilsa - mart maoshi 1-15 eski, 16-31 yangi
// stavkada chiqadi, yanvar esa umuman o'zgarmaydi (tarixiy aniqlik).
const buildSnapshot = async (salary) => {
  const { year, month } = salary;
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEndExcl = new Date(Date.UTC(year, month, 1));

  const [periods, group, compensations] = await Promise.all([
    teacherGroupPeriodService.periodsForMonth(
      salary.teacher,
      salary.group,
      year,
      month,
    ),
    Group.findById(salary.group, {
      startDate: 1,
      endDate: 1,
      schedule: 1,
    }).lean(),
    compensationsForRange(salary.teacher, monthStart, monthEndExcl),
  ]);

  // Guruh kurs oynasi - davr shu chegaraga qisiladi (kurs tugagach maosh yo'q).
  const DAY = 24 * 60 * 60 * 1000;
  const winStart =
    group?.startDate && new Date(group.startDate) > monthStart
      ? new Date(group.startDate)
      : monthStart;
  const winEndExcl =
    group?.endDate && new Date(group.endDate).getTime() + DAY < monthEndExcl.getTime()
      ? new Date(new Date(group.endDate).getTime() + DAY)
      : monthEndExcl;

  // Foiz bazasi segmentlar bo'ylab bir xil (oylik guruh tushumi), shuning
  // uchun bir marta yuklanadi. Qaysi baza (billed/collected) - stavkadan.
  const revenueCache = new Map();
  const revenueFor = async (base) => {
    if (!revenueCache.has(base)) {
      revenueCache.set(
        base,
        await computeGroupRevenueBase(salary.group, year, month, base),
      );
    }
    return revenueCache.get(base);
  };

  let perGroupAmount = 0;
  let percentAmount = 0;
  let perStudentAmount = 0;
  let perHourAmount = 0;
  let studentUnits = 0;
  let lessonHours = 0;
  let payableDays = 0;
  let totalDays = 0;
  let minStart = null;
  let maxEndExcl = null;
  let hasOpen = false;
  let lastRate = null;

  for (const p of periods) {
    const segments = segmentPeriod(p, compensations, winStart, winEndExcl);
    for (const seg of segments) {
      const { factor, days, totalDays: tot } = segmentFactor({
        year,
        month,
        segStart: seg.start,
        segEndExcl: seg.endExcl,
      });
      if (days <= 0) continue;
      totalDays = tot;
      payableDays += days;

      const { rate } = seg;

      // (a) guruh uchun qat'iy summa - segment ulushiga proratsiya
      if (rate.perGroup > 0) {
        perGroupAmount += Math.round(rate.perGroup * factor);
      }

      // (b) guruh tushumidan foiz - segment ulushiga proratsiya
      if (rate.percentRate > 0) {
        const revenue = await revenueFor(rate.percentBase);
        percentAmount += Math.round((revenue * rate.percentRate * factor) / 100);
      }

      // (c) har o'quvchi uchun - proratsiyalangan o'quvchi-oy bazasi
      if (rate.perStudent > 0) {
        const { units } = await computeStudentUnits({
          group: salary.group,
          year,
          month,
          segStart: seg.start,
          segEndExcl: seg.endExcl,
        });
        studentUnits += units;
        perStudentAmount += Math.round(rate.perStudent * units);
      }

      // (d) har dars soati uchun - jadvaldan (bayramlar chiqarilgan)
      if (rate.perHour > 0) {
        const { hours } = await computeLessonHours({
          groupDoc: group,
          segStart: seg.start,
          segEndExcl: seg.endExcl,
        });
        lessonHours += hours;
        perHourAmount += Math.round(rate.perHour * hours);
      }

      lastRate = rate;
      if (!minStart || seg.start < minStart) minStart = seg.start;
      if (seg.endExcl.getTime() >= winEndExcl.getTime() && !p.endDate) hasOpen = true;
      if (!maxEndExcl || seg.endExcl > maxEndExcl) maxEndExcl = seg.endExcl;
    }
  }

  if (!totalDays) totalDays = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const baseEarnings =
    perGroupAmount + percentAmount + perStudentAmount + perHourAmount;

  const snap = {
    prorationFactor: totalDays > 0 ? Math.min(1, payableDays / totalDays) : 0,
    payableDays,
    totalDays,
    // Eski maydonlar (UI/hisobot moslik uchun): proratedFixed endi "guruh
    // uchun qat'iy" kanalini bildiradi - eski `fixed` semantikasi aynan shu edi.
    proratedFixed: perGroupAmount,
    percentAmount,
    perGroupAmount,
    perStudentAmount,
    perHourAmount,
    studentUnits: Math.round(studentUnits * 1000) / 1000,
    lessonHours: Math.round(lessonHours * 100) / 100,
    baseEarnings,
    expectedAmount: Math.max(0, baseEarnings),
    workStartDate: minStart,
    workEndDate:
      hasOpen || !maxEndExcl ? null : new Date(maxEndExcl.getTime() - DAY),
    // Ko'rsatish uchun aktiv (oxirgi) segment stavkasi.
    variableType: lastRate?.variableType || null,
    variableRate: lastRate?.variableRate || 0,
    percentBase: lastRate?.percentBase || null,
    rateSource: lastRate?.source || "none",
    compensation: lastRate?.compensationId || null,
    // LEGACY display maydonlari - eski UI buzilmasligi uchun to'ldiriladi.
    salaryType:
      lastRate?.percentRate > 0 && lastRate?.perGroup > 0
        ? "mixed"
        : lastRate?.percentRate > 0
          ? "percent"
          : "fixed",
    fixedAmount: lastRate?.perGroup || 0,
    percentRate: lastRate?.percentRate || 0,
  };

  const groupRevenue = revenueCache.get(lastRate?.percentBase || "billed") ?? 0;

  const rate = {
    salaryType: snap.salaryType,
    fixedAmount: snap.fixedAmount,
    percentRate: snap.percentRate,
    variableType: snap.variableType,
    variableRate: snap.variableRate,
    percentBase: snap.percentBase,
    rateSource: snap.rateSource,
    compensation: snap.compensation,
  };

  return { snap, groupRevenue, rate };
};

// paidAmount ifodasidan status + overpaidAmount ni hisoblaydigan atomik
// update-pipeline bosqichi ("o'qi → hisobla → save" poygasini yo'qotadi).
const paidStatusStage = (newPaidExpr) => ({
  $set: {
    paidAmount: newPaidExpr,
    overpaidAmount: {
      $max: [0, { $subtract: [newPaidExpr, "$expectedAmount"] }],
    },
    status: {
      $switch: {
        branches: [
          { case: { $lte: [newPaidExpr, 0] }, then: "unpaid" },
          { case: { $lt: [newPaidExpr, "$expectedAmount"] }, then: "partial" },
        ],
        default: "paid",
      },
    },
  },
});

// paidAmount ni atomik delta bilan o'zgartiradi. capToRemaining=true bo'lsa,
// yangi paidAmount expectedAmount dan oshadigan bo'lsa - hujjat YANGILANMAYDI
// (null qaytadi): qoldiqdan ortiq to'lovni shartli-atomik to'sish (C3).
export const applyPaidDelta = async (salaryId, delta, { capToRemaining = false } = {}) => {
  const newPaid = { $add: [{ $ifNull: ["$paidAmount", 0] }, delta] };
  const filter = { _id: salaryId };
  if (capToRemaining) {
    filter.$expr = { $lte: [newPaid, "$expectedAmount"] };
  }
  return TeacherSalary.findOneAndUpdate(filter, [paidStatusStage(newPaid)], {
    new: true,
  });
};

// Faol tranzaksiyalar yig'indisidan paidAmount/status ni tiklaydi (repair yo'li).
export const recalcStatus = async (salaryId) => {
  const salary = await TeacherSalary.findById(salaryId);
  if (!salary) return null;
  const agg = await SalaryTransaction.aggregate([
    { $match: { salary: salary._id, isDeleted: { $ne: true } } },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);
  const paidAmount = agg.length ? agg[0].total : 0;
  return TeacherSalary.findByIdAndUpdate(salaryId, [paidStatusStage(paidAmount)], {
    new: true,
  });
};

// Snapshot (maosh/foiz/proratsiya) ni qayta hisoblab, statusni ham yangilaydi.
// Yozish atomik pipeline orqali: status/overpaid DB'dagi JORIY paidAmount'dan
// keltirib chiqariladi - hisob davomida kelib tushgan parallel to'lov buzmaydi.
// Retro o'zgarish expected'ni to'langandan pastga tushirsa, farq overpaidAmount
// sifatida KO'RINADIGAN bo'lib saqlanadi (C6) - clamp bilan yashirilmaydi.
export const recalc = async (salaryId, { force = false } = {}) => {
  const salary = await TeacherSalary.findById(salaryId);
  if (!salary) return null;

  // FAQAT guruh qatorlari davrlardan qayta hisoblanadi.
  //  • base      - markaz fiksasi, recalcBaseForTeacherMonth() bilan yangilanadi
  //  • bonus/deduction - QO'LDA kiritilgan (KPI), avtomatik qayta hisob YO'Q.
  //    Aks holda owner kiritgan mukofot har kechqurun job'da nolga tushardi.
  if (salary.kind && salary.kind !== "group") return salary;

  // ─── TO'LANGAN OY QULFLANADI ───
  //
  // Maosh TO'LIQ to'langan bo'lsa (status="paid"), stavka keyin o'zgarsa ham
  // o'sha oy QAYTA HISOBLANMAYDI.
  //
  // NEGA: o'qituvchiga fevral uchun 2 mln to'landi. Mayda stavka 2.5 mln ga
  // oshirildi va effectiveFrom xato bilan 1-yanvarga qo'yildi. Qulfsiz holatda
  // fevral qayta hisoblanib, o'qituvchida "500 000 qarzdorlik" paydo bo'lardi
  // (yoki teskarisi - overpaid). Ya'ni YOPILGAN va HISOB-KITOB QILINGAN davr
  // keyingi qaror tufayli qayta ochilardi.
  //
  // Bu buxgalteriyaning "yopilgan davr" (closed period) qoidasi: to'lov
  // amalga oshgach, o'sha davr o'zgarmas bo'ladi.
  //
  // QISMAN to'langan (partial) qatorlar QULFLANMAYDI - u yerda hisob-kitob
  // hali tugamagan va tuzatish hali ham to'g'ri natija beradi.
  //
  // force=true - ongli tuzatish uchun (owner "qayta hisobla" tugmasi).
  if (!force && salary.status === "paid" && salary.paidAmount > 0) {
    return salary;
  }

  const { snap, groupRevenue, rate } = await buildSnapshot(salary);

  const paidExpr = { $ifNull: ["$paidAmount", 0] };
  return TeacherSalary.findByIdAndUpdate(
    salaryId,
    [
      {
        $set: {
          salaryType: rate.salaryType,
          fixedAmount: rate.fixedAmount,
          percentRate: rate.percentRate,
          variableType: rate.variableType,
          variableRate: rate.variableRate,
          percentBase: rate.percentBase,
          rateSource: rate.rateSource,
          compensation: rate.compensation,
          workStartDate: snap.workStartDate || null,
          workEndDate: snap.workEndDate || null,
          groupRevenue,
          prorationFactor: snap.prorationFactor,
          payableDays: snap.payableDays,
          totalDays: snap.totalDays,
          proratedFixed: snap.proratedFixed,
          percentAmount: snap.percentAmount,
          perGroupAmount: snap.perGroupAmount,
          perStudentAmount: snap.perStudentAmount,
          perHourAmount: snap.perHourAmount,
          studentUnits: snap.studentUnits,
          lessonHours: snap.lessonHours,
          baseEarnings: snap.baseEarnings,
          expectedAmount: snap.expectedAmount,
          status: {
            $switch: {
              branches: [
                { case: { $lte: [paidExpr, 0] }, then: "unpaid" },
                { case: { $lt: [paidExpr, snap.expectedAmount] }, then: "partial" },
              ],
              default: "paid",
            },
          },
          overpaidAmount: {
            $max: [0, { $subtract: [paidExpr, snap.expectedAmount] }],
          },
          recalculatedAt: new Date(),
        },
      },
    ],
    { new: true },
  );
};

// MARKAZ DARAJASIDAGI FIKSA OYLIK (kind="base").
//
// NEGA GURUHGA BOG'LANMAYDI: "oyligi 2 mln" degani - o'qituvchi 1 ta guruhda
// ishlasa ham, 5 ta guruhda ishlasa ham 2 mln. Agar bu summa guruh qatoriga
// yozilsa, 5 guruh = 10 mln bo'lib ketardi. Shuning uchun oyiga BITTA,
// guruhsiz (group=null) qator ochiladi.
//
// PRORATSIYA: ishga kirgan/bo'shagan oyda kalendar kunlar ulushicha. Stavka oy
// o'rtasida oshirilsa - har segment o'z summasi bilan qo'shiladi.
export const recalcBaseForTeacherMonth = async (teacher, year, month) => {
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEndExcl = new Date(Date.UTC(year, month, 1));
  const totalDays = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const [compensations, user] = await Promise.all([
    compensationsForRange(teacher, monthStart, monthEndExcl),
    User.findById(teacher, { hiredAt: 1, terminatedAt: 1, homeBranchId: 1 }).lean(),
  ]);

  const segments = baseSegmentsForMonth(compensations, year, month, {
    from: user?.hiredAt || null,
    toExcl: user?.terminatedAt || null,
  });

  const existing = await TeacherSalary.findOne({
    teacher,
    group: null,
    kind: "base",
    year,
    month,
  });

  // TO'LANGAN OY QULFLANADI - recalc() dagi bilan bir xil qoida (yopilgan davr).
  // Fiksa oylikda bu ayniqsa muhim: stavka oshirilganda effectiveFrom xato
  // qo'yilsa, allaqachon to'langan barcha oylar qayta ochilib ketardi.
  if (existing && existing.status === "paid" && existing.paidAmount > 0) {
    return existing;
  }

  // Fiksa qism umuman yo'q (stavka olib tashlandi / o'qituvchi bo'shadi):
  // mavjud qator O'CHIRILMAYDI - unga to'lov bog'langan bo'lishi mumkin va
  // o'chirish o'tgan oyning chiqimini yo'q qilardi. Nolga tushiriladi; agar
  // allaqachon to'langan bo'lsa overpaidAmount ko'rinadigan bo'lib qoladi
  // (clawback uchun asos, jimgina yashirilmaydi).
  if (segments.length === 0) {
    return existing ? applyExpected(existing._id, 0) : null;
  }

  let expected = 0;
  let payableDays = 0;
  let branchId = null;
  let compensationId = null;
  let rateAmount = 0;
  for (const seg of segments) {
    const days = Math.max(
      0,
      Math.round((seg.endExcl.getTime() - seg.start.getTime()) / (24 * 60 * 60 * 1000)),
    );
    if (days <= 0) continue;
    expected += Math.round((seg.amount * days) / totalDays);
    payableDays += days;
    branchId = seg.branchId || branchId;
    compensationId = seg.compensationId;
    rateAmount = seg.amount;
  }

  // FILIAL: stavkada ko'rsatilgan filial → o'qituvchining asosiy filiali.
  // Ikkalasi ham bo'lmasa qator YARATILMAYDI - branchId majburiy va noto'g'ri
  // filialga chiqim yozilishi hisobotni buzardi.
  branchId = branchId || user?.homeBranchId || null;
  if (!branchId) {
    logger.warn(
      { teacher, year, month },
      "Fiksa oylik uchun filial aniqlanmadi - qator yaratilmadi",
    );
    return null;
  }

  if (existing) return applyExpected(existing._id, expected, { payableDays, totalDays });

  const draft = new TeacherSalary({
    branchId,
    teacher,
    group: null,
    kind: "base",
    year,
    month,
    salaryType: "fixed",
    fixedAmount: rateAmount,
    variableType: null,
    rateSource: "compensation",
    compensation: compensationId,
    prorationFactor: totalDays > 0 ? payableDays / totalDays : 0,
    payableDays,
    totalDays,
    proratedFixed: expected,
    baseEarnings: expected,
    expectedAmount: expected,
    status: deriveStatus(0, expected),
    source: "auto",
    recalculatedAt: new Date(),
  });
  try {
    return await draft.save();
  } catch (err) {
    if (err?.code === 11000) {
      const again = await TeacherSalary.findOne({
        teacher,
        group: null,
        kind: "base",
        year,
        month,
      });
      return again ? applyExpected(again._id, expected, { payableDays, totalDays }) : null;
    }
    throw err;
  }
};

// expectedAmount ni atomik yangilaydi + status/overpaid ni DB dagi paidAmount
// dan keltirib chiqaradi (o'qi→hisobla→saqla poygasi yo'q).
const applyExpected = async (salaryId, expected, extra = {}) => {
  const paidExpr = { $ifNull: ["$paidAmount", 0] };
  return TeacherSalary.findByIdAndUpdate(
    salaryId,
    [
      {
        $set: {
          expectedAmount: expected,
          baseEarnings: expected,
          proratedFixed: expected,
          ...(extra.payableDays !== undefined
            ? {
                payableDays: extra.payableDays,
                totalDays: extra.totalDays,
                prorationFactor:
                  extra.totalDays > 0 ? extra.payableDays / extra.totalDays : 0,
              }
            : {}),
          status: {
            $switch: {
              branches: [
                { case: { $lte: [paidExpr, 0] }, then: "unpaid" },
                { case: { $lt: [paidExpr, expected] }, then: "partial" },
              ],
              default: "paid",
            },
          },
          overpaidAmount: { $max: [0, { $subtract: [paidExpr, expected] }] },
          recalculatedAt: new Date(),
        },
      },
    ],
    { new: true },
  );
};

// Guruh+oy bo'yicha barcha maoshlarni qayta hisoblaydi (guruh tushumi o'zgarganda).
export const recalcForGroupMonth = async (group, year, month) => {
  const salaries = await TeacherSalary.find(
    { group, year, month, kind: "group" },
    { _id: 1 },
  );
  for (const s of salaries) await recalc(s._id);
  return salaries.length;
};

// Guruhning barcha oylik maoshlarini qayta hisoblaydi (doimiy chegirma o'zgarganda).
export const recalcForGroup = async (group) => {
  const salaries = await TeacherSalary.find({ group, kind: "group" }, { _id: 1 });
  for (const s of salaries) await recalc(s._id);
  return salaries.length;
};

// O'qituvchi guruhga biriktirilganda shu oy maoshini yaratadi (best-effort hook).
// Stavka/ish-oynasi davrlardan (TeacherGroupPeriod) keltirib chiqariladi.
export const ensureSalaryForTeacherGroup = async (teacher, group, year, month) => {
  if (!teacher || !group) return null;
  const exists = await TeacherSalary.findOne({
    teacher,
    group,
    year,
    month,
    kind: "group",
  });
  if (exists) return exists;

  // FILIAL: guruhdan meros. Bu fon vazifasidan (Agenda) ham chaqiriladi -
  // u yerda foydalanuvchi konteksti yo'q.
  const branchId = await resolveBranchFromGroup(group);

  const draft = new TeacherSalary({
    branchId,
    teacher,
    group,
    kind: "group",
    year,
    month,
    source: "auto",
  });
  const { snap, groupRevenue, rate } = await buildSnapshot(draft);
  Object.assign(draft, rate, snap);
  draft.groupRevenue = groupRevenue;
  draft.status = deriveStatus(0, snap.expectedAmount);
  draft.recalculatedAt = new Date();

  try {
    return await draft.save();
  } catch (err) {
    if (err?.code === 11000) {
      return TeacherSalary.findOne({ teacher, group, year, month, kind: "group" });
    }
    throw err;
  }
};

// Berilgan oy uchun barcha faol guruh o'qituvchilariga maosh yaratadi.
export const generateMonthLegacy = async (year, month) => {
  const groups = await Group.find(
    { isActive: true, isDeleted: { $ne: true } },
    { _id: 1 },
  );
  let created = 0;
  for (const g of groups) {
    // Shu OYDA dars bergan o'qituvchilar (TeacherGroupPeriod overlap) - tarixiy
    // generatsiyada ham o'sha davrdagi haqiqiy o'qituvchilar olinadi.
    const periods = await teacherGroupPeriodService.teacherPeriodsActiveInMonth(
      g._id,
      year,
      month,
    );
    const teacherIds = [...new Set(periods.map((p) => String(p.teacher)))];
    for (const teacherId of teacherIds) {
      const existed = await TeacherSalary.findOne({
        teacher: teacherId,
        group: g._id,
        year,
        month,
        kind: "group",
      });
      if (existed) continue;
      await ensureSalaryForTeacherGroup(teacherId, g._id, year, month);
      created += 1;
    }
  }
  return { groups: groups.length, created };
};

// Berilgan oy uchun BARCHA maosh qatorlarini yaratadi:
//   1. guruh qatorlari (o'zgaruvchi qism) - generateMonthLegacy,
//   2. markaz fiksa qatorlari (base) - standart stavkasi bor har o'qituvchi uchun.
//
// Idempotent: qayta ishga tushirilsa mavjud qatorlar yangilanadi, dublikat
// yaratilmaydi (partial unique indekslar himoya qiladi).
export const generateMonth = async (year, month) => {
  const groupResult = await generateMonthLegacy(year, month);

  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEndExcl = new Date(Date.UTC(year, month, 1));

  // Shu oyda amal qilgan fiksa stavkasi bo'lgan o'qituvchilar.
  const teacherIds = await TeacherCompensation.distinct("teacher", {
    isDeleted: { $ne: true },
    baseType: "fixed_monthly",
    effectiveFrom: { $lt: monthEndExcl },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gt: monthStart } }],
  });

  let baseCreated = 0;
  for (const teacherId of teacherIds) {
    try {
      const row = await recalcBaseForTeacherMonth(teacherId, year, month);
      if (row) baseCreated += 1;
    } catch (err) {
      // Bitta o'qituvchidagi xato butun generatsiyani to'xtatmasligi kerak.
      logger.warn({ err, teacherId, year, month }, "Fiksa oylik yaratishda xato");
    }
  }

  return { ...groupResult, baseCreated, baseTeachers: teacherIds.length };
};

// (upsertSalary olib tashlandi - stavka/ish-oynasi endi TeacherGroupPeriod
// davrlaridan derived. Maosh o'zgartirish faqat davrlar orqali bo'ladi.)

// (markTeacherLeft olib tashlandi - ish tugashi endi TeacherGroupPeriod davrini
// yopish orqali bo'ladi; maosh proratsiyasi davrlardan derived - teacherGroupPeriod
// service unassignTeacher recompute qiladi.)

export const list = async ({
  groupId,
  teacherId,
  year,
  month,
  status,
  kind,
  search,
  page = 1,
  limit = 200,
}) => {
  // FILIAL: TeacherSalary'da branchId bor (guruhdan meros).
  const filter = { ...branchFilter(), isDeleted: { $ne: true } };
  if (groupId) filter.group = toObjectId(groupId);
  if (teacherId) filter.teacher = toObjectId(teacherId);
  // Qator turi: UI "asosiy maosh" va "mukofot" ni ajratib ko'rsatishi uchun.
  // Berilmasa - BARCHA turlar (guruh + fiksa + mukofot) qaytadi, chunki
  // o'qituvchining oylik jami aynan shularning yig'indisi.
  if (kind) filter.kind = kind;
  if (year) filter.year = Number(year);
  if (month) filter.month = Number(month);
  if (status) filter.status = status;

  // Qidiruv DB darajasida (filtrga kiradi) - aks holda sahifalab bo'lingandan
  // KEYIN filtrlash noto'g'ri sahifa/total berardi (studentPayment.list bilan bir xil).
  if (search && search.trim()) {
    const s = search.trim();
    const rx = new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const matchedTeachers = await User.find(
      {
        role: ROLES.TEACHER,
        $or: [{ firstName: rx }, { lastName: rx }, { username: rx }],
      },
      { _id: 1 },
    );
    filter.teacher = { $in: matchedTeachers.map((u) => u._id) };
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    TeacherSalary.find(filter)
      .populate("teacher", safeTeacherProjection)
      .populate("group", { name: 1 })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    TeacherSalary.countDocuments(filter),
  ]);
  return { items, total, page, limit };
};

export const getById = async (id) => {
  const salary = await TeacherSalary.findById(id)
    .populate("teacher", safeTeacherProjection)
    .populate("group", { name: 1 });
  if (!salary) throw new ApiError(404, "Maosh topilmadi");

  const transactions = await SalaryTransaction.find({
    salary: salary._id,
    isDeleted: { $ne: true },
  }).sort({ paidAt: -1, createdAt: -1 });

  return { ...salary.toJSON(), transactions };
};

// Bitta o'qituvchining barcha oylardagi maoshlari + har biriga tegishli
// to'lovlar (maosh to'lovlari tarixi sahifasi uchun). Eng yangi oy yuqorida.
export const historyByTeacher = async (teacherId) => {
  const tid = toObjectId(teacherId);
  // FILIAL: boshqa filial o'qituvchisining ismi ochilmasin.
  const branchCond = userBranchCondition();
  const teacher = await User.findOne(
    branchCond ? { _id: tid, $and: [branchCond] } : { _id: tid },
    safeTeacherProjection,
  ).lean();
  if (!teacher) throw new ApiError(404, "O'qituvchi topilmadi");

  // FILIAL: o'qituvchi boshqa filialda ham ishlasa, u yerdagi maoshi
  // shu filial ko'rinishiga chiqmasin.
  const salaries = await TeacherSalary.find({
    teacher: tid,
    ...branchFilter(),
    isDeleted: { $ne: true },
  })
    .populate("group", { name: 1 })
    .sort({ year: -1, month: -1 })
    .lean();

  const ids = salaries.map((s) => s._id);
  const txs = ids.length
    ? await SalaryTransaction.find({
        salary: { $in: ids },
        isDeleted: { $ne: true },
      })
        .sort({ paidAt: -1, createdAt: -1 })
        .lean()
    : [];

  const txBySalary = new Map();
  for (const t of txs) {
    const key = String(t.salary);
    if (!txBySalary.has(key)) txBySalary.set(key, []);
    txBySalary.get(key).push(t);
  }

  const items = salaries.map((s) => ({
    ...s,
    transactions: txBySalary.get(String(s._id)) || [],
  }));

  const totalExpected = items.reduce((s, p) => s + (p.expectedAmount || 0), 0);
  const totalPaid = items.reduce((s, p) => s + (p.paidAmount || 0), 0);

  return {
    teacher,
    items,
    summary: {
      months: items.length,
      totalExpected,
      totalPaid,
      totalRemaining: Math.max(0, totalExpected - totalPaid),
    },
  };
};

// O'qituvchining O'ZI uchun moliya ko'rinishi (teacher panel "Moliya" bo'limi).
// Faqat req.user._id bilan chaqiriladi - ruxsat tekshiruvi shart emas (o'z
// ma'lumotini ko'radi).
export const myFinance = async (teacherId) => historyByTeacher(teacherId);

// Majburiyatlar: qoldig'i (expected - paid) > 0 bo'lgan maoshlar.
// month berilmasa - tanlangan yilning BARCHA oylari bo'yicha (har oy alohida qator).
export const obligations = async ({ groupId, year, month }) => {
  const filter = { ...branchFilter(), year: Number(year), isDeleted: { $ne: true } };
  if (month) filter.month = Number(month);
  if (groupId) filter.group = toObjectId(groupId);

  const items = await TeacherSalary.find(filter)
    .populate("teacher", safeTeacherProjection)
    .populate("group", { name: 1 })
    .sort({ month: 1, createdAt: -1 });

  return items
    .map((s) => ({ ...s.toJSON(), remaining: Math.max(0, s.expectedAmount - s.paidAmount) }))
    .filter((s) => s.remaining > 0);
};
