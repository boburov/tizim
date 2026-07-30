import mongoose from "mongoose";
import Insight from "../../../models/insight.model.js";
import GroupMembership from "../../../models/groupMembership.model.js";
import StudentPayment from "../../../models/studentPayment.model.js";
import logger from "../../../config/logger.js";

// INSIGHT HAYOT SIKLI - "bajarilganlarni avtomatik arxivlash" talabi.
//
// Uchta ish, hammasi FILIALDAN QAT'IY NAZAR (global job): bu texnik
// tozalash, biznes tahlili emas, shuning uchun branch konteksti kerak emas
// va har filial uchun alohida ishga tushirish keraksiz yuklama bo'lardi.
//
//   1. EXPIRE   - muddati o'tgan ochiq insight'lar yopiladi
//   2. OUTCOME  - yopilgan bashoratlarning NATIJASI aniqlanadi
//   3. PRUNE    - juda eski yopiq insight'lar o'chiriladi
//
// Ikkinchisi eng muhimi: bashorat qilgan tizim o'z bashoratining
// natijasini o'lchamasa, u shunchaki fikr generatori bo'lib qoladi.

const DAY_MS = 24 * 60 * 60 * 1000;

// Natijani baholash uchun kutish muddati. 30 kun: o'quvchi ketishi
// odatda oy oxirida (to'lov davri bilan) rasmiylashadi, shuning uchun
// undan qisqa oyna "hali ketmadi" degan yolg'on ijobiy natija berardi.
const OUTCOME_WINDOW_DAYS = 30;

// Yopiq insight'lar shu muddatdan keyin o'chiriladi. 1 yil: yillik
// taqqoslash uchun yetarli, lekin kolleksiya cheksiz o'smaydi.
const PRUNE_AFTER_DAYS = 365;

/**
 * 1. MUDDATI O'TGANLARNI YOPISH.
 *
 * outcome "unknown" qoladi, "prevented" EMAS: owner e'tibor bermagan
 * insight uchun "xavf oldi olindi" deb yozish yopiq halqa statistikasini
 * yolg'on qilardi. Biz nima bo'lganini BILMAYMIZ - va shunday deyish
 * to'g'ri javob.
 */
export const expireStale = async (now = new Date()) => {
  const res = await Insight.updateMany(
    {
      status: { $in: ["open", "acked"] },
      expiresAt: { $ne: null, $lt: now },
    },
    {
      $set: {
        status: "expired",
        resolvedAt: now,
        outcome: "unknown",
        outcomeCheckedAt: now,
      },
    },
  );
  return res.modifiedCount || 0;
};

/**
 * 2. NATIJANI ANIQLASH - yopiq halqa.
 *
 * Har bir insight turi uchun "bashorat amalga oshdimi" savolining
 * O'Z ta'rifi bor:
 *
 *   student_churn_risk → o'quvchi haqiqatan guruhdan chiqarildimi
 *                        (GroupMembership.leftReason = "removed")
 *   payment_risk       → qarz hali ham to'lanmaganmi
 *
 * Boshqa turlar (filial/kurs darajasidagi trendlar) uchun avtomatik
 * o'lchov ATAYLAB qilinmaydi: "daromad bashorati to'g'ri chiqdimi"
 * savoliga javob berish uchun bashoratni haqiqiy natija bilan
 * taqqoslash kerak, va bu alohida hisobot mavzusi. Ularni taxminiy
 * baholash statistikani buzardi.
 */
export const evaluateOutcomes = async (now = new Date()) => {
  const cutoff = new Date(now.getTime() - OUTCOME_WINDOW_DAYS * DAY_MS);

  const pending = await Insight.find({
    status: { $in: ["done", "dismissed", "expired"] },
    outcome: "pending",
    resolvedAt: { $ne: null, $lt: cutoff },
    kind: { $in: ["student_churn_risk", "payment_risk"] },
  })
    .select("_id kind subjectId resolvedAt")
    .limit(500)
    .lean();

  if (!pending.length) return { checked: 0, occurred: 0, prevented: 0 };

  const churn = pending.filter((i) => i.kind === "student_churn_risk");
  const payment = pending.filter((i) => i.kind === "payment_risk");

  const occurredIds = new Set();

  // --- CHURN: insight yopilgandan keyin o'quvchi chiqarilganmi ---
  if (churn.length) {
    const ids = churn.map((i) => new mongoose.Types.ObjectId(String(i.subjectId)));
    const left = await GroupMembership.find({
      student: { $in: ids },
      leftReason: "removed",
      leftAt: { $ne: null },
      isDeleted: false,
    })
      .select("student leftAt")
      .lean();

    const leftByStudent = new Map();
    for (const m of left) {
      const sid = String(m.student);
      const prev = leftByStudent.get(sid);
      if (!prev || m.leftAt > prev) leftByStudent.set(sid, m.leftAt);
    }

    for (const insight of churn) {
      const leftAt = leftByStudent.get(String(insight.subjectId));
      // Insight YARATILGANDAN KEYIN ketgan bo'lishi kerak. Undan oldin
      // ketgan bo'lsa - bu bashoratning natijasi emas, boshqa hodisa
      // (mas. o'quvchi boshqa guruhdan ancha oldin chiqqan).
      if (leftAt && new Date(leftAt) >= new Date(insight.resolvedAt)) {
        occurredIds.add(String(insight._id));
      }
    }
  }

  // --- PAYMENT: qarz hali ham faolmi ---
  if (payment.length) {
    const ids = payment.map((i) => new mongoose.Types.ObjectId(String(i.subjectId)));
    const stillOwing = await StudentPayment.aggregate([
      {
        $match: {
          student: { $in: ids },
          writtenOff: false,
          status: { $in: ["unpaid", "partial"] },
          $expr: { $gt: ["$expectedAmount", "$paidAmount"] },
        },
      },
      { $group: { _id: "$student" } },
    ]);
    const owing = new Set(stillOwing.map((r) => String(r._id)));
    for (const insight of payment) {
      if (owing.has(String(insight.subjectId))) occurredIds.add(String(insight._id));
    }
  }

  const occurred = [...occurredIds];
  const prevented = pending
    .filter((i) => !occurredIds.has(String(i._id)))
    .map((i) => i._id);

  await Promise.all([
    occurred.length
      ? Insight.updateMany(
          { _id: { $in: occurred.map((id) => new mongoose.Types.ObjectId(id)) } },
          { $set: { outcome: "occurred", outcomeCheckedAt: now } },
        )
      : null,
    prevented.length
      ? Insight.updateMany(
          { _id: { $in: prevented } },
          { $set: { outcome: "prevented", outcomeCheckedAt: now } },
        )
      : null,
  ]);

  return {
    checked: pending.length,
    occurred: occurred.length,
    prevented: prevented.length,
  };
};

/**
 * 3. ESKI YOPIQ INSIGHT'LARNI O'CHIRISH.
 *
 * "dismissed" yozuvlar SAQLANADI (o'chirilmaydi): owner "bu noto'g'ri"
 * degan har bir holat modelni kalibrlash uchun eng qimmatli signal va
 * uni yo'qotish - o'rganish imkonini yo'qotish.
 */
export const pruneOld = async (now = new Date()) => {
  const cutoff = new Date(now.getTime() - PRUNE_AFTER_DAYS * DAY_MS);
  const res = await Insight.deleteMany({
    status: { $in: ["done", "expired"] },
    resolvedAt: { $ne: null, $lt: cutoff },
    outcome: { $ne: "pending" },
  });
  return res.deletedCount || 0;
};

/** Uchala ishni ketma-ket bajaradi. */
export const runLifecycle = async (now = new Date()) => {
  const expired = await expireStale(now);
  const outcomes = await evaluateOutcomes(now);
  const pruned = await pruneOld(now);

  logger.info({ expired, ...outcomes, pruned }, "AI insight hayot sikli");
  return { expired, outcomes, pruned };
};

export { OUTCOME_WINDOW_DAYS, PRUNE_AFTER_DAYS };
