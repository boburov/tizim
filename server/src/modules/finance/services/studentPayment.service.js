import mongoose from "mongoose";
import StudentPayment from "../../../models/studentPayment.model.js";
import PaymentTransaction from "../../../models/paymentTransaction.model.js";
import GroupFee from "../../../models/groupFee.model.js";
import Discount from "../../../models/discount.model.js";
import GroupMembership from "../../../models/groupMembership.model.js";
import Group from "../../../models/group.model.js";
import User from "../../../models/user.model.js";
import DebtWriteOff from "../../../models/debtWriteOff.model.js";
import ApiError from "../../../utils/ApiError.js";
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
import {
  loadFreezeWindows,
  isFrozenOn,
} from "../../../helpers/studentFreeze.helper.js";

const safeStudentProjection = {
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

// Oy oralig'iga tegishli o'quvchi+guruh a'zolik davrlarini yuklaydi.
// Rejoin (bir oyda ketib qayta qo'shilish) bo'lsa bir nechta davr qaytadi -
// proratsiya har birini alohida sanab kunlarni qo'shadi.
const loadMembershipPeriods = async (student, group, year, month) => {
  const monthEnd = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const rows = await GroupMembership.find(
    {
      student,
      group,
      isDeleted: { $ne: true },
      joinedAt: { $lte: monthEnd },
      $or: [{ leftAt: null }, { leftAt: { $gt: monthStart } }],
    },
    { joinedAt: 1, leftAt: 1 },
  ).lean();
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
  const holidaySet = await holidayKeySetForRange(monthStart, monthEnd);
  return getClassDaysInRange(groupDoc, monthStart, monthEnd, holidaySet).map(
    (s) => toUtcMidnight(s.date),
  );
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
  const [feeDoc, discounts, groupDoc, freezeWindows] = await Promise.all([
    GroupFee.findOne({ group, year, month }),
    Discount.find({
      student,
      group,
      isActive: true,
      isDeleted: { $ne: true },
      $or: [{ scope: "permanent" }, { scope: "monthly", year, month }],
    }),
    Group.findById(group, { schedule: 1, startDate: 1, endDate: 1 }).lean(),
    // Muzlatish o'quvchi darajasida (barcha guruhlarga taalluqli).
    loadFreezeWindows({ student }),
  ]);

  const baseFee = feeDoc ? feeDoc.amount : 0;
  const effPeriods = periods === null ? [{ joinedAt, leftAt }] : periods;

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
      joinedAt,
      leftAt,
      periods,
      discounts,
      freezeWindows,
    });
    return { ...snap, fullExpectedAmount: snap.expectedAmount };
  }

  const monthEnd = new Date(Date.UTC(year, month, 0));

  // TO'LIQ-OY billing: qarz oy boshidanoq to'liq oylik summaga teng - kunlik/dars
  // asosida o'smaydi. Shu oyda a'zolikka to'g'ri keladigan BARCHA darslar
  // (asOf = oy oxiri, muzlatilganlaridan tashqari) sanaladi. Oy o'rtasida
  // qo'shilgan o'quvchi faqat qolgan darslar uchun to'laydi; chiqib ketsa -
  // keyingi recalc qarzni haqiqiy a'zolik davriga qarab kamaytiradi.
  const totalLessons = lessonDates.length;
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

// paidAmount ifodasidan status'ni hisoblaydigan update-pipeline $set bosqichi.
// Atomik yoziladi - "o'qi → hisobla → save" oralig'idagi poyga (lost update) yo'q.
const paidStatusStage = (newPaidExpr) => ({
  $set: {
    paidAmount: newPaidExpr,
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

// paidAmount ni atomik delta bilan o'zgartiradi ($inc semantikasi) va statusni
// shu yozuvning DB'dagi joriy qiymatlaridan keltirib chiqaradi. Parallel
// tranzaksiyalar kommutativ qo'shiladi - hech biri yo'qolmaydi.
// capToRemaining=true bo'lsa: yangi paidAmount expectedAmount dan oshadigan bo'lsa
// hujjat YANGILANMAYDI (null qaytadi) - plan qoldig'idan ortiq to'lovni shartli-atomik
// to'sish (parallel double-click ham capdan o'tmaydi).
// session berilsa, yozuv shu MongoDB tranzaksiyasi ichida bajariladi (to'lov
// qabul qilish/bekor qilishda PaymentTransaction bilan birga atomik bo'lsin).
export const applyPaidDelta = async (
  paymentId,
  delta,
  { session, capToRemaining = false } = {},
) => {
  const newPaid = { $add: [{ $ifNull: ["$paidAmount", 0] }, delta] };
  const filter = { _id: paymentId };
  if (capToRemaining) filter.$expr = { $lte: [newPaid, "$expectedAmount"] };
  return StudentPayment.findOneAndUpdate(filter, [paidStatusStage(newPaid)], {
    new: true,
    session: session || undefined,
  });
};

// Faol (o'chirilmagan) tranzaksiyalar yig'indisidan paidAmount/status ni tiklaydi
// (repair/recalc yo'li). Yozish atomik pipeline orqali - stale save yo'q.
export const recalcStatus = async (paymentId) => {
  const payment = await StudentPayment.findById(paymentId);
  if (!payment) return null;
  const agg = await PaymentTransaction.aggregate([
    { $match: { payment: payment._id, isDeleted: { $ne: true } } },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);
  const paidAmount = agg.length ? agg[0].total : 0;
  return StudentPayment.findByIdAndUpdate(paymentId, [paidStatusStage(paidAmount)], {
    new: true,
  });
};

// Snapshot (fee/proratsiya/chegirma) ni qayta hisoblab, statusni ham yangilaydi.
// Yozish atomik pipeline orqali: status DB'dagi JORIY paidAmount'dan keltirib
// chiqariladi - hisob davomida kelib tushgan parallel to'lov statusni buzmaydi.
// session berilsa, ochiq MongoDB tranzaksiyasi ichida o'qib-yozadi.
export const recalc = async (paymentId, { session } = {}) => {
  const payment = await StudentPayment.findById(paymentId).session(session || null);
  if (!payment) return null;

  // Yomon qarz (write-off) MUZLATILGAN: expected/status qayta hisoblanmaydi,
  // aks holda kunlik accrual recalc yopilgan qarzni qayta ochib yuborardi.
  if (payment.writtenOff) return payment;

  // Shu oydagi BARCHA a'zolik davrlari (rejoin holatida bir nechta) bo'yicha
  // hisoblaymiz - bitta membership ref'iga tayanib qolmaymiz, aks holda
  // ketib-qaytgan o'quvchining ikkinchi davri billing'dan tushib qolardi.
  const periods = await loadMembershipPeriods(
    payment.student,
    payment.group,
    payment.year,
    payment.month,
  );

  const snap = await buildSnapshot({
    student: payment.student,
    group: payment.group,
    year: payment.year,
    month: payment.month,
    // Har doim haqiqiy davrlar massivini uzatamiz: bo'sh bo'lsa (o'quvchi shu oyda
    // guruhda yo'q) expected=0 bo'ladi - to'liq oy billing'iga default qilmaymiz.
    periods,
  });

  const paidExpr = { $ifNull: ["$paidAmount", 0] };
  const updated = await StudentPayment.findByIdAndUpdate(
    paymentId,
    [
      {
        $set: {
          baseFee: snap.baseFee,
          prorationFactor: snap.prorationFactor,
          discountApplied: snap.discountApplied,
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
          recalculatedAt: new Date(),
        },
      },
    ],
    { new: true, session: session || undefined },
  );

  // Ortiqcha to'lovni depozitga qaytarish. MUHIM: taqqoslash accrued expected'ga
  // emas, TO'LIQ-OY obligatsiyasiga (fullExpectedAmount) nisbatan - shunda dars-asosli
  // accrual paytida avans (oldindan to'lov) har kuni depozitga ko'chib ketmaydi;
  // faqat butun oy narxidan ORTIQ to'langan qism qaytadi. Faqat sessiyasiz
  // (recompute kaskadi) - yaratish (session) oqimida emas.
  // Dinamik import: deposit.service → studentPayment.service siklini oldini oladi.
  const fullExpected = snap.fullExpectedAmount ?? snap.expectedAmount;
  if (!session && updated && (updated.paidAmount || 0) > fullExpected) {
    try {
      const depositService = await import("../../deposits/services/deposit.service.js");
      await depositService.reconcileDepositOverpay(updated._id, {
        capAmount: fullExpected,
      });
    } catch (err) {
      logger.warn({ err }, "Depozit ortiqcha qoplama qayta hisoblanmadi");
    }
  }
  return updated;
};

// Guruh+oy bo'yicha barcha to'lovlarni qayta hisoblaydi (fee o'zgarganda).
export const recalcForGroupMonth = async (group, year, month) => {
  const payments = await StudentPayment.find({ group, year, month }, { _id: 1 });
  for (const p of payments) {
    await recalc(p._id);
  }
  return payments.length;
};

// O'quvchi+guruh chegirmasi o'zgarganda tegishli oylarni qayta hisoblaydi.
// monthly chegirma → faqat shu oy; permanent → barcha mavjud oylar.
export const recalcForStudentScope = async (student, group, { scope, year, month } = {}) => {
  const filter = { student, group };
  if (scope === "monthly" && year && month) {
    filter.year = year;
    filter.month = month;
  }
  const payments = await StudentPayment.find(filter, { _id: 1 });
  for (const p of payments) {
    await recalc(p._id);
  }
  return payments.length;
};

// Berilgan (year,month) chegarasidan OLDINGI oylarda o'quvchining shu guruhda
// to'lov qilingan (paidAmount > 0) yozuvi bormi - eng erta to'langan oyni qaytaradi
// ({year, month}) yoki null. joinedAt'ni oldinga surishni qulflashda ishlatiladi:
// to'langan davrni "men keyinroq qo'shilganman" deb o'chirib bo'lmaydi.
export const earliestPaidMonthBefore = async (student, group, { year, month }) => {
  const beforeIdx = year * 12 + (month - 1);
  const paid = await StudentPayment.find(
    { student, group, paidAmount: { $gt: 0 } },
    { year: 1, month: 1 },
  ).lean();
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
  const payments = await StudentPayment.find({ student }, { _id: 1 });
  for (const p of payments) {
    await recalc(p._id);
  }
  return payments.length;
};

// Berilgan oydagi barcha to'lovlarni qayta hisoblaydi - dars-asosli accrual'ni
// bir kunga oldinga suradi (o'tib bo'lgan yangi dars(lar) qarzga qo'shiladi).
// Kunlik job chaqiradi. Bitta yozuvdagi xato butun jarayonni to'xtatmaydi.
export const accrueMonth = async (year, month) => {
  const payments = await StudentPayment.find(
    { year, month, isDeleted: { $ne: true } },
    { _id: 1 },
  );
  let recalculated = 0;
  for (const p of payments) {
    try {
      await recalc(p._id);
      recalculated += 1;
    } catch (err) {
      logger.warn({ err, payment: p._id }, "Kunlik accrual recalc xatosi");
    }
  }
  return { total: payments.length, recalculated };
};

// O'quvchining shu guruhda FAOL qarzi (biror oyda expected>paid, write-off
// qilinmagan) bormi. Hisobdan chiqarilgan (writtenOff) qarz faol qarz emas.
export const hasOutstandingDebtInGroup = async (student, group) =>
  Boolean(
    await StudentPayment.exists({
      student,
      group,
      isDeleted: { $ne: true },
      writtenOff: { $ne: true },
      $expr: { $gt: ["$expectedAmount", "$paidAmount"] },
    }),
  );

// O'quvchining shu guruhdagi FAOL qarzini oy-ma-oy taqsimlab qaytaradi:
// { total, items:[{ paymentId, year, month, amount }] }. Write-off qilinganlar
// chiqarib tashlanadi. Chiqarish modalidagi summa va write-off shu funksiyaga tayanadi.
export const getOutstandingBreakdownInGroup = async (student, group) => {
  const payments = await StudentPayment.find(
    {
      student,
      group,
      isDeleted: { $ne: true },
      writtenOff: { $ne: true },
      $expr: { $gt: ["$expectedAmount", "$paidAmount"] },
    },
    { year: 1, month: 1, expectedAmount: 1, paidAmount: 1 },
  ).sort({ year: 1, month: 1 });

  const items = payments.map((p) => ({
    paymentId: p._id,
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
  const { total, items } = await getOutstandingBreakdownInGroup(student, group);
  if (total <= 0) return null;

  const now = new Date();
  await Promise.all(
    items.map((it) =>
      StudentPayment.updateOne(
        { _id: it.paymentId },
        { $set: { writtenOff: true, writeOffAmount: it.amount, writeOffAt: now } },
      ),
    ),
  );

  const [studentDoc, groupDoc] = await Promise.all([
    User.findById(student, { firstName: 1, lastName: 1 }).lean(),
    Group.findById(group, { name: 1 }).lean(),
  ]);
  const studentName = studentDoc
    ? `${studentDoc.firstName || ""} ${studentDoc.lastName || ""}`.trim()
    : "";

  const writeOff = await DebtWriteOff.create({
    student,
    group,
    membership: membershipId,
    amount: total,
    breakdown: items.map((it) => ({
      payment: it.paymentId,
      year: it.year,
      month: it.month,
      amount: it.amount,
    })),
    reasonTitle: reasonTitle || "",
    studentName,
    groupName: groupDoc?.name || "",
    createdBy: currentUser?._id || null,
  });

  return { amount: total, writeOff };
};

// Bitta a'zolik uchun (o'quvchi guruhga qo'shilganda) shu oy to'lovini yaratadi.
// session berilsa, ochiq MongoDB tranzaksiyasi ichida o'qib-yozadi (avans spill
// paytida PaymentTransaction bilan birga atomik bo'lsin).
export const ensurePaymentForMembership = async (membership, year, month, { session } = {}) => {
  if (!membership) return null;
  const exists = await StudentPayment.findOne({
    student: membership.student,
    group: membership.group,
    year,
    month,
  }).session(session || null);
  if (exists) {
    // Rejoin: shu oyda to'lov allaqachon bor (eski a'zolikniki). Uni joriy
    // a'zolikka ulab, barcha davrlar bo'yicha qayta hisoblaymiz - aks holda
    // yangi davr kunlari billing'ga kirmay qolardi.
    if (String(exists.membership) !== String(membership._id)) {
      exists.membership = membership._id;
      await exists.save({ session: session || undefined });
    }
    return recalc(exists._id, { session });
  }

  const snap = await buildSnapshot({
    student: membership.student,
    group: membership.group,
    year,
    month,
    joinedAt: membership.joinedAt,
    leftAt: membership.leftAt || null,
  });

  try {
    const docs = await StudentPayment.create(
      [
        {
          student: membership.student,
          group: membership.group,
          membership: membership._id,
          year,
          month,
          ...snap,
          paidAmount: 0,
          status: deriveStatus(0, snap.expectedAmount),
          recalculatedAt: new Date(),
        },
      ],
      { session: session || undefined },
    );
    return docs[0];
  } catch (err) {
    // Unique index poyga holati (parallel generatsiya) - mavjudni qaytaramiz
    if (err?.code === 11000) {
      return StudentPayment.findOne({
        student: membership.student,
        group: membership.group,
        year,
        month,
      }).session(session || null);
    }
    throw err;
  }
};

// Berilgan oy uchun barcha faol a'zoliklarga to'lov yaratadi (job + regenerate).
export const generateMonth = async (year, month) => {
  const activeGroupIds = await Group.find(
    { isActive: true, isDeleted: { $ne: true } },
    { _id: 1 },
  );
  const ids = activeGroupIds.map((g) => g._id);

  // Faol a'zolar + shu OY ICHIDA ketganlar (leftAt exclusive: oy boshidan keyin
  // ketgan bo'lsa, oy boshida hali a'zo edi - prorated to'lov yozuvi tegishli).
  // Aks holda kechiktirilgan regenerate oy o'rtasida ketganlarning haqini tashlab ketardi.
  const monthStart = new Date(Date.UTC(year, month - 1, 1));
  const memberships = await GroupMembership.find({
    group: { $in: ids },
    isDeleted: { $ne: true },
    $or: [{ leftAt: null }, { leftAt: { $gt: monthStart } }],
  });

  let created = 0;
  for (const m of memberships) {
    const existed = await StudentPayment.findOne({
      student: m.student,
      group: m.group,
      year,
      month,
    });
    if (existed) continue;
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
  const filter = {
    year: Number(year),
    isDeleted: { $ne: true },
    writtenOff: { $ne: true },
  };
  if (month) filter.month = Number(month);
  if (groupId) filter.group = toObjectId(groupId);

  const items = await StudentPayment.find(filter)
    .populate("student", safeStudentProjection)
    .populate("group", { name: 1 })
    .sort({ month: 1, createdAt: -1 });

  return items
    .map((p) => ({ ...p.toJSON(), remaining: Math.max(0, p.expectedAmount - p.paidAmount) }))
    .filter((p) => p.remaining > 0);
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
  const filter = { isDeleted: { $ne: true } };
  if (groupId) filter.group = toObjectId(groupId);
  if (year) filter.year = Number(year);
  if (month) filter.month = Number(month);
  if (status) filter.status = status;

  // Ism/username bo'yicha qidiruv: mos o'quvchilarni topib, filtrga qo'shamiz.
  // Bu paginatsiya (skip/limit) va total ham qidiruvni hisobga olishini ta'minlaydi.
  if (search && search.trim()) {
    const s = search.trim();
    const rx = new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
    const matchedStudents = await User.find(
      {
        role: "student",
        $or: [{ firstName: rx }, { lastName: rx }, { username: rx }],
      },
      { _id: 1 },
    );
    filter.student = { $in: matchedStudents.map((u) => u._id) };
  }

  const skip = (page - 1) * limit;
  const [items, total] = await Promise.all([
    StudentPayment.find(filter)
      .populate("student", safeStudentProjection)
      .populate("group", { name: 1 })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit),
    StudentPayment.countDocuments(filter),
  ]);

  return { items, total, page, limit };
};

export const getById = async (id) => {
  const payment = await StudentPayment.findById(id)
    .populate("student", safeStudentProjection)
    .populate("group", { name: 1 })
    .populate("membership", { joinedAt: 1 });
  if (!payment) throw new ApiError(404, "To'lov topilmadi");

  const transactions = await PaymentTransaction.find({
    payment: payment._id,
    isDeleted: { $ne: true },
  }).sort({ paidAt: -1, createdAt: -1 });

  return { ...payment.toJSON(), transactions };
};

// Bitta o'quvchining barcha oylardagi to'lovlari + har biriga tegishli
// tranzaksiyalar (to'lovlar tarixi sahifasi uchun). Eng yangi oy yuqorida.
export const historyByStudent = async (studentId) => {
  const sid = toObjectId(studentId);
  const student = await User.findById(sid, safeStudentProjection).lean();
  if (!student) throw new ApiError(404, "O'quvchi topilmadi");

  const payments = await StudentPayment.find({ student: sid, isDeleted: { $ne: true } })
    .populate("group", { name: 1 })
    .sort({ year: -1, month: -1 })
    .lean();

  const ids = payments.map((p) => p._id);
  const txs = ids.length
    ? await PaymentTransaction.find({
        payment: { $in: ids },
        isDeleted: { $ne: true },
      })
        .sort({ paidAt: -1, createdAt: -1 })
        .lean()
    : [];

  const txByPayment = new Map();
  for (const t of txs) {
    const key = String(t.payment);
    if (!txByPayment.has(key)) txByPayment.set(key, []);
    txByPayment.get(key).push(t);
  }

  const items = payments.map((p) => ({
    ...p,
    transactions: txByPayment.get(String(p._id)) || [],
  }));

  const totalExpected = items.reduce((s, p) => s + (p.expectedAmount || 0), 0);
  const totalPaid = items.reduce((s, p) => s + (p.paidAmount || 0), 0);

  return {
    student,
    items,
    summary: {
      months: items.length,
      totalExpected,
      totalPaid,
      totalRemaining: Math.max(0, totalExpected - totalPaid),
    },
  };
};
