import mongoose from "mongoose";
import User from "../../../models/user.model.js";
import Group from "../../../models/group.model.js";
import GroupMembership from "../../../models/groupMembership.model.js";
import StudentPayment from "../../../models/studentPayment.model.js";
import Insight from "../../../models/insight.model.js";
import { AI_ENGINE_VERSION } from "../../../models/aiConfig.model.js";
import { ROLES } from "../../../constants/roles.js";
import { branchMatchStage } from "../../../helpers/branchContext.helper.js";
import { collectStudentSignals } from "../signals/student.signal.js";
import { scoreChurn, churnActions } from "../scoring/churn.scoring.js";
import { scorePaymentRisk, paymentActions } from "../scoring/payment.scoring.js";
import { narrateChurn, narratePaymentRisk } from "./narration.service.js";
import { resolveConfig } from "./aiConfig.service.js";

const DAY_MS = 24 * 60 * 60 * 1000;
// Insight shu muddatdan keyin eskiradi. 14 kun: bir hisob-kitob davri
// ichida ikki marta qayta ko'rib chiqiladi, lekin owner e'tibor bermasa
// abadiy osilib qolmaydi.
const INSIGHT_TTL_DAYS = 14;

/**
 * Prioritet = pul × ehtimol × shoshilinchlik.
 *
 * Action Center TARTIBI shu formuladan chiqadi va bu mahsulotning eng
 * muhim qarori: owner ro'yxatning YUQORISIDAN boshlab ishlaydi, shuning
 * uchun tartib noto'g'ri bo'lsa qolgan hamma narsa bekor.
 *
 * Pul birinchi ko'paytuvchi: 90% xavfli, lekin 200 000 so'mlik o'quvchidan
 * ko'ra 60% xavfli 900 000 so'mlik o'quvchi muhimroq.
 */
const computePriority = ({ amount, score, severity, confidence }) => {
  const urgency = severity === "high" ? 1.5 : severity === "medium" ? 1 : 0.6;
  // Ishonch ham ko'paytuvchi: shubhali insight ro'yxat tepasiga chiqmasligi kerak.
  return Math.round(amount * score * urgency * Math.max(0.3, confidence));
};

/** Filialdagi faol o'quvchilar + guruhlari + joriy oy to'lovi. */
const loadStudents = async (branchId) => {
  const bid = new mongoose.Types.ObjectId(String(branchId));

  // Filialdagi guruhlar → ular orqali a'zoliklar. Foydalanuvchini
  // homeBranchId bo'yicha emas, GURUH bo'yicha olamiz: o'quvchi boshqa
  // filialda ro'yxatdan o'tib, shu filialda o'qiyotgan bo'lishi mumkin,
  // va AI aynan o'qiyotgan joyiga tegishli.
  const groups = await Group.find({ branchId: bid, isDeleted: false })
    .select("_id")
    .lean();
  const groupIds = groups.map((g) => g._id);
  if (!groupIds.length) return [];

  const memberships = await GroupMembership.find({
    group: { $in: groupIds },
    leftAt: null,
    isDeleted: false,
  })
    .select("student group")
    .lean();
  if (!memberships.length) return [];

  const byStudent = new Map();
  for (const m of memberships) {
    const sid = String(m.student);
    if (!byStudent.has(sid)) byStudent.set(sid, []);
    byStudent.get(sid).push(m.group);
  }

  const users = await User.find({
    _id: { $in: [...byStudent.keys()].map((id) => new mongoose.Types.ObjectId(id)) },
    role: ROLES.STUDENT,
    isActive: true,
    isDeleted: false,
    // Bitirganlar hisobga olinmaydi - ular "ketmagan", o'qishni tugatgan.
    completedAt: null,
  })
    .select("_id firstName lastName enrolledAt")
    .lean();

  return users.map((u) => ({
    ...u,
    groupIds: byStudent.get(String(u._id)) || [],
  }));
};

/** Joriy oy uchun har bir o'quvchidan kutilayotgan to'lov (xavf ostidagi pul). */
const loadMonthlyValue = async (studentIds, now) => {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const rows = await StudentPayment.aggregate([
    ...branchMatchStage(),
    {
      $match: {
        student: { $in: studentIds.map((id) => new mongoose.Types.ObjectId(id)) },
        year,
        month,
      },
    },
    { $group: { _id: "$student", amount: { $sum: "$expectedAmount" } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.amount || 0]));
};

/**
 * Insight'ni yaratadi yoki mavjudini yangilaydi.
 *
 * status va acknowledgedBy TEGILMAYDI: owner "ko'rdim" deb belgilagan
 * insight tungi qayta hisoblashdan keyin yana "open" ga qaytmasligi kerak -
 * aks holda Action Center har kuni ertalab bir xil vazifani qayta
 * ko'rsatadi va owner ro'yxatga ishonishni to'xtatadi.
 */
const upsertInsight = async (doc) => {
  const existing = await Insight.findOne({
    subjectType: doc.subjectType,
    subjectId: doc.subjectId,
    kind: doc.kind,
    status: { $in: ["open", "acked"] },
  });

  if (existing) {
    Object.assign(existing, doc);
    await existing.save();
    return "updated";
  }
  await Insight.create(doc);
  return "created";
};

/**
 * Endi xavfli bo'lmagan subyektlarning ochiq insight'larini yopadi.
 *
 * outcome="prevented": bashorat qilingan hodisa SODIR BO'LMADI. Yopiq
 * halqaning boshlanishi - "sizga aytgan 12 tadan 9 tasi qoldi" degan
 * hisobot aynan shu maydondan chiqadi va ishonchni qaytaradigan yagona
 * narsa shu.
 */
const closeStale = async (branchId, kind, stillRisky, now) => {
  const closable = await Insight.find({
    branchId,
    kind,
    status: { $in: ["open", "acked"] },
    subjectId: {
      $nin: [...stillRisky].map((id) => new mongoose.Types.ObjectId(id)),
    },
  }).select("_id");

  if (!closable.length) return 0;
  await Insight.updateMany(
    { _id: { $in: closable.map((d) => d._id) } },
    {
      $set: {
        status: "done",
        resolvedAt: now,
        outcome: "prevented",
        outcomeCheckedAt: now,
      },
    },
  );
  return closable.length;
};

/** Faktorlar ortidagi haqiqiy hujjatlar - "Ishingni ko'rsat" havolalari. */
const buildSourceRefs = (sid, signals, kinds) => {
  const refs = [];
  if (kinds.includes("attendance") && signals.attendance.absentIds?.length) {
    refs.push({
      model: "Attendance",
      ids: signals.attendance.absentIds,
      total: signals.attendance.absentIds.length,
      href: `/owner/attendance?studentId=${sid}`,
    });
  }
  if (kinds.includes("grade") && signals.grades.ids?.length) {
    refs.push({
      model: "Grade",
      ids: signals.grades.ids,
      total: signals.grades.ids.length,
      href: `/owner/grades?studentId=${sid}`,
    });
  }
  if (kinds.includes("payment") && signals.debt.ids?.length) {
    refs.push({
      model: "StudentPayment",
      ids: signals.debt.ids,
      total: signals.debt.ids.length,
      href: `/owner/students/${sid}?tab=finance`,
    });
  }
  return refs;
};

/**
 * Bitta filial uchun o'quvchi insight'larini qayta hisoblaydi:
 * ketish xavfi (churn) VA to'lov xavfi.
 *
 * MUHIM: chaqiruvchi buni runWithBranchContext() ichida ishga tushirishi
 * SHART - aks holda branchMatchStage() bo'sh qaytadi va boshqa filial
 * ma'lumoti aralashadi.
 *
 * @param {string} branchId
 * @returns {Promise<object>} churn va payment bo'yicha statistika
 */
export const recomputeStudentInsights = async (branchId, now = new Date()) => {
  const config = await resolveConfig(branchId);
  const students = await loadStudents(branchId);

  const mkStats = () => ({ created: 0, updated: 0, closed: 0, skippedLowConfidence: 0 });
  const stats = {
    scanned: students.length,
    churn: mkStats(),
    payment: mkStats(),
  };
  if (!students.length) return stats;

  const ids = students.map((s) => String(s._id));
  const [signalsMap, valueMap] = await Promise.all([
    collectStudentSignals(students, now),
    loadMonthlyValue(ids, now),
  ]);

  const expiresAt = new Date(now.getTime() + INSIGHT_TTL_DAYS * DAY_MS);
  const riskyChurn = new Set();
  const riskyPayment = new Set();

  const fmt = (n) => new Intl.NumberFormat("uz-UZ").format(Math.round(n));

  for (const student of students) {
    const sid = String(student._id);
    const signals = signalsMap.get(sid);
    if (!signals) continue;

    const amount = valueMap.get(sid) || 0;
    const subjectLabel = `${student.firstName} ${student.lastName}`.trim();
    const base = {
      branchId,
      subjectType: "student",
      subjectId: student._id,
      subjectLabel,
      narrationModel: null,
      engineVersion: AI_ENGINE_VERSION,
      generatedAt: now,
      expiresAt,
    };

    // --- 1. KETISH XAVFI ---
    const churn = scoreChurn(signals, config);

    // ISHONCH FILTRI: sayoz ma'lumot ustida ishonchli ko'rinadigan raqam
    // chiqarish - eng katta mahsulot xavfi. Past ishonchli insight umuman
    // YARATILMAYDI (UI da yashirilmaydi - bu ikki xil narsa: yaratilmagan
    // insight Action Center hisobini ham shishirmaydi).
    if (churn.confidence < config.confidenceFloor) {
      stats.churn.skippedLowConfidence += 1;
    } else if (churn.severity !== "low") {
      // Past xavf insight yaratmaydi - shovqin bo'lardi.
      riskyChurn.add(sid);
      const expectedImpact = {
        amount,
        currency: "UZS",
        label: amount ? `Oyiga ${fmt(amount)} so'm xavf ostida` : "",
      };
      const res = await upsertInsight({
        ...base,
        kind: "student_churn_risk",
        severity: churn.severity,
        score: churn.score,
        confidence: churn.confidence,
        factors: churn.factors,
        sourceRefs: buildSourceRefs(sid, signals, ["attendance", "grade", "payment"]),
        recommendedActions: churnActions(churn.factors, {
          debtAmount: signals.debt.debtAmount,
        }),
        expectedImpact,
        priority: computePriority({
          amount,
          score: churn.score,
          severity: churn.severity,
          confidence: churn.confidence,
        }),
        narration: narrateChurn({
          subjectLabel,
          ...churn,
          expectedImpact,
        }),
      });
      stats.churn[res] += 1;
    }

    // --- 2. TO'LOV XAVFI (churn'dan MUSTAQIL) ---
    // Muntazam qatnaydigan, lekin doim kechikib to'laydigan o'quvchi
    // yuqoridagi churn filtridan o'tmaydi - lekin pul oqimi uchun muhim.
    const payment = scorePaymentRisk(signals, config);

    if (payment.confidence < config.confidenceFloor) {
      stats.payment.skippedLowConfidence += 1;
    } else if (payment.severity !== "low") {
      riskyPayment.add(sid);
      // Bu yerda xavf ostidagi pul = KUTILAYOTGAN QARZ (mavjud qarz +
      // joriy oy to'lovi), ketish yo'qotishi emas.
      const atRisk = (signals.debt.debtAmount || 0) + amount;
      const expectedImpact = {
        amount: atRisk,
        currency: "UZS",
        label: atRisk ? `Kutilayotgan qarz: ${fmt(atRisk)} so'm` : "",
      };
      const res = await upsertInsight({
        ...base,
        kind: "payment_risk",
        severity: payment.severity,
        score: payment.score,
        confidence: payment.confidence,
        factors: payment.factors,
        sourceRefs: buildSourceRefs(sid, signals, ["payment"]),
        recommendedActions: paymentActions(payment.factors, {
          debtAmount: signals.debt.debtAmount,
          debtDays: signals.debt.debtDays,
        }),
        expectedImpact,
        priority: computePriority({
          amount: atRisk,
          score: payment.score,
          severity: payment.severity,
          confidence: payment.confidence,
        }),
        narration: narratePaymentRisk({
          subjectLabel,
          score: payment.score,
          factors: payment.factors,
          expectedImpact,
        }),
      });
      stats.payment[res] += 1;
    }
  }

  stats.churn.closed = await closeStale(branchId, "student_churn_risk", riskyChurn, now);
  stats.payment.closed = await closeStale(branchId, "payment_risk", riskyPayment, now);

  return stats;
};
