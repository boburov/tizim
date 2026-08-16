import { Prisma } from "@prisma/client";
import prisma from "../../../config/prisma.js";
import ApiError from "../../../utils/ApiError.js";
import {
  branchFilter,
  userBranchCondition,
  resolveBranchFromGroup,
} from "../../../helpers/branchContext.helper.js";
import logger from "../../../config/logger.js";
import {
  computePaymentSnapshot,
  computeLessonSnapshot,
  deriveStatus,
} from "./proration.helper.js";
import {
  getClassDaysInRange,
  toUtcMidnight,
} from "../../../helpers/attendance.helper.js";
import { holidayKeySetForRange } from "../../holidays/services/holidays.service.js";
import { withLegacyId, withLegacyIds } from "../../../utils/serialize.js";
import {
  loadCancelledLessonKeys,
  isCancelledSession,
} from "../../../helpers/lessonCancellation.helper.js";
import {
  loadFreezeWindows,
  isFrozenOn,
} from "../../../helpers/studentFreeze.helper.js";

// ═══════════════════════════════════════════════════════════════════════
// O'QUVCHI TO'LOVI (billing) - eng nozik moliyaviy fayl.
//
// MONGO → PRISMA
//   { student: id } / { group: id }  → { studentId } / { groupId }
//   { payment: id }                  → { paymentId }
//   { membership: id }               → { membershipId }
//   { writtenOff: { $ne: true } }    → { writtenOff: false }
//   $expr: { $gt: [a, b] }           → { a: { gt: prisma.model.fields.b } }
//   session                          → tx (Prisma tranzaksiya klienti)
//   err.code 11000                   → err.code "P2002"
//
// `isDeleted` FILTRLARI OLIB TASHLANDI: StudentPayment'da bunday ustun
// UMUMAN YO'Q (Mongoose modelida ham softDelete plagini yo'q edi - fayl
// izohi buni ochiq aytadi). Eski `{ $ne: true }` sharti hamma qatorga
// to'g'ri kelardi, ya'ni natija o'zgarmaydi.
//
// ATOMIKLIK: Mongo `paidAmount`/`status` ni AGGREGATION UPDATE PIPELINE
// bilan yozardi - ya'ni status BAZADAGI JORIY paidAmount dan bitta amalda
// keltirib chiqarilardi ("o'qi → hisobla → saqla" poygasi yo'q). Postgres'da:
//   • applyPaidDelta  → BITTA xom `UPDATE` (shartli cap ham shu yerda);
//   • recalc/recalcStatus → `$transaction` + `SELECT ... FOR UPDATE`.
// Batafsil sabab: teacherSalary.service.js boshidagi izoh.
//
// PUL TURI: barcha summalar `double precision` (Mongo'da float64) →
// Prisma oddiy `number` beradi. Decimal/BigInt konvertatsiyasi YO'Q.
// ═══════════════════════════════════════════════════════════════════════

const SAFE_STUDENT_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  username: true,
  phone: true,
};

// Guruh jadvali RELATION - `getClassDaysInRange` uni talab qiladi.
// Unutilsa massiv bo'sh keladi, dars soni 0 bo'lib qarz JIMGINA nolga tushardi.
const GROUP_FOR_BILLING = {
  id: true,
  startDate: true,
  endDate: true,
  entryBilling: true,
  schedule: {
    select: { day: true, startTime: true, endTime: true, effectiveFrom: true },
  },
};

const db = (tx) => tx || prisma;
const actorId = (u) => u?.id || u?._id || null;

// Oy oralig'iga tegishli o'quvchi+guruh a'zolik davrlarini yuklaydi.
// Rejoin (bir oyda ketib qayta qo'shilish) bo'lsa bir nechta davr qaytadi -
// proratsiya har birini alohida sanab kunlarni qo'shadi.
const loadMembershipPeriods = async (student, group, year, month) => {
  const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const rows = await prisma.groupMembership.findMany({
    where: {
      studentId: String(student),
      groupId: String(group),
      isDeleted: false,
      joinedAt: { lte: monthEnd },
      OR: [{ leftAt: null }, { leftAt: { gt: monthStart } }],
    },
    select: { joinedAt: true, leftAt: true },
  });
  return rows.map((r) => ({ joinedAt: r.joinedAt, leftAt: r.leftAt || null }));
};

// Guruh jadvali + dam olish kunlari bo'yicha oydagi BARCHA dars sessiyalarining
// sanalarini qaytaradi (kunda bir nechta dars bo'lsa - har biri alohida dars).
// Kurs tugash sanasi (endDate) oy ichida bo'lsa - undan keyin dars hisoblanmaydi.
const loadMonthLessonDates = async (groupDoc, year, month) => {
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  let monthEnd = new Date(Date.UTC(year, month, 0));
  if (groupDoc?.endDate) {
    const end = toUtcMidnight(groupDoc.endDate);
    if (end.getTime() < monthEnd.getTime()) monthEnd = end;
  }
  if (monthEnd.getTime() < monthStart.getTime()) return [];

  const [holidaySet, cancelledSet] = await Promise.all([
    holidayKeySetForRange(monthStart, monthEnd),
    // BEKOR QILINGAN DARSLAR: markaz aybi bilan o'tmagan dars uchun o'quvchi
    // to'lamaydi. Holiday'dan farqi - u FAQAT shu guruhga tegishli
    // (o'qituvchi kasal bo'ldi, xona band, svet o'chdi).
    loadCancelledLessonKeys(groupDoc?.id ?? groupDoc?._id, monthStart, monthEnd),
  ]);

  return getClassDaysInRange(groupDoc, monthStart, monthEnd, holidaySet)
    .filter((s) => !isCancelledSession(cancelledSet, s))
    .map((s) => toUtcMidnight(s.date));
};

// A'zolik davrlariga (leftAt EXCLUSIVE) to'g'ri keladigan va asOf sanasigacha
// (shu kun inklyuziv) O'TIB BO'LGAN darslar sonini sanaydi. Davrlar a'zolik
// bo'yicha kesishmaydi, shuning uchun bir dars faqat bir marta sanaladi.
const countElapsedLessons = (lessonDates, periods, asOf, freezeWindows = []) => {
  const cutoff = asOf ? asOf.getTime() : Infinity;
  let count = 0;
  for (const d of lessonDates) {
    const t = d.getTime();
    if (t > cutoff) continue; // hali bo'lib o'tmagan dars - accrual qilinmaydi
    // Muzlatilgan kundagi dars accrual qilinmaydi (o'quvchi to'lamaydi).
    if (freezeWindows.length && isFrozenOn(freezeWindows, t)) continue;
    for (const p of periods) {
      const start = p.joinedAt ? toUtcMidnight(p.joinedAt).getTime() : -Infinity;
      const endExcl = p.leftAt ? toUtcMidnight(p.leftAt).getTime() : Infinity;
      if (t >= start && t < endExcl) {
        count += 1;
        break;
      }
    }
  }
  return count;
};

// Bir o'quvchi+guruh+oy uchun snapshot maydonlarini hisoblaydi (DB dan yuklab).
// periods berilmasa, bitta {joinedAt, leftAt} davr ishlatiladi.
// BILLING TO'LIQ-OY: qarz oy boshidanoq to'liq oylik summa (kunlik/dars asosida
// o'smaydi). A'zolik davri (qo'shilish/chiqish) va muzlatishga proratsiya
// qilinadi - narx = oylik × (a'zolikdagi darslar / oydagi jami darslar) − chegirma.
// Guruh jadvali bo'lmasa (yoki oyda dars yo'q bo'lsa) eski kalendar-kun
// proratsiyasiga qaytadi - shunda jadvalsiz guruhlarda billing yo'qolib qolmaydi.
const buildSnapshot = async ({ student, group, year, month, joinedAt, leftAt = null, periods = null }) => {
  const studentId = String(student);
  const groupId = String(group);

  const [feeDoc, discounts, groupDoc, freezeWindows] = await Promise.all([
    prisma.groupFee.findUnique({
      where: { groupId_year_month: { groupId, year, month } },
      select: { amount: true },
    }),
    prisma.discount.findMany({
      where: {
        studentId,
        groupId,
        isActive: true,
        isDeleted: false,
        OR: [{ scope: "permanent" }, { scope: "monthly", year, month }],
      },
    }),
    prisma.group.findUnique({ where: { id: groupId }, select: GROUP_FOR_BILLING }),
    // Muzlatish o'quvchi darajasida (barcha guruhlarga taalluqli).
    loadFreezeWindows(studentId),
  ]);

  const baseFee = feeDoc ? feeDoc.amount : 0;
  const rawPeriods = periods === null ? [{ joinedAt, leftAt }] : periods;

  // KIRISH SIYOSATI: "full" bo'lsa oy o'rtasida kirish narxni kamaytirmaydi.
  //
  // Amalga oshirish - a'zolik boshlanishini oy boshiga surish. Nega aynan
  // shunday: chiqib ketish va muzlatish o'z kuchida qoladi, ya'ni 5-avgustda
  // qo'shilib 20-avgustda ketgan o'quvchi baribir faqat 20-sanagacha to'laydi.
  // "factor = 1" deb qo'yish esa uni butun oyga to'lattirardi - olinmagan
  // xizmat uchun pul undirish siyosat emas, xato bo'lardi.
  // FAQAT BIRINCHI (eng erta) davr suriladi. Bir oyda ketib qayta qo'shilgan
  // (rejoin) o'quvchida keyingi davrlar tegilmaydi - oradagi bo'shliq
  // to'lanmaydi. Hammasini sursak, o'sha bo'shliq ham hisoblanib ketardi.
  const fullEntry = groupDoc?.entryBilling === "full";
  const monthStart = new Date(Date.UTC(year, month - 1, 1));

  let effPeriods = rawPeriods;
  if (fullEntry && rawPeriods.length) {
    const msOf = (p) => (p.joinedAt ? toUtcMidnight(p.joinedAt).getTime() : -Infinity);
    let firstIdx = 0;
    for (let i = 1; i < rawPeriods.length; i += 1) {
      if (msOf(rawPeriods[i]) < msOf(rawPeriods[firstIdx])) firstIdx = i;
    }
    effPeriods = rawPeriods.map((p, i) =>
      i === firstIdx ? { ...p, joinedAt: monthStart } : p,
    );
  }

  const lessonDates = groupDoc
    ? await loadMonthLessonDates(groupDoc, year, month)
    : [];

  // Jadval/dars yo'q → orqaga-moslik uchun kalendar-kun proratsiyasi.
  // fullExpectedAmount = accrued bilan bir xil (kalendar model kunda o'smaydi).
  if (lessonDates.length === 0) {
    const snap = computePaymentSnapshot({
      baseFee,
      year,
      month,
      joinedAt: fullEntry ? monthStart : joinedAt,
      leftAt,
      periods: periods === null ? null : effPeriods,
      discounts,
      freezeWindows,
    });
    return { ...snap, fullExpectedAmount: snap.expectedAmount };
  }

  const monthEnd = new Date(Date.UTC(year, month, 0));

  // MAXRAJ - oyning TO'LIQ dars rejasi (guruh boshlanish sanasi bilan
  // QIRQILMAGAN).
  //
  // `loadMonthLessonDates` darslarni `startDate` dan boshlab beradi, ya'ni
  // guruh 5-sanada boshlansa birinchi oyda maxraj ham qisqarardi va nisbat
  // har doim 1 chiqardi - guruh oy o'rtasida boshlansa ham HAR DOIM to'liq
  // oylik olinardi, tanlovsiz. Endi "prorated" da narx oyning haqiqiy
  // rejasiga nisbatan kamayadi (mas. 14 tadan 11 tasi → 11/14).
  //
  // `endDate` esa ataylab qirqilaveradi: kursning TUGASHI kirish siyosatiga
  // aloqador emas, uni bu yerda o'zgartirish boshqa xatti-harakatni jimgina
  // buzardi.
  //
  // Guruhning birinchi oyidan boshqa oylarda ikkala ro'yxat bir xil, ya'ni
  // "prorated" avvalgidek ishlaydi - o'zgarish faqat birinchi oyga tegadi.
  // Shuning uchun qo'shimcha so'rov ham FAQAT o'sha oyda bajariladi.
  const gStart = groupDoc?.startDate ? toUtcMidnight(groupDoc.startDate) : null;
  const startsMidMonth =
    gStart &&
    gStart.getUTCFullYear() === year &&
    gStart.getUTCMonth() + 1 === month &&
    gStart.getUTCDate() > 1;

  const planDates =
    !fullEntry && startsMidMonth
      ? await loadMonthLessonDates({ ...groupDoc, startDate: null }, year, month)
      : lessonDates;

  // TO'LIQ-OY billing: qarz oy boshidanoq to'liq oylik summaga teng - kunlik/dars
  // asosida o'smaydi. Shu oyda a'zolikka to'g'ri keladigan BARCHA darslar
  // (asOf = oy oxiri, muzlatilganlaridan tashqari) sanaladi. Oy o'rtasida
  // qo'shilgan o'quvchi faqat qolgan darslar uchun to'laydi; chiqib ketsa -
  // keyingi recalc qarzni haqiqiy a'zolik davriga qarab kamaytiradi.
  const totalLessons = planDates.length;
  const elapsedLessons = countElapsedLessons(
    lessonDates,
    effPeriods,
    monthEnd,
    freezeWindows,
  );

  const snap = computeLessonSnapshot({
    baseFee,
    totalLessons,
    elapsedLessons,
    discounts,
  });

  // expectedAmount endi to'liq-oy obligatsiyasiga teng - shuning uchun
  // fullExpectedAmount ham o'sha (ortiqcha to'lov shu chegaraga nisbatan o'lchanadi).
  return { ...snap, fullExpectedAmount: snap.expectedAmount };
};

// `fullExpectedAmount` - HISOB natijasi, USTUN EMAS.
//
// Mongoose sxema tashqarisidagi maydonni jimgina tashlab yuborardi;
// Prisma esa "Unknown argument" bilan yiqiladi. Shuning uchun yozishdan
// oldin ochiq ajratib olinadi.
const toPaymentColumns = ({ baseFee, prorationFactor, discountApplied, expectedAmount }) => ({
  baseFee,
  prorationFactor,
  discountApplied,
  expectedAmount,
});

// paidAmount ni atomik delta bilan o'zgartiradi ($inc semantikasi) va statusni
// shu yozuvning DB'dagi joriy qiymatlaridan keltirib chiqaradi. Parallel
// tranzaksiyalar kommutativ qo'shiladi - hech biri yo'qolmaydi.
// capToRemaining=true bo'lsa: yangi paidAmount expectedAmount dan oshadigan bo'lsa
// qator YANGILANMAYDI (null qaytadi) - plan qoldig'idan ortiq to'lovni shartli-atomik
// to'sish (parallel double-click ham capdan o'tmaydi).
// tx berilsa, yozuv shu tranzaksiya ichida bajariladi (to'lov qabul qilish/bekor
// qilishda PaymentTransaction bilan birga atomik bo'lsin).
//
// SQL'da o'ng tomondagi `"paidAmount"` ESKI qiymatni beradi - Mongo'dagi
// `{ $add: ["$paidAmount", delta] }` bilan aynan bir xil semantika.
export const applyPaidDelta = async (
  paymentId,
  delta,
  { tx, capToRemaining = false } = {},
) => {
  const client = db(tx);
  const id = String(paymentId);
  const d = Number(delta) || 0;

  const setClause = Prisma.sql`
    SET "paidAmount" = COALESCE("paidAmount", 0) + ${d}::double precision,
        "status"     = CASE
          WHEN COALESCE("paidAmount", 0) + ${d}::double precision <= 0
            THEN 'unpaid'::"PayStatus"
          WHEN COALESCE("paidAmount", 0) + ${d}::double precision < "expectedAmount"
            THEN 'partial'::"PayStatus"
          ELSE 'paid'::"PayStatus"
        END,
        -- Prisma'ning @updatedAt KLIENT tomonida ishlaydi; xom SQL uni
        -- chetlab o'tadi, shuning uchun ochiq yoziladi.
        "updatedAt"  = NOW()
  `;

  const affected = capToRemaining
    ? await client.$executeRaw`
        UPDATE "student_payments" ${setClause}
        WHERE "id" = ${id}
          AND COALESCE("paidAmount", 0) + ${d}::double precision <= "expectedAmount"
      `
    : await client.$executeRaw`
        UPDATE "student_payments" ${setClause}
        WHERE "id" = ${id}
      `;

  if (affected === 0) return null;
  return client.studentPayment.findUnique({ where: { id } });
};

// Faol (o'chirilmagan) tranzaksiyalar yig'indisidan paidAmount/status ni tiklaydi
// (repair/recalc yo'li). Qator qulflanadi - stale save yo'q.
export const recalcStatus = async (paymentId) => {
  const id = String(paymentId);
  const agg = await prisma.paymentTransaction.aggregate({
    where: { paymentId: id, isDeleted: false },
    _sum: { amount: true },
  });
  const paidAmount = agg._sum.amount ?? 0;

  return prisma.$transaction(async (tx) => {
    const rows = await tx.$queryRaw`
      SELECT "expectedAmount" FROM "student_payments" WHERE "id" = ${id} FOR UPDATE
    `;
    if (!rows.length) return null;
    const expected = Number(rows[0].expectedAmount) || 0;
    return tx.studentPayment.update({
      where: { id },
      data: { paidAmount, status: deriveStatus(paidAmount, expected) },
    });
  });
};

// Snapshot (fee/proratsiya/chegirma) ni qayta hisoblab, statusni ham yangilaydi.
// Status DB'dagi JORIY paidAmount'dan keltirib chiqariladi (qator qulflanadi) -
// hisob davomida kelib tushgan parallel to'lov statusni buzmaydi.
// tx berilsa, ochiq tranzaksiya ichida o'qib-yozadi.
export const recalc = async (paymentId, { tx } = {}) => {
  const client = db(tx);
  const id = String(paymentId);
  const payment = await client.studentPayment.findUnique({ where: { id } });
  if (!payment) return null;

  // Yomon qarz (write-off) MUZLATILGAN: expected/status qayta hisoblanmaydi,
  // aks holda kunlik accrual recalc yopilgan qarzni qayta ochib yuborardi.
  if (payment.writtenOff) return withLegacyId(payment);

  // BOSHLANG'ICH QARZ ham MUZLATILGAN - shu funksiya YAGONA himoya nuqtasi.
  //
  // expectedAmount bu yerda qo'lda kiritilgan summa: u fee/proratsiya/
  // chegirmadan hosil bo'lmagan, chunki o'sha davrda tizim yo'q edi.
  // buildSnapshot() a'zolik davrlarini topa olmay 0 qaytarardi va qarz
  // JIMGINA YO'QOLARDI. Bu funksiyaga recalcForGroupMonth, recalcForStudent,
  // recalcForStudentScope va kunlik accrueMonth job'i - hammasi kelib
  // taqaladi, shuning uchun to'siq aynan shu yerda turibdi.
  if (payment.isOpening) return withLegacyId(payment);

  // Shu oydagi BARCHA a'zolik davrlari (rejoin holatida bir nechta) bo'yicha
  // hisoblaymiz - bitta membership ref'iga tayanib qolmaymiz, aks holda
  // ketib-qaytgan o'quvchining ikkinchi davri billing'dan tushib qolardi.
  const periods = await loadMembershipPeriods(
    payment.studentId,
    payment.groupId,
    payment.year,
    payment.month,
  );

  const snap = await buildSnapshot({
    student: payment.studentId,
    group: payment.groupId,
    year: payment.year,
    month: payment.month,
    // Har doim haqiqiy davrlar massivini uzatamiz: bo'sh bo'lsa (o'quvchi shu oyda
    // guruhda yo'q) expected=0 bo'ladi - to'liq oy billing'iga default qilmaymiz.
    periods,
  });

  // Qatorni qulflab, statusni JORIY paidAmount dan keltirib chiqaramiz.
  const runUpdate = async (c) => {
    const rows = await c.$queryRaw`
      SELECT "paidAmount" FROM "student_payments" WHERE "id" = ${id} FOR UPDATE
    `;
    if (!rows.length) return null;
    const paid = Number(rows[0].paidAmount) || 0;
    return c.studentPayment.update({
      where: { id },
      data: {
        ...toPaymentColumns(snap),
        status: deriveStatus(paid, snap.expectedAmount),
        recalculatedAt: new Date(),
      },
    });
  };

  // Chaqiruvchi allaqachon tranzaksiya ichida bo'lsa yangisini ochib
  // bo'lmaydi (Prisma ichma-ich tranzaksiyani qo'llamaydi) - o'sha
  // klientda ishlaymiz, qulf baribir o'sha tranzaksiyaga tegishli.
  const updated = tx ? await runUpdate(tx) : await prisma.$transaction(runUpdate);

  // Ortiqcha to'lovni depozitga qaytarish. MUHIM: taqqoslash accrued expected'ga
  // emas, TO'LIQ-OY obligatsiyasiga (fullExpectedAmount) nisbatan - shunda dars-asosli
  // accrual paytida avans (oldindan to'lov) har kuni depozitga ko'chib ketmaydi;
  // faqat butun oy narxidan ORTIQ to'langan qism qaytadi. Faqat tranzaksiyasiz
  // (recompute kaskadi) - yaratish (tx) oqimida emas.
  // Dinamik import: deposit.service → studentPayment.service siklini oldini oladi.
  const fullExpected = snap.fullExpectedAmount ?? snap.expectedAmount;
  if (!tx && updated && (updated.paidAmount || 0) > fullExpected) {
    try {
      const depositService = await import("../../deposits/services/deposit.service.js");
      await depositService.reconcileDepositOverpay(updated.id, {
        capAmount: fullExpected,
      });
    } catch (err) {
      logger.warn({ err }, "Depozit ortiqcha qoplama qayta hisoblanmadi");
    }
  }
  return updated ? withLegacyId(updated) : null;
};

// Guruh+oy bo'yicha barcha to'lovlarni qayta hisoblaydi (fee o'zgarganda).
export const recalcForGroupMonth = async (group, year, month) => {
  const payments = await prisma.studentPayment.findMany({
    where: { groupId: String(group), year, month },
    select: { id: true },
  });
  for (const p of payments) {
    // eslint-disable-next-line no-await-in-loop
    await recalc(p.id);
  }
  return payments.length;
};

// O'quvchi+guruh chegirmasi o'zgarganda tegishli oylarni qayta hisoblaydi.
// monthly chegirma → faqat shu oy; permanent → barcha mavjud oylar.
export const recalcForStudentScope = async (student, group, { scope, year, month } = {}) => {
  const where = { studentId: String(student), groupId: String(group) };
  if (scope === "monthly" && year && month) {
    where.year = year;
    where.month = month;
  }
  const payments = await prisma.studentPayment.findMany({ where, select: { id: true } });
  for (const p of payments) {
    // eslint-disable-next-line no-await-in-loop
    await recalc(p.id);
  }
  return payments.length;
};

// Berilgan (year,month) chegarasidan OLDINGI oylarda o'quvchining shu guruhda
// to'lov qilingan (paidAmount > 0) yozuvi bormi - eng erta to'langan oyni qaytaradi
// ({year, month}) yoki null. joinedAt'ni oldinga surishni qulflashda ishlatiladi:
// to'langan davrni "men keyinroq qo'shilganman" deb o'chirib bo'lmaydi.
export const earliestPaidMonthBefore = async (student, group, { year, month }) => {
  const beforeIdx = year * 12 + (month - 1);
  const paid = await prisma.studentPayment.findMany({
    where: { studentId: String(student), groupId: String(group), paidAmount: { gt: 0 } },
    select: { year: true, month: true },
  });
  let best = null;
  let bestIdx = Infinity;
  for (const p of paid) {
    const idx = p.year * 12 + (p.month - 1);
    if (idx < beforeIdx && idx < bestIdx) {
      bestIdx = idx;
      best = { year: p.year, month: p.month };
    }
  }
  return best;
};

// O'quvchining tegishli barcha guruh/oy to'lovlarini qayta hisoblaydi.
export const recalcForStudent = async (student) => {
  const payments = await prisma.studentPayment.findMany({
    where: { studentId: String(student) },
    select: { id: true },
  });
  for (const p of payments) {
    // eslint-disable-next-line no-await-in-loop
    await recalc(p.id);
  }
  return payments.length;
};

// Berilgan oydagi barcha to'lovlarni qayta hisoblaydi - dars-asosli accrual'ni
// bir kunga oldinga suradi (o'tib bo'lgan yangi dars(lar) qarzga qo'shiladi).
// Kunlik job chaqiradi. Bitta yozuvdagi xato butun jarayonni to'xtatmaydi.
export const accrueMonth = async (year, month) => {
  const payments = await prisma.studentPayment.findMany({
    where: { year, month },
    select: { id: true },
  });
  let recalculated = 0;
  for (const p of payments) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await recalc(p.id);
      recalculated += 1;
    } catch (err) {
      logger.warn({ err, payment: p.id }, "Kunlik accrual recalc xatosi");
    }
  }
  return { total: payments.length, recalculated };
};

// USTUNNI USTUNGA solishtirish: Mongo `$expr: { $gt: ["$expectedAmount",
// "$paidAmount"] }` → Prisma "field reference".
const OUTSTANDING = {
  expectedAmount: { gt: prisma.studentPayment.fields.paidAmount },
};

// O'quvchining shu guruhda FAOL qarzi (biror oyda expected>paid, write-off
// qilinmagan) bormi. Hisobdan chiqarilgan (writtenOff) qarz faol qarz emas.
export const hasOutstandingDebtInGroup = async (student, group) =>
  Boolean(
    await prisma.studentPayment.findFirst({
      where: {
        studentId: String(student),
        groupId: String(group),
        writtenOff: false,
        ...OUTSTANDING,
      },
      select: { id: true },
    }),
  );

// O'quvchining shu guruhdagi FAOL qarzini oy-ma-oy taqsimlab qaytaradi:
// { total, items:[{ paymentId, year, month, amount }] }. Write-off qilinganlar
// chiqarib tashlanadi. Chiqarish modalidagi summa va write-off shu funksiyaga tayanadi.
export const getOutstandingBreakdownInGroup = async (student, group) => {
  const payments = await prisma.studentPayment.findMany({
    where: {
      studentId: String(student),
      groupId: String(group),
      writtenOff: false,
      ...OUTSTANDING,
    },
    select: { id: true, year: true, month: true, expectedAmount: true, paidAmount: true },
    orderBy: [{ year: "asc" }, { month: "asc" }],
  });

  const items = payments.map((p) => ({
    paymentId: p.id,
    year: p.year,
    month: p.month,
    amount: Math.max(0, (p.expectedAmount || 0) - (p.paidAmount || 0)),
  }));
  const total = items.reduce((s, it) => s + it.amount, 0);
  return { total, items };
};

// O'quvchining shu guruhdagi FAOL qarzini YOMON QARZ (write-off) sifatida yopadi:
//  1) har bir qarzli oy to'lovini writtenOff=true + writeOffAmount(=qoldiq) qiladi,
//  2) bitta DebtWriteOff audit yozuvini yaratadi (breakdown bilan).
// Yopilgan qarz endi faol qarz emas va accrual recalc uni qayta ochmaydi.
// Qarz bo'lmasa - hech nima qilmaydi (null qaytaradi).
export const writeOffDebtInGroup = async (
  student,
  group,
  { membershipId = null, currentUser = null, reasonTitle = "" } = {},
) => {
  const studentId = String(student);
  const groupId = String(group);

  const { total, items } = await getOutstandingBreakdownInGroup(studentId, groupId);
  if (total <= 0) return null;

  const [studentDoc, groupDoc] = await Promise.all([
    prisma.user.findUnique({
      where: { id: studentId },
      select: { firstName: true, lastName: true },
    }),
    prisma.group.findUnique({ where: { id: groupId }, select: { name: true } }),
  ]);
  const studentName = studentDoc
    ? `${studentDoc.firstName || ""} ${studentDoc.lastName || ""}`.trim()
    : "";

  const now = new Date();

  // ATOMIKLIK - HAQIQIY YAXSHILANISH: Mongo variantida to'lov qatorlari
  // va audit yozuvi ALOHIDA yozilardi. Ikkinchisi yiqilsa qarz "yopilgan"
  // bo'lib qolar, lekin uni KIM va NEGA yopgani hech qayerda qolmasdi -
  // hisobotda sababsiz yo'qolgan pul. Endi ikkalasi bitta tranzaksiyada.
  const writeOff = await prisma.$transaction(async (tx) => {
    await Promise.all(
      items.map((it) =>
        tx.studentPayment.update({
          where: { id: it.paymentId },
          data: { writtenOff: true, writeOffAmount: it.amount, writeOffAt: now },
        }),
      ),
    );

    return tx.debtWriteOff.create({
      data: {
        studentId,
        groupId,
        membershipId: membershipId ? String(membershipId) : null,
        amount: total,
        // Mongo'da bu EMBEDDED massiv edi; Prisma'da alohida jadval
        // (DebtWriteOffBreakdown) - ichma-ich `create` bilan yoziladi.
        breakdown: {
          create: items.map((it) => ({
            paymentId: it.paymentId,
            year: it.year,
            month: it.month,
            amount: it.amount,
          })),
        },
        reasonTitle: reasonTitle || "",
        studentName,
        groupName: groupDoc?.name || "",
        createdById: actorId(currentUser),
      },
      include: { breakdown: true },
    });
  });

  return { amount: total, writeOff: withLegacyId(writeOff) };
};

// Bitta a'zolik uchun (o'quvchi guruhga qo'shilganda) shu oy to'lovini yaratadi.
// tx berilsa, ochiq tranzaksiya ichida o'qib-yozadi (avans spill paytida
// PaymentTransaction bilan birga atomik bo'lsin).
export const ensurePaymentForMembership = async (membership, year, month, { tx } = {}) => {
  if (!membership) return null;
  const client = db(tx);
  const studentId = String(membership.studentId ?? membership.student);
  const groupId = String(membership.groupId ?? membership.group);
  const membershipId = String(membership.id ?? membership._id);

  // isOpening:false - boshlang'ich qarz qatori shu oyda yonma-yon turgan
  // bo'lishi mumkin. Uni "plan allaqachon bor" deb qabul qilsak, o'quvchining
  // HAQIQIY oylik plani umuman yaratilmay qolardi (recalc uni muzlatilgan
  // deb darhol qaytaradi) - ya'ni oy bepul bo'lib ketardi.
  const exists = await client.studentPayment.findUnique({
    where: {
      studentId_groupId_year_month_isOpening: {
        studentId,
        groupId,
        year,
        month,
        isOpening: false,
      },
    },
  });
  if (exists) {
    // Rejoin: shu oyda to'lov allaqachon bor (eski a'zolikniki). Uni joriy
    // a'zolikka ulab, barcha davrlar bo'yicha qayta hisoblaymiz - aks holda
    // yangi davr kunlari billing'ga kirmay qolardi.
    if (String(exists.membershipId) !== membershipId) {
      await client.studentPayment.update({
        where: { id: exists.id },
        data: { membershipId },
      });
    }
    return recalc(exists.id, { tx });
  }

  const snap = await buildSnapshot({
    student: studentId,
    group: groupId,
    year,
    month,
    joinedAt: membership.joinedAt,
    leftAt: membership.leftAt || null,
  });

  // FILIAL: guruhdan meros. Bu funksiya fon vazifalaridan ham chaqiriladi
  // (u yerda foydalanuvchi konteksti YO'Q), shuning uchun filial guruhdan
  // olinadi - kontekstga bog'liq bo'lmagan yagona to'g'ri manba.
  const branchId = await resolveBranchFromGroup(groupId);

  try {
    const created = await client.studentPayment.create({
      data: {
        branchId,
        studentId,
        groupId,
        membershipId,
        year,
        month,
        // `fullExpectedAmount` ustun EMAS - ajratib olinadi.
        ...toPaymentColumns(snap),
        paidAmount: 0,
        status: deriveStatus(0, snap.expectedAmount),
        recalculatedAt: new Date(),
      },
    });
    return withLegacyId(created);
  } catch (err) {
    // Unique indeks poyga holati (parallel generatsiya) - mavjudni qaytaramiz.
    // (studentId, groupId, year, month, isOpening) - Mongo 11000 → Prisma P2002.
    if (err?.code === "P2002") {
      const again = await client.studentPayment.findUnique({
        where: {
          studentId_groupId_year_month_isOpening: {
            studentId,
            groupId,
            year,
            month,
            isOpening: false,
          },
        },
      });
      return again ? withLegacyId(again) : null;
    }
    throw err;
  }
};

// Berilgan oy uchun barcha faol a'zoliklarga to'lov yaratadi (job + regenerate).
export const generateMonth = async (year, month) => {
  const activeGroups = await prisma.group.findMany({
    where: { isActive: true, isDeleted: false },
    select: { id: true },
  });
  const ids = activeGroups.map((g) => g.id);

  // Faol a'zolar + shu OY ICHIDA ketganlar (leftAt exclusive: oy boshidan keyin
  // ketgan bo'lsa, oy boshida hali a'zo edi - prorated to'lov yozuvi tegishli).
  // Aks holda kechiktirilgan regenerate oy o'rtasida ketganlarning haqini tashlab ketardi.
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const memberships = ids.length
    ? await prisma.groupMembership.findMany({
        where: {
          groupId: { in: ids },
          isDeleted: false,
          OR: [{ leftAt: null }, { leftAt: { gt: monthStart } }],
        },
      })
    : [];

  let created = 0;
  for (const m of memberships) {
    // isOpening:false - boshlang'ich qarz qatori oylik planning o'rnini
    // BOSA OLMAYDI (ensurePaymentForMembership'dagi bilan bir xil sabab).
    // eslint-disable-next-line no-await-in-loop
    const existed = await prisma.studentPayment.findUnique({
      where: {
        studentId_groupId_year_month_isOpening: {
          studentId: m.studentId,
          groupId: m.groupId,
          year,
          month,
          isOpening: false,
        },
      },
      select: { id: true },
    });
    if (existed) continue;
    // eslint-disable-next-line no-await-in-loop
    await ensurePaymentForMembership(m, year, month);
    created += 1;
  }
  return { memberships: memberships.length, created };
};

// Qarzdorlar: oylik plan bo'yicha qoldig'i (expected - paid) > 0 bo'lgan o'quvchilar.
// month berilmasa - tanlangan yilning BARCHA oylari bo'yicha (har oy alohida qator).
export const obligations = async ({ groupId, year, month }) => {
  // Write-off qilingan (yomon qarz) yozuvlar FAOL qarzdan chiqarib tashlanadi -
  // ular endi undiriladigan qarz emas, alohida "Yomon qarzlar" bo'limida ko'rinadi.
  const where = { year: Number(year), writtenOff: false };
  if (month) where.month = Number(month);
  if (groupId) where.groupId = String(groupId);

  const items = await prisma.studentPayment.findMany({
    where,
    include: {
      student: { select: SAFE_STUDENT_SELECT },
      group: { select: { id: true, name: true } },
    },
    orderBy: [{ month: "asc" }, { createdAt: "desc" }],
  });

  return withLegacyIds(
    items
      .map((p) => ({ ...p, remaining: Math.max(0, p.expectedAmount - p.paidAmount) }))
      .filter((p) => p.remaining > 0),
  );
};

export const list = async ({
  groupId,
  year,
  month,
  status,
  search,
  page = 1,
  limit = 50,
}) => {
  // FILIAL: StudentPayment'da branchId bor (guruhdan meros).
  const where = { ...branchFilter() };
  if (groupId) where.groupId = String(groupId);
  if (year) where.year = Number(year);
  if (month) where.month = Number(month);
  if (status) where.status = status;

  // Ism/username bo'yicha qidiruv - DB darajasida (paginatsiya va total ham
  // qidiruvni hisobga oladi).
  //
  // FARQ (ataylab): Mongo varianti `filter.student` ni qidiruv natijasi bilan
  // BOSIB KETARDI - guruh+qidiruv birga ishlatilsa filtr yo'qolardi. Prisma'da
  // ikkala shart AND bilan birlashadi (kesishma), ya'ni faqat toraytiradi.
  if (search && search.trim()) {
    const q = search.trim();
    where.student = {
      role: "student",
      OR: [
        { firstName: { contains: q, mode: "insensitive" } },
        { lastName: { contains: q, mode: "insensitive" } },
        { username: { contains: q, mode: "insensitive" } },
      ],
    };
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    prisma.studentPayment.findMany({
      where,
      include: {
        student: { select: SAFE_STUDENT_SELECT },
        group: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: "desc" },
      skip,
      take: limit,
    }),
    prisma.studentPayment.count({ where }),
  ]);

  return { items: withLegacyIds(items), total, page, limit };
};

export const getById = async (id) => {
  const payment = await prisma.studentPayment.findUnique({
    where: { id: String(id) },
    include: {
      student: { select: SAFE_STUDENT_SELECT },
      group: { select: { id: true, name: true } },
      membership: { select: { id: true, joinedAt: true } },
    },
  });
  if (!payment) throw new ApiError(404, "To'lov topilmadi");

  const transactions = await prisma.paymentTransaction.findMany({
    where: { paymentId: payment.id, isDeleted: false },
    orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
  });

  return withLegacyId({ ...payment, transactions });
};

// Bitta o'quvchining barcha oylardagi to'lovlari + har biriga tegishli
// tranzaksiyalar (to'lovlar tarixi sahifasi uchun). Eng yangi oy yuqorida.
export const historyByStudent = async (studentId) => {
  const sid = String(studentId);
  // FILIAL: boshqa filial o'quvchisining ismi ham ochilmasin (404 - mavjudligini
  // ham oshkor qilmaymiz). AND ishlatiladi: userBranchCondition o'zi OR beradi.
  const branchCond = userBranchCondition();
  const student = await prisma.user.findFirst({
    where: { id: sid, ...(branchCond ? { AND: [branchCond] } : {}) },
    select: SAFE_STUDENT_SELECT,
  });
  if (!student) throw new ApiError(404, "O'quvchi topilmadi");

  // FILIAL: o'quvchi boshqa filialda ham to'lagan bo'lsa, u yerdagi
  // to'lovlari shu filial ko'rinishiga chiqmasin.
  const payments = await prisma.studentPayment.findMany({
    where: { studentId: sid, ...branchFilter() },
    include: { group: { select: { id: true, name: true } } },
    orderBy: [{ year: "desc" }, { month: "desc" }],
  });

  const ids = payments.map((p) => p.id);
  const txs = ids.length
    ? await prisma.paymentTransaction.findMany({
        where: { paymentId: { in: ids }, isDeleted: false },
        orderBy: [{ paidAt: "desc" }, { createdAt: "desc" }],
      })
    : [];

  const txByPayment = new Map();
  for (const t of txs) {
    const key = String(t.paymentId);
    if (!txByPayment.has(key)) txByPayment.set(key, []);
    txByPayment.get(key).push(t);
  }

  const items = payments.map((p) => ({
    ...p,
    transactions: txByPayment.get(String(p.id)) || [],
  }));

  const totalExpected = items.reduce((s, p) => s + (p.expectedAmount || 0), 0);
  const totalPaid = items.reduce((s, p) => s + (p.paidAmount || 0), 0);

  return {
    student: withLegacyId(student),
    items: withLegacyIds(items),
    summary: {
      months: items.length,
      totalExpected,
      totalPaid,
      totalRemaining: Math.max(0, totalExpected - totalPaid),
    },
  };
};
