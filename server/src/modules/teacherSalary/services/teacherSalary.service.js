import { Prisma } from "@prisma/client";
import prisma from "../../../config/prisma.js";
import ApiError from "../../../utils/ApiError.js";
import { ROLES } from "../../../constants/roles.js";
import {
  branchFilter,
  userBranchCondition,
  resolveBranchFromGroup,
} from "../../../helpers/branchContext.helper.js";
import { deriveStatus, daysInMonth } from "./salaryCompute.helper.js";
import * as teacherGroupPeriodService from "../../groups/services/teacherGroupPeriod.service.js";
import logger from "../../../config/logger.js";
import { localTodayMidnight, toUtcMidnight } from "../../../helpers/attendance.helper.js";
import { withLegacyId, withLegacyIds } from "../../../utils/serialize.js";
import {
  compensationsForRange,
  segmentPeriod,
  baseSegmentsForMonth,
  segmentDays,
} from "./rateResolver.helper.js";
import {
  computeStudentUnits,
  computeLessonHours,
  computeGroupRevenueBase,
  segmentFactor,
} from "./variableBase.helper.js";

// ═══════════════════════════════════════════════════════════════════════
// MONGO → PRISMA: BU FAYLDAGI ENG MUHIM QAROR
//
// Mongo varianti `paidAmount`/`status`/`overpaidAmount` ni AGGREGATION
// UPDATE PIPELINE bilan yozardi:
//
//     findOneAndUpdate(f, [{ $set: { status: { $switch: ... } } }])
//
// Buning ma'nosi: status BAZADAGI JORIY `paidAmount` dan bitta atomik
// amalda keltirib chiqariladi. "O'qi → JS'da hisobla → saqla" naqshi
// EMAS — aks holda hisob davomida kelib tushgan parallel to'lov
// yo'qolardi (lost update).
//
// PostgreSQL'da bu ikki xil vosita bilan saqlandi:
//
//  1) `applyPaidDelta` — BITTA xom `UPDATE` (SQL). Faqat shu yerda
//     "shartli-atomik" o'zgartirish kerak: `capToRemaining` bo'lsa yangi
//     summa qoldiqdan oshsa qator UMUMAN yangilanmasligi shart. Buni
//     ikki bosqichda qilish poyga oynasini qaytarib olib kelardi.
//     SQL'da o'ng tomondagi ustun ESKI qiymatni beradi — Mongo'dagi
//     `"$paidAmount"` bilan aynan bir xil semantika.
//
//  2) Qolgan yo'llar — `$transaction` + `SELECT ... FOR UPDATE`. Qator
//     qulflanadi, `paidAmount` o'qiladi, status JS'da hisoblanib
//     yoziladi. Qulf tufayli oraliqda hech kim o'zgartira olmaydi,
//     lekin kod Prisma tipida va o'qiladigan bo'lib qoladi
//     (`recalc` 20 dan ortiq ustunni yozadi — ularni xom SQL'da
//     saqlash sxema bilan sinxrondan chiqib ketish xavfini tug'dirardi).
//
// DIQQAT — `updatedAt`: Prisma'dagi `@updatedAt` KLIENT tomonida
// qo'yiladi. Xom SQL uni chetlab o'tadi, shuning uchun `"updatedAt"`
// ochiq `NOW()` bilan yoziladi.
//
// PUL TURI: barcha summa ustunlari `double precision` (Mongo'da ham
// float64 edi) — Prisma ularni oddiy `number` qaytaradi. Decimal/BigInt
// konvertatsiyasi YO'Q, arifmetika bit-bit o'zgarmadi.
//
// `isDeleted`: TeacherSalary'da bunday ustun UMUMAN YO'Q (u hosila
// jadval — o'chirilmaydi, qayta hisoblanadi). Mongoose modelida ham
// softDelete plagini yo'q edi, ya'ni eski `{ $ne: true }` sharti hamma
// qatorga to'g'ri kelardi. Shuning uchun filtrlar OLIB TASHLANDI.
// ═══════════════════════════════════════════════════════════════════════

const SAFE_TEACHER_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  username: true,
  phone: true,
};

// Guruh jadvali RELATION — `computeLessonHours` uni talab qiladi.
// Unutilsa massiv bo'sh keladi va soatbay maosh JIMGINA 0 bo'lardi.
const GROUP_FOR_SNAPSHOT = {
  id: true,
  startDate: true,
  endDate: true,
  schedule: {
    select: { day: true, startTime: true, endTime: true, effectiveFrom: true },
  },
};

// Guruhning o'sha oy hisoblangan (billed) tushumi - foiz maoshi bazasi.
// O'quvchilarning to'lashi kerak bo'lgan summalar yig'indisi (guruh to'lovi,
// proratsiya va chegirma hisobga olingan). Guruh to'lovi o'zgarsa bu ham o'zgaradi.
export const computeGroupRevenue = async (group, year, month) => {
  const agg = await prisma.studentPayment.aggregate({
    where: { groupId: String(group), year, month },
    _sum: { expectedAmount: true },
  });
  return agg._sum.expectedAmount ?? 0;
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
  const teacherId = String(salary.teacherId);
  const groupId = String(salary.groupId);
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEndExcl = new Date(Date.UTC(year, month, 1));

  const [periods, group, compensations] = await Promise.all([
    teacherGroupPeriodService.periodsForMonth(teacherId, groupId, year, month),
    prisma.group.findUnique({
      where: { id: groupId },
      select: GROUP_FOR_SNAPSHOT,
    }),
    compensationsForRange(teacherId, monthStart, monthEndExcl),
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
      revenueCache.set(base, await computeGroupRevenueBase(groupId, year, month, base));
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
        // eslint-disable-next-line no-await-in-loop
        const revenue = await revenueFor(rate.percentBase);
        percentAmount += Math.round((revenue * rate.percentRate * factor) / 100);
      }

      // (c) har o'quvchi uchun - proratsiyalangan o'quvchi-oy bazasi
      if (rate.perStudent > 0) {
        // eslint-disable-next-line no-await-in-loop
        const { units } = await computeStudentUnits({
          group: groupId,
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
        // eslint-disable-next-line no-await-in-loop
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
    // Mongo'da maydon `compensation` deb atalardi; Prisma ustuni
    // `compensationId` (relation nomi `compensation`).
    compensationId: lastRate?.compensationId || null,
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
    compensationId: snap.compensationId,
  };

  return { snap, groupRevenue, rate };
};

// ─────────────────────────────────────────────────────────────────
// LEGACY MOSLIK: `salaryType` enum'i
//
// Mongo modelida `salaryType` "mixed" qiymatini ham qabul qilardi;
// Postgres `enum SalaryRateType` da esa faqat `fixed` va `percent` bor.
// Snapshot ko'rsatish uchun "mixed" hisoblaydi, shuning uchun yozishdan
// oldin u eng yaqin haqiqiy qiymatga tushiriladi.
//
// NEGA `percent`: "mixed" ikkala kanal ham yoqilgan degani va foizli
// qism odatda kattaroq; qolaversa `fixedAmount` maydoni baribir alohida
// saqlanadi, ya'ni ma'lumot yo'qolmaydi. Bu FAQAT ko'rsatish maydoni -
// hisoblangan summaga (`expectedAmount`) ta'sir qilmaydi.
// ─────────────────────────────────────────────────────────────────
const toRateTypeEnum = (v) => (v === "percent" || v === "mixed" ? "percent" : "fixed");

const normalizeRateForWrite = (rate) => ({
  ...rate,
  salaryType: toRateTypeEnum(rate.salaryType),
});

// Ustunlar SQL'da: statusni JORIY paidAmount'dan keltirib chiqaradigan
// yagona ifoda. `applyPaidDelta` xom SQL ishlatgani uchun bu yerda ham
// bir xil mantiq (deriveStatus) qo'llanadi - ikki joyda ikki xil qoida
// bo'lib qolmasin.
const derived = (paid, expected) => ({
  status: deriveStatus(paid, expected),
  overpaidAmount: Math.max(0, paid - expected),
});

/**
 * Qatorni QULFLAB (FOR UPDATE) yangilaydi va status/overpaid ni bazadagi
 * JORIY `paidAmount` dan keltirib chiqaradi.
 *
 * Mongo'dagi update-pipeline'ning ekvivalenti: hisob davomida kelib
 * tushgan parallel to'lov yo'qolmaydi.
 */
const updateWithDerivedStatus = async (salaryId, expected, data) =>
  prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`
      SELECT "paidAmount" FROM "teacher_salaries" WHERE "id" = ${String(salaryId)} FOR UPDATE
    `;
    if (!rows.length) return null;
    const paid = Number(rows[0].paidAmount) || 0;

    return tx.teacherSalary.update({
      where: { id: String(salaryId) },
      data: {
        ...data,
        expectedAmount: expected,
        ...derived(paid, expected),
        recalculatedAt: new Date(),
      },
    });
  });

// paidAmount ni atomik delta bilan o'zgartiradi. capToRemaining=true bo'lsa,
// yangi paidAmount expectedAmount dan oshadigan bo'lsa - qator YANGILANMAYDI
// (null qaytadi): qoldiqdan ortiq to'lovni shartli-atomik to'sish (C3).
//
// BITTA SQL amali: SQL'da o'ng tomondagi `"paidAmount"` ESKI qiymatni
// beradi, ya'ni Mongo'dagi `{ $add: ["$paidAmount", delta] }` bilan aynan
// bir xil. Ikki bosqichga bo'lish (o'qi → yoz) poygani qaytarib kelardi.
export const applyPaidDelta = async (salaryId, delta, { capToRemaining = false } = {}) => {
  const id = String(salaryId);
  const d = Number(delta) || 0;

  const setClause = Prisma.sql`
    SET "paidAmount"     = COALESCE("paidAmount", 0) + ${d}::double precision,
        "overpaidAmount" = GREATEST(
          0,
          COALESCE("paidAmount", 0) + ${d}::double precision - "expectedAmount"
        ),
        "status"         = CASE
          WHEN COALESCE("paidAmount", 0) + ${d}::double precision <= 0
            THEN 'unpaid'::"PayStatus"
          WHEN COALESCE("paidAmount", 0) + ${d}::double precision < "expectedAmount"
            THEN 'partial'::"PayStatus"
          ELSE 'paid'::"PayStatus"
        END,
        -- Prisma'ning @updatedAt KLIENT tomonida ishlaydi; xom SQL uni
        -- chetlab o'tadi, shuning uchun ochiq yoziladi.
        "updatedAt"      = NOW()
  `;

  const affected = capToRemaining
    ? await prisma.$executeRaw`
        UPDATE "teacher_salaries" ${setClause}
        WHERE "id" = ${id}
          AND COALESCE("paidAmount", 0) + ${d}::double precision <= "expectedAmount"
      `
    : await prisma.$executeRaw`
        UPDATE "teacher_salaries" ${setClause}
        WHERE "id" = ${id}
      `;

  if (affected === 0) return null;
  return prisma.teacherSalary.findUnique({ where: { id } });
};

// Faol tranzaksiyalar yig'indisidan paidAmount/status ni tiklaydi (repair yo'li).
export const recalcStatus = async (salaryId) => {
  const id = String(salaryId);
  const agg = await prisma.salaryTransaction.aggregate({
    where: { salaryId: id, isDeleted: false },
    _sum: { amount: true },
  });
  const paidAmount = agg._sum.amount ?? 0;

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`
      SELECT "expectedAmount" FROM "teacher_salaries" WHERE "id" = ${id} FOR UPDATE
    `;
    if (!rows.length) return null;
    const expected = Number(rows[0].expectedAmount) || 0;
    return tx.teacherSalary.update({
      where: { id },
      data: { paidAmount, ...derived(paidAmount, expected) },
    });
  });
};

// Snapshot (maosh/foiz/proratsiya) ni qayta hisoblab, statusni ham yangilaydi.
// Yozish qulflangan qator ustida: status/overpaid DB'dagi JORIY paidAmount'dan
// keltirib chiqariladi - hisob davomida kelib tushgan parallel to'lov buzmaydi.
// Retro o'zgarish expected'ni to'langandan pastga tushirsa, farq overpaidAmount
// sifatida KO'RINADIGAN bo'lib saqlanadi (C6) - clamp bilan yashirilmaydi.
export const recalc = async (salaryId, { force = false, lockPaid = false } = {}) => {
  const salary = await prisma.teacherSalary.findUnique({ where: { id: String(salaryId) } });
  if (!salary) return null;

  // ─── QULF: MUTLAQ TO'SIQ ───
  //
  // `force` ham buni ocha OLMAYDI - qulflangan oy avval ATAYLAB
  // ochilishi kerak. Farqi shundaki, `lockPaid` "avtomatik tegma" degan
  // maslahat, qulf esa "bu davr yopilgan" degan qaror: markaz boshqa
  // tizimdan ko'chib kelgan yoki hisobot topshirilgan oylar shu bilan
  // himoyalanadi.
  if (salary.isLocked) return withLegacyId(salary);

  // FAQAT guruh qatorlari davrlardan qayta hisoblanadi.
  //  • base      - markaz fiksasi, recalcBaseForTeacherMonth() bilan yangilanadi
  //  • bonus/deduction - QO'LDA kiritilgan (KPI), avtomatik qayta hisob YO'Q.
  //    Aks holda owner kiritgan mukofot har kechqurun job'da nolga tushardi.
  if (salary.kind && salary.kind !== "group") return withLegacyId(salary);

  // ─── TO'LANGAN OY QULFI - FAQAT STAVKA O'ZGARISHIDA ───
  //
  // `lockPaid` ni CHAQIRUVCHI beradi va u faqat bitta yo'ldan keladi:
  // teacherCompensation.recomputeFrom (stavka o'zgardi).
  //
  // NEGA UMUMIY QULF NOTO'G'RI EDI: recalc() ALTI xil sababdan chaqiriladi -
  // guruh narxi o'zgardi, chegirma berildi, o'quvchi qo'shildi/chiqdi, dars
  // bekor qilindi, o'quvchi o'chirildi. Bularning hammasi maoshning HAQIQIY
  // bazasini o'zgartiradi:
  //   martga o'quvchi qo'shildi → per_student bo'yicha o'qituvchiga yana
  //   50 000 tegishli. Umumiy qulf buni JIMGINA bloklardi va o'qituvchi
  //   haqini olmasdi - hech qayerda iz ham qolmasdi.
  //
  // Stavka o'zgarishi esa BOSHQA narsa: "1-yanvardan oshirdik" degan qaror
  // allaqachon to'langan fevralni qayta ochmasligi kerak (yopilgan davr).
  //
  // QISMAN to'langan (partial) qatorlar hech qachon qulflanmaydi - u yerda
  // hisob-kitob hali tugamagan.
  //
  // force=true - qulfni ochiq buzish (owner "qayta hisobla" tugmasi).
  if (lockPaid && !force && salary.status === "paid" && salary.paidAmount > 0) {
    return withLegacyId(salary);
  }

  const { snap, groupRevenue, rate } = await buildSnapshot(salary);

  const saved = await updateWithDerivedStatus(salary.id, snap.expectedAmount, {
    ...normalizeRateForWrite(rate),
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
  });
  return saved ? withLegacyId(saved) : null;
};

// MARKAZ DARAJASIDAGI FIKSA OYLIK (kind="base").
//
// NEGA GURUHGA BOG'LANMAYDI: "oyligi 2 mln" degani - o'qituvchi 1 ta guruhda
// ishlasa ham, 5 ta guruhda ishlasa ham 2 mln. Agar bu summa guruh qatoriga
// yozilsa, 5 guruh = 10 mln bo'lib ketardi. Shuning uchun oyiga BITTA,
// guruhsiz (groupId=null) qator ochiladi.
//
// PRORATSIYA: ishga kirgan/bo'shagan oyda kalendar kunlar ulushicha. Stavka oy
// o'rtasida oshirilsa - har segment o'z summasi bilan qo'shiladi.
export const recalcBaseForTeacherMonth = async (
  teacher,
  year,
  month,
  { lockPaid = false, force = false } = {},
) => {
  const teacherId = String(teacher);
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEndExcl = new Date(Date.UTC(year, month, 1));
  const totalDays = new Date(Date.UTC(year, month, 0)).getUTCDate();

  const [compensations, user] = await Promise.all([
    compensationsForRange(teacherId, monthStart, monthEndExcl),
    prisma.user.findUnique({
      where: { id: teacherId },
      select: { hiredAt: true, terminatedAt: true, homeBranchId: true },
    }),
  ]);

  const segments = baseSegmentsForMonth(compensations, year, month, {
    from: user?.hiredAt || null,
    toExcl: user?.terminatedAt || null,
  });

  const existing = await prisma.teacherSalary.findFirst({
    where: { teacherId, groupId: null, kind: "base", year, month },
  });

  // QULFLANGAN OY - mutlaq to'siq (recalc() dagi bilan bir xil qoida).
  // Ishga olingan sana tuzatilganda aynan shu yo'l orqali o'tgan oylar
  // qayta yozilardi: hiredAt segmentlar chegarasini beradi (yuqorida
  // `from: user?.hiredAt`), ya'ni sana 16 oy orqaga surilsa 16 oylik
  // fiksa oylik qaytadan hisoblanib ketardi.
  if (existing?.isLocked) return withLegacyId(existing);

  // TO'LANGAN OY QULFI - recalc() dagi bilan bir xil shart: faqat STAVKA
  // o'zgarishida. Fiksa oylikda bu ayniqsa muhim, chunki effectiveFrom xato
  // qo'yilsa allaqachon to'langan barcha oylar qayta ochilib ketardi.
  if (lockPaid && !force && existing?.status === "paid" && existing.paidAmount > 0) {
    return withLegacyId(existing);
  }

  // Fiksa qism umuman yo'q (stavka olib tashlandi / o'qituvchi bo'shadi):
  // mavjud qator O'CHIRILMAYDI - unga to'lov bog'langan bo'lishi mumkin va
  // o'chirish o'tgan oyning chiqimini yo'q qilardi. Nolga tushiriladi; agar
  // allaqachon to'langan bo'lsa overpaidAmount ko'rinadigan bo'lib qoladi
  // (clawback uchun asos, jimgina yashirilmaydi).
  if (segments.length === 0) {
    if (!existing) return null;
    const zeroed = await applyExpected(existing.id, 0);
    return zeroed ? withLegacyId(zeroed) : null;
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
      { teacher: teacherId, year, month },
      "Fiksa oylik uchun filial aniqlanmadi - qator yaratilmadi",
    );
    return null;
  }

  if (existing) {
    const saved = await applyExpected(existing.id, expected, { payableDays, totalDays });
    return saved ? withLegacyId(saved) : null;
  }

  try {
    const created = await prisma.teacherSalary.create({
      data: {
        branchId,
        teacherId,
        groupId: null,
        kind: "base",
        year,
        month,
        salaryType: "fixed",
        fixedAmount: rateAmount,
        variableType: null,
        rateSource: "compensation",
        compensationId,
        prorationFactor: totalDays > 0 ? payableDays / totalDays : 0,
        payableDays,
        totalDays,
        proratedFixed: expected,
        baseEarnings: expected,
        expectedAmount: expected,
        status: deriveStatus(0, expected),
        source: "auto",
        recalculatedAt: new Date(),
      },
    });
    return withLegacyId(created);
  } catch (err) {
    // POYGA: boshqa jarayon shu qatorni endigina yaratdi.
    // Qisman unique indeks: (teacherId, year, month, kind)
    //   WHERE "groupId" IS NULL AND "kind" = 'base'
    // Mongo `11000` → Prisma `P2002`.
    if (err?.code === "P2002") {
      const again = await prisma.teacherSalary.findFirst({
        where: { teacherId, groupId: null, kind: "base", year, month },
      });
      if (!again) return null;
      const saved = await applyExpected(again.id, expected, { payableDays, totalDays });
      return saved ? withLegacyId(saved) : null;
    }
    throw err;
  }
};

// expectedAmount ni yangilaydi + status/overpaid ni DB dagi paidAmount
// dan keltirib chiqaradi (qator qulflanadi, poyga yo'q).
const applyExpected = async (salaryId, expected, extra = {}) =>
  updateWithDerivedStatus(salaryId, expected, {
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
  });

// Guruh+oy bo'yicha barcha maoshlarni qayta hisoblaydi (guruh tushumi o'zgarganda).
export const recalcForGroupMonth = async (group, year, month) => {
  const salaries = await prisma.teacherSalary.findMany({
    where: { groupId: String(group), year, month, kind: "group" },
    select: { id: true },
  });
  for (const s of salaries) {
    // eslint-disable-next-line no-await-in-loop
    await recalc(s.id);
  }
  return salaries.length;
};

// Guruhning barcha oylik maoshlarini qayta hisoblaydi (doimiy chegirma o'zgarganda).
export const recalcForGroup = async (group) => {
  const salaries = await prisma.teacherSalary.findMany({
    where: { groupId: String(group), kind: "group" },
    select: { id: true },
  });
  for (const s of salaries) {
    // eslint-disable-next-line no-await-in-loop
    await recalc(s.id);
  }
  return salaries.length;
};

// O'qituvchi guruhga biriktirilganda shu oy maoshini yaratadi.
// Stavka/ish-oynasi davrlardan (TeacherGroupPeriod) keltirib chiqariladi.
//
// IDEMPOTENT: qator allaqachon bo'lsa o'sha qaytariladi; poygada esa
// qisman unique indeks (teacherId, groupId, year, month, kind) ushlaydi
// va P2002 dan keyin mavjud qator o'qiladi. Ya'ni bir o'qituvchiga bir
// guruh uchun bir oyda IKKINCHI qator hech qanday yo'l bilan yaratilmaydi.
export const ensureSalaryForTeacherGroup = async (teacher, group, year, month) => {
  if (!teacher || !group) return null;
  const teacherId = String(teacher);
  const groupId = String(group);

  const exists = await prisma.teacherSalary.findFirst({
    where: { teacherId, groupId, year, month, kind: "group" },
  });
  if (exists) return withLegacyId(exists);

  // FILIAL: guruhdan meros. Bu fon vazifasidan (pg-boss) ham chaqiriladi -
  // u yerda foydalanuvchi konteksti yo'q.
  const branchId = await resolveBranchFromGroup(groupId);

  // Snapshot yozuv YARATILMASDAN OLDIN hisoblanadi: Mongoose'da `new Model()`
  // xotiradagi hujjat berardi, Prisma'da esa bunday oraliq obyekt yo'q.
  const { snap, groupRevenue, rate } = await buildSnapshot({
    teacherId,
    groupId,
    year,
    month,
  });

  try {
    const created = await prisma.teacherSalary.create({
      data: {
        branchId,
        teacherId,
        groupId,
        kind: "group",
        year,
        month,
        source: "auto",
        ...normalizeRateForWrite(rate),
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
        workStartDate: snap.workStartDate || null,
        workEndDate: snap.workEndDate || null,
        status: deriveStatus(0, snap.expectedAmount),
        recalculatedAt: new Date(),
      },
    });
    return withLegacyId(created);
  } catch (err) {
    if (err?.code === "P2002") {
      const again = await prisma.teacherSalary.findFirst({
        where: { teacherId, groupId, year, month, kind: "group" },
      });
      return again ? withLegacyId(again) : null;
    }
    throw err;
  }
};

// Berilgan oy uchun barcha faol guruh o'qituvchilariga maosh yaratadi.
export const generateMonthLegacy = async (year, month) => {
  const groups = await prisma.group.findMany({
    where: { isActive: true, isDeleted: false },
    select: { id: true },
  });
  let created = 0;
  for (const g of groups) {
    // Shu OYDA dars bergan o'qituvchilar (TeacherGroupPeriod overlap) - tarixiy
    // generatsiyada ham o'sha davrdagi haqiqiy o'qituvchilar olinadi.
    // eslint-disable-next-line no-await-in-loop
    const periods = await teacherGroupPeriodService.teacherPeriodsActiveInMonth(
      g.id,
      year,
      month,
    );
    // `p.teacher` - teacherGroupPeriod servisi saqlagan moslik nomi
    // (Prisma ustuni `teacherId`); ikkalasi ham qabul qilinadi.
    const teacherIds = [
      ...new Set(periods.map((p) => String(p.teacherId ?? p.teacher))),
    ];
    for (const teacherId of teacherIds) {
      // eslint-disable-next-line no-await-in-loop
      const existed = await prisma.teacherSalary.findFirst({
        where: { teacherId, groupId: g.id, year, month, kind: "group" },
        select: { id: true },
      });
      if (existed) continue;
      // eslint-disable-next-line no-await-in-loop
      await ensureSalaryForTeacherGroup(teacherId, g.id, year, month);
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
// yaratilmaydi (qisman unique indekslar himoya qiladi).
export const generateMonth = async (year, month) => {
  const groupResult = await generateMonthLegacy(year, month);

  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEndExcl = new Date(Date.UTC(year, month, 1));

  // Shu oyda amal qilgan fiksa stavkasi bo'lgan o'qituvchilar.
  // Mongo `.distinct("teacher", filter)` → Prisma `distinct` + `select`.
  const rows = await prisma.teacherCompensation.findMany({
    where: {
      isDeleted: false,
      baseType: "fixed_monthly",
      effectiveFrom: { lt: monthEndExcl },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: monthStart } }],
    },
    select: { teacherId: true },
    distinct: ["teacherId"],
  });
  const teacherIds = rows.map((r) => r.teacherId);

  let baseCreated = 0;
  for (const teacherId of teacherIds) {
    try {
      // eslint-disable-next-line no-await-in-loop
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
  const where = { ...branchFilter() };
  if (groupId) where.groupId = String(groupId);
  if (teacherId) where.teacherId = String(teacherId);
  // Qator turi: UI "asosiy maosh" va "mukofot" ni ajratib ko'rsatishi uchun.
  // Berilmasa - BARCHA turlar (guruh + fiksa + mukofot) qaytadi, chunki
  // o'qituvchining oylik jami aynan shularning yig'indisi.
  if (kind) where.kind = kind;
  if (year) where.year = Number(year);
  if (month) where.month = Number(month);
  if (status) where.status = status;

  // Qidiruv DB darajasida (filtrga kiradi) - aks holda sahifalab bo'lingandan
  // KEYIN filtrlash noto'g'ri sahifa/total berardi.
  //
  // FARQ (ataylab): Mongo varianti `filter.teacher` ni qidiruv natijasi bilan
  // BOSIB KETARDI - ya'ni o'qituvchi filtri bilan birga qidirilsa filtr
  // jimgina yo'qolib, BOSHQA o'qituvchilar ham chiqib kelardi. Prisma'da
  // ikkala shart yonma-yon turadi va AND bilan birlashadi (kesishma), ya'ni
  // filtr endi haqiqatan hurmat qilinadi. Bu faqat toraytiradi - hech qanday
  // ma'lumot qo'shimcha ochilmaydi.
  if (search && search.trim()) {
    const q = search.trim();
    where.teacher = {
      role: ROLES.TEACHER,
      OR: [
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
        { username: { contains: q, mode: "insensitive" } },
      ],
    };
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    prisma.teacherSalary.findMany({
      where,
      include: {
        teacher: { select: SAFE_TEACHER_SELECT },
        group: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.teacherSalary.count({ where }),
  ]);
  return { items: withLegacyIds(items), total, page, limit };
};

export const getById = async (id) => {
  const salary = await prisma.teacherSalary.findUnique({
    where: { id: String(id) },
    include: {
      teacher: { select: SAFE_TEACHER_SELECT },
      group: { select: { id: true, name: true } },
    },
  });
  if (!salary) throw new ApiError(404, "Maosh topilmadi");

  const transactions = await prisma.salaryTransaction.findMany({
    where: { salaryId: salary.id, isDeleted: false },
    orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
  });

  return withLegacyId({ ...salary, transactions });
};

// Bitta o'qituvchining barcha oylardagi maoshlari + har biriga tegishli
// to'lovlar (maosh to'lovlari tarixi sahifasi uchun). Eng yangi oy yuqorida.
export const historyByTeacher = async (teacherId) => {
  const tid = String(teacherId);
  // FILIAL: boshqa filial o'qituvchisining ismi ochilmasin.
  const branchCond = userBranchCondition();
  const teacher = await prisma.user.findFirst({
    where: { id: tid, ...(branchCond ? { AND: [branchCond] } : {}) },
    select: SAFE_TEACHER_SELECT,
  });
  if (!teacher) throw new ApiError(404, "O'qituvchi topilmadi");

  // FILIAL: o'qituvchi boshqa filialda ham ishlasa, u yerdagi maoshi
  // shu filial ko'rinishiga chiqmasin.
  const salaries = await prisma.teacherSalary.findMany({
    where: { teacherId: tid, ...branchFilter() },
    include: { group: { select: { id: true, name: true } } },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });

  const ids = salaries.map((s) => s.id);
  const txs = ids.length
    ? await prisma.salaryTransaction.findMany({
        where: { salaryId: { in: ids }, isDeleted: false },
        orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
      })
    : [];

  const txBySalary = new Map();
  for (const t of txs) {
    const key = String(t.salaryId);
    if (!txBySalary.has(key)) txBySalary.set(key, []);
    txBySalary.get(key).push(t);
  }

  const items = salaries.map((s) => ({
    ...s,
    transactions: txBySalary.get(String(s.id)) || [],
  }));

  const totalExpected = items.reduce((s, p) => s + (p.expectedAmount || 0), 0);
  const totalPaid = items.reduce((s, p) => s + (p.paidAmount || 0), 0);

  return {
    teacher: withLegacyId(teacher),
    items: withLegacyIds(items),
    summary: {
      months: items.length,
      totalExpected,
      totalPaid,
      totalRemaining: Math.max(0, totalExpected - totalPaid),
    },
  };
};

// O'qituvchining O'ZI uchun moliya ko'rinishi (teacher panel "Moliya" bo'limi).
// Faqat req.user.id bilan chaqiriladi - ruxsat tekshiruvi shart emas (o'z
// ma'lumotini ko'radi).
export const myFinance = async (teacherId) => historyByTeacher(teacherId);

// ═══════════════════════════════════════════════════════════════════════
// JORIY MAOSH HOLATI - "shu daqiqada bu o'qituvchiga qancha qarzmiz?"
//
// NEGA historyByTeacher YETMAYDI: u faqat YARATILGAN oylik qatorlarni
// qaytaradi, joriy oy qatori esa oy BOSHIDA to'liq summa bilan yaratiladi
// (generateMonthlySalary job). Ya'ni 8-avgustda ham 31 kunlik oylik
// "kutilayotgan" bo'lib turadi va "bugungi kunga qancha ishlab qo'ydi?"
// degan savolga javob yo'q. O'qituvchi oy o'rtasida hisob-kitob so'rasa
// yoki ishdan bo'shasa - aynan shu raqam kerak bo'ladi.
//
// Shuning uchun joriy oy ALOHIDA, o'tgan kunlar ulushicha hisoblanadi:
//   • base (markaz fiksasi) - stavka segmentlari bo'yicha (bugungacha
//     bo'lgan kunlar / oydagi kunlar). recalcBaseForTeacherMonth bilan
//     AYNAN bir xil matematika, faqat oy oxiri o'rniga BUGUN chegara.
//   • group qatorlari - o'z ish oynasi (workStartDate..workEndDate)
//     ichida o'tgan kunlar ulushicha. Oy o'rtasida boshlangan guruhda
//     oddiy "elapsed/totalDays" nisbati summani oshirib yuborardi.
//   • bonus/deduction - DISKRET hodisa (mukofot/jarima allaqachon
//     "ishlab olingan"), proratsiya qilinmaydi.
// ═══════════════════════════════════════════════════════════════════════
const DAY_MS = 24 * 60 * 60 * 1000;

const daysBetween = (fromMs, toMs) => Math.max(0, Math.round((toMs - fromMs) / DAY_MS));

// `now` parametri TESTLAR uchun: soatni mocklamasdan istalgan lahzani
// berish mumkin (isFutureLocalDay bilan bir xil naqsh).
export const balanceByTeacher = async (teacherId, { now = new Date() } = {}) => {
  const tid = String(teacherId);
  // FILIAL: boshqa filial o'qituvchisining ismi/moliyasi ochilmasin.
  const branchCond = userBranchCondition();
  const teacher = await prisma.user.findFirst({
    where: { id: tid, ...(branchCond ? { AND: [branchCond] } : {}) },
    select: { ...SAFE_TEACHER_SELECT, hiredAt: true, terminatedAt: true },
  });
  if (!teacher) throw new ApiError(404, "O'qituvchi topilmadi");

  // "Bugun" - mahalliy (Asia/Tashkent) kalendar kuni. Yarim tundan keyin
  // UTC bo'yicha hisoblasak kun orqaga surilib, bir kunlik maosh yo'qolardi.
  const today = localTodayMidnight(now);
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth() + 1;
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const monthEndExcl = new Date(Date.UTC(year, month, 1));
  const totalDays = daysInMonth(year, month);
  // BUGUNGI KUN SANALMAYDI: u hali tugamagan. 8-avgustda 7 kun ishlangan.
  const elapsedDays = Math.min(totalDays, daysBetween(monthStart.getTime(), today.getTime()));

  const rows = await prisma.teacherSalary.findMany({
    where: { teacherId: tid, ...branchFilter() },
    select: {
      kind: true,
      year: true,
      month: true,
      expectedAmount: true,
      paidAmount: true,
      payableDays: true,
      workStartDate: true,
      workEndDate: true,
    },
  });

  // ── O'TGAN OYLAR QOLDIG'I ──
  // Qator bo'yicha Math.max(0, ...) BILAN emas, SOF ayirma bilan: ortiqcha
  // to'langan oy keyingi oylardan yechilishi kerak. Har qatorni nolga
  // qisib qo'ysak, ortiqcha to'lov jimgina yo'qolib, markaz qarzdor bo'lib
  // ko'rinardi.
  // KELAJAK oylar (bo'lsa) hisobga KIRMAYDI - ular hali ishlanmagan.
  const isPast = (r) => r.year < year || (r.year === year && r.month < month);
  const previousRows = rows.filter(isPast);
  const previousRemaining = previousRows.reduce(
    (s, r) => s + (r.expectedAmount || 0) - (r.paidAmount || 0),
    0,
  );

  // ── JORIY OY ──
  const currentRows = rows.filter((r) => r.year === year && r.month === month);

  // Fiksa (base) qismi - stavka segmentlaridan. Ikki marta: to'liq oy va
  // bugungacha. Nisbati qator summasiga qo'llanadi, shunda qo'lda
  // tuzatilgan/qulflangan qator ham to'g'ri ulushda bo'linadi.
  const comps = await compensationsForRange(tid, monthStart, monthEndExcl);
  const sumSegments = (segs) =>
    segs.reduce((s, seg) => s + Math.round((seg.amount * segmentDays(seg)) / totalDays), 0);

  const endOfWork = teacher.terminatedAt ? toUtcMidnight(teacher.terminatedAt) : null;
  const toDateLimit =
    endOfWork && endOfWork.getTime() < today.getTime() ? endOfWork : today;

  const fixFull = sumSegments(
    baseSegmentsForMonth(comps, year, month, {
      from: teacher.hiredAt || null,
      toExcl: endOfWork,
    }),
  );
  const fixToDate = sumSegments(
    baseSegmentsForMonth(comps, year, month, {
      from: teacher.hiredAt || null,
      toExcl: toDateLimit,
    }),
  );
  const baseRatio = fixFull > 0 ? fixToDate / fixFull : 0;

  // Guruh qatorining ish oynasi ichida bugungacha o'tgan kunlar ulushi.
  const groupRatio = (row) => {
    const payable = Number(row.payableDays) || 0;
    if (payable <= 0) return 0;
    const start = row.workStartDate
      ? Math.max(monthStart.getTime(), toUtcMidnight(row.workStartDate).getTime())
      : monthStart.getTime();
    // workEndDate INKLYUZIV oxirgi kun → EKSKLYUZIV chegara +1 kun.
    const rowEnd = row.workEndDate
      ? toUtcMidnight(row.workEndDate).getTime() + DAY_MS
      : monthEndExcl.getTime();
    const endExcl = Math.min(today.getTime(), monthEndExcl.getTime(), rowEnd);
    return Math.min(1, daysBetween(start, endExcl) / payable);
  };

  const ratioFor = (row) => {
    // Boshlang'ich qoldiq O'TGAN davrga tegishli - u to'liq "ishlab
    // bo'lingan". Pastdagi groupRatio'ga tushib ketsa payableDays=0
    // bo'lgani uchun 0 qaytarardi va qoldiq kartochkada ko'rinmasdi.
    if (row.kind === "opening") return 1;
    if (row.kind === "bonus" || row.kind === "deduction") return 1;
    if (row.kind === "base") return baseRatio;
    return groupRatio(row);
  };

  // Joriy oy qatori HALI YARATILMAGAN bo'lishi mumkin (job oy boshida
  // ishlaydi, o'qituvchi esa oy o'rtasida ishga olingan). O'shanda fiksa
  // stavkadan JONLI hisoblanadi - aks holda yangi xodimning kartochkasi
  // "0 so'm" ko'rsatib, stavka belgilanmagandek tuyulardi.
  const hasBaseRow = currentRows.some((r) => r.kind === "base");
  const virtualFixFull = hasBaseRow ? 0 : fixFull;
  const virtualFixToDate = hasBaseRow ? 0 : fixToDate;

  const monthlyTotal =
    currentRows.reduce((s, r) => s + (r.expectedAmount || 0), 0) + virtualFixFull;
  const currentAccrued =
    currentRows.reduce((s, r) => s + Math.round((r.expectedAmount || 0) * ratioFor(r)), 0) +
    virtualFixToDate;
  const currentPaid = currentRows.reduce((s, r) => s + (r.paidAmount || 0), 0);

  // ── STAVKA (FIKSA) - BUGUN amalda bo'lgani ──
  const activeComp =
    comps.find(
      (c) =>
        toUtcMidnight(c.effectiveFrom).getTime() <= today.getTime() &&
        (!c.effectiveTo || toUtcMidnight(c.effectiveTo).getTime() > today.getTime()),
    ) || null;
  const fixedMonthly =
    activeComp?.baseType === "fixed_monthly" ? Number(activeComp.baseAmount) || 0 : 0;

  // Ishga kirgandan beri o'tgan kunlar (bo'shagan bo'lsa - o'sha kungacha).
  const hiredAt = teacher.hiredAt ? toUtcMidnight(teacher.hiredAt) : null;
  const daysWorked = hiredAt
    ? daysBetween(hiredAt.getTime(), toDateLimit.getTime())
    : null;

  return {
    teacher: withLegacyId(teacher),
    asOf: today,
    year,
    month,
    totalDays,
    elapsedDays,
    hiredAt: teacher.hiredAt || null,
    terminatedAt: teacher.terminatedAt || null,
    daysWorked,
    // Amaldagi fiksa stavka (oyiga). 0 = fiksa yo'q (faqat guruhdan foiz).
    fixedMonthly,
    // Joriy oyning TO'LIQ kutilayotgan summasi (fiksa + guruh + mukofot).
    monthlyTotal,
    // Oy boshigacha yig'ilgan qoldiq (to'lanmagan o'tgan oylar).
    previousRemaining,
    // Bu oy shu kungacha ishlab olingani.
    currentAccrued,
    // Bu oy uchun allaqachon to'langani (avans).
    currentPaid,
    // Jami qoldiq: o'tgan oylar + bu oy ishlangani - bu oy to'langani.
    totalRemaining: previousRemaining + currentAccrued - currentPaid,
  };
};

// Majburiyatlar: qoldig'i (expected - paid) > 0 bo'lgan maoshlar.
// month berilmasa - tanlangan yilning BARCHA oylari bo'yicha (har oy alohida qator).
export const obligations = async ({ groupId, year, month }) => {
  const where = { ...branchFilter(), year: Number(year) };
  if (month) where.month = Number(month);
  if (groupId) where.groupId = String(groupId);

  const items = await prisma.teacherSalary.findMany({
    where,
    include: {
      teacher: { select: SAFE_TEACHER_SELECT },
      group: { select: { id: true, name: true } },
    },
    orderBy: [{ month: "asc" }, { createdAt: "desc" }],
  });

  return withLegacyIds(
    items
      .map((s) => ({ ...s, remaining: Math.max(0, s.expectedAmount - s.paidAmount) }))
      .filter((s) => s.remaining > 0),
  );
};
