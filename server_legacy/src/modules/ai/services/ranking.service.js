import prisma from "../../../config/prisma.js";
import { ROLES } from "../../../constants/roles.js";
import { branchMatchStage } from "../../../helpers/branchContext.helper.js";
import { collectStudentSignals } from "../signals/student.signal.js";
import { collectTeacherSignals } from "../signals/teacher.signal.js";
import { scorePaymentRisk } from "../scoring/payment.scoring.js";
import { scoreChurn } from "../scoring/churn.scoring.js";
import { scoreTeacher, qualifiesForRaise } from "../scoring/teacher.scoring.js";
import { sampleConfidence } from "../scoring/common.scoring.js";
import { resolveConfig } from "./aiConfig.service.js";
import { fmtMoney } from "./insightWriter.service.js";
import { subjectHref } from "./subjectLink.service.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LIMIT = 10;
export const RANKING_TYPES = ["payment_delay", "absence", "teacher"];

const clamp01 = (v) => Math.max(0, Math.min(1, v));

const loadStudents = async (branchId) => {
  const groups = await prisma.group.findMany({
    where: { branchId: String(branchId), isDeleted: false },
    select: { id: true },
  });
  const groupIds = groups.map((g) => g.id);
  if (!groupIds.length) return [];

  const memberships = await prisma.groupMembership.findMany({
    where: { groupId: { in: groupIds }, leftAt: null, isDeleted: false },
    select: { studentId: true, groupId: true },
  });
  if (!memberships.length) return [];

  const byStudent = new Map();
  for (const m of memberships) {
    const sid = String(m.studentId);
    if (!byStudent.has(sid)) byStudent.set(sid, []);
    byStudent.get(sid).push(m.groupId);
  }

  const users = await prisma.user.findMany({
    where: {
      id: { in: [...byStudent.keys()] },
      role: ROLES.STUDENT,
      isActive: true,
      isDeleted: false,
      completedAt: null,
    },
    select: { id: true, firstName: true, lastName: true, enrolledAt: true },
  });

  return users.map((u) => ({
    ...u,
    _id: u.id,
    groupIds: byStudent.get(String(u.id)) || [],
  }));
};

const nameOf = (u) => `${u.firstName || ""} ${u.lastName || ""}`.trim() || "Noma'lum";

const paymentDelayIndex = ({ discipline, debt }) => {
  const ratio = clamp01(discipline.lateRatio || 0);
  const avgDays = clamp01((discipline.avgLateDays || 0) / 30);
  const debtDays = clamp01((debt.debtDays || 0) / 90);
  const unpaid = clamp01((debt.periods || 0) / 4);
  return clamp01(0.3 * ratio + 0.18 * avgDays + 0.26 * debtDays + 0.26 * unpaid);
};

const paymentEvidenceConfidence = ({ discipline, debt }) =>
  sampleConfidence({
    observed: (discipline.periods || 0) + (debt.periods || 0),
    minSample: 2,
    fullSample: 8,
  });

const buildPaymentDelayRanking = async ({ branchId, students, signals, config, limit }) => {
  const monthly = await loadMonthlyExpected(students.map((s) => String(s._id)));

  const rows = [];
  let totalDebt = 0;

  for (const s of students) {
    const sid = String(s._id);
    const sig = signals.get(sid);
    if (!sig) continue;

    const { discipline, debt } = sig;
    if (!discipline.periods && !debt.periods) continue;

    const index = paymentDelayIndex(sig);
    if (index <= 0) continue;

    totalDebt += debt.debtAmount || 0;

    const risk = scorePaymentRisk(sig, config);

    const metrics = [];
    if (discipline.periods > 0) {
      metrics.push(
        {
          key: "lateRatio",
          label: "Kechikkan to'lovlar",
          value: Math.round((discipline.lateRatio || 0) * 100),
          unit: "%",
        },
        {
          key: "avgLateDays",
          label: "O'rtacha kechikish",
          value: Math.round(discipline.avgLateDays || 0),
          unit: "kun",
        },
      );
    }
    if (debt.periods > 0) {
      metrics.push({
        key: "unpaidPeriods",
        label: "Yopilmagan oylar",
        value: debt.periods,
        unit: "ta",
      });
    }
    if (debt.debtAmount > 0) {
      metrics.push(
        {
          key: "debtAmount",
          label: "Joriy qarz",
          value: Math.round(debt.debtAmount),
          unit: "so'm",
        },
        {
          key: "debtDays",
          label: "Qarz muddati",
          value: debt.debtDays || 0,
          unit: "kun",
        },
      );
    }

    rows.push({
      subjectType: "student",
      subjectId: s._id,
      label: nameOf(s),
      href: subjectHref("student", s._id),
      score: index,
      severity: risk.severity,
      confidence: paymentEvidenceConfidence(sig),
      metrics,
      note: buildPaymentNote(discipline, debt, monthly.get(sid) || 0),
    });
  }

  rows.sort((a, b) => b.score - a.score);
  return {
    type: "payment_delay",
    branchId,
    scanned: students.length,
    rows: rows.slice(0, limit).map((r, i) => ({ ...r, rank: i + 1 })),
    totals: { debtAmount: Math.round(totalDebt), affected: rows.length },
  };
};

const buildPaymentNote = (discipline, debt, monthlyExpected) => {
  if (debt.debtDays > 60) {
    return `${debt.periods} oylik to'lov ${debt.debtDays} kundan beri yopilmagan — bu yo'qotilgan pul bo'lib qolmoqda.`;
  }
  if (debt.debtAmount > 0) {
    return `Hozirgi qarzi ${fmtMoney(debt.debtAmount)} so'm.`;
  }
  if (discipline.lateRatio >= 0.5) {
    return `To'lovlarining yarmidan ko'pini kechiktiradi — to'lov sanasini kelishib olish kerak.`;
  }
  if (monthlyExpected > 0) {
    return `Joriy oyda ${fmtMoney(monthlyExpected)} so'm kutilmoqda.`;
  }
  return "";
};

const buildAbsenceRanking = async ({ branchId, students, signals, config, limit }) => {
  const rows = [];
  let totalMissed = 0;

  for (const s of students) {
    const sid = String(s._id);
    const sig = signals.get(sid);
    if (!sig) continue;

    const { attendance, streak } = sig;
    const lessons = attendance.lessons || 0;
    if (lessons < 4) continue;

    const rate = attendance.recentRate ?? 1;
    const missed = Math.round(lessons * (1 - rate));
    if (missed <= 0) continue;

    totalMissed += missed;

    const missRatio = clamp01(1 - rate);
    const streakScore = clamp01((streak.streak || 0) / 4);
    const index = clamp01(0.7 * missRatio + 0.3 * streakScore);

    const churn = scoreChurn(sig, config);

    rows.push({
      subjectType: "student",
      subjectId: s._id,
      label: nameOf(s),
      href: subjectHref("student", s._id),
      score: index,
      severity: churn.severity,
      confidence: churn.confidence,
      metrics: [
        { key: "missed", label: "Qoldirgan darslar", value: missed, unit: "ta" },
        { key: "lessons", label: "Jami darslar", value: lessons, unit: "ta" },
        {
          key: "attendanceRate",
          label: "Davomat",
          value: Math.round(rate * 100),
          unit: "%",
        },
        { key: "streak", label: "Ketma-ket", value: streak.streak || 0, unit: "ta" },
      ],
      note: buildAbsenceNote(streak, missRatio, sig),
    });
  }

  rows.sort((a, b) => b.score - a.score);
  return {
    type: "absence",
    branchId,
    scanned: students.length,
    rows: rows.slice(0, limit).map((r, i) => ({ ...r, rank: i + 1 })),
    totals: { missedLessons: totalMissed, affected: rows.length },
  };
};

const buildAbsenceNote = (streak, missRatio, sig) => {
  if ((streak.streak || 0) >= 3) {
    return `Oxirgi ${streak.streak} darsni ketma-ket qoldirdi — bu o'quvchi bilan ZUDLIK bilan ishlashimiz kerak.`;
  }
  if (missRatio >= 0.4) {
    return `Darslarning ${Math.round(missRatio * 100)}% ini qoldirgan — bu o'quvchi bilan ishlashimiz kerak.`;
  }
  if (sig.debt?.debtAmount > 0) {
    return `Dars qoldirish qarz bilan birga kelmoqda — sabab moliyaviy bo'lishi mumkin.`;
  }
  return `Davomati pasaymoqda — sababini so'rab ko'ring.`;
};

const loadMonthlyExpected = async (studentIds) => {
  if (!studentIds.length) return new Map();
  const now = new Date();
  
  const rows = await prisma.studentPayment.findMany({
    where: {
      AND: branchMatchStage("branchId"),
      studentId: { in: studentIds.map(String) },
      year: now.getUTCFullYear(),
      month: now.getUTCMonth() + 1,
    },
    select: { studentId: true, expectedAmount: true },
  });
  
  const byStudent = new Map();
  for (const r of rows) {
    const sid = r.studentId;
    if (!byStudent.has(sid)) byStudent.set(sid, 0);
    byStudent.set(sid, byStudent.get(sid) + r.expectedAmount);
  }
  return byStudent;
};

const buildTeacherRanking = async ({ branchId, now, limit }) => {
  const { teachers, signals, baseline } = await collectTeacherSignals(branchId, now);
  if (!teachers.length) {
    return { type: "teacher", branchId, scanned: 0, rows: [], totals: {} };
  }

  const scored = [];
  for (const t of teachers) {
    const tid = String(t.id || t._id);
    const sig = signals.get(tid);
    if (!sig) continue;

    const result = scoreTeacher(sig);
    if (result.score == null) continue;

    scored.push({ teacher: t, sig, result });
  }

  scored.sort((a, b) => b.result.score - a.result.score);

  const total = scored.length;
  const rows = [];
  let raiseCount = 0;

  scored.forEach((entry, i) => {
    const { teacher: t, sig, result } = entry;
    const raise = qualifiesForRaise(result, baseline, { rank: i + 1, total });
    if (raise) raiseCount += 1;

    const metrics = result.dimensions
      .filter((d) => d.score != null)
      .map((d) => ({
        key: d.key,
        label: d.label,
        value: d.display,
        unit: d.unit,
      }));

    metrics.push({
      key: "students",
      label: "O'quvchilari",
      value: sig.load.students || 0,
      unit: "ta",
    });

    rows.push({
      rank: i + 1,
      subjectType: "teacher",
      subjectId: t.id || t._id,
      label: `${t.firstName || ""} ${t.lastName || ""}`.trim() || "Noma'lum",
      href: subjectHref("teacher", t.id || t._id),
      score: result.score,
      severity: raise ? "high" : result.score >= 0.5 ? "medium" : "low",
      confidence: result.confidence,
      metrics,
      note: buildTeacherNote({ result, raise, signals: sig }),
    });
  });

  return {
    type: "teacher",
    branchId,
    scanned: teachers.length,
    rows: rows.slice(0, limit),
    totals: { raiseCandidates: raiseCount, ranked: total },
  };
};

const buildTeacherNote = ({ result, raise, signals }) => {
  const best = result.dimensions
    .filter((d) => d.score != null)
    .sort((a, b) => b.score - a.score)[0];

  if (raise) {
    const reason =
      best?.key === "attendance"
        ? `o'quvchilarining davomati filial o'rtachasidan ${best.display}% yuqori`
        : best?.key === "grade"
          ? `o'quvchilarining bahosi filial o'rtachasidan ${best.display} ball tez o'smoqda`
          : `o'quvchilari filial o'rtachasidan ${best?.display}% ko'proq o'z vaqtida to'laydi`;
    return `Kuchli ko'rsatkich — ${reason}. Maoshini oshirishni ko'rib chiqing (miqdorni o'zingiz belgilaysiz).`;
  }

  const weak = result.dimensions
    .filter((d) => d.score != null)
    .sort((a, b) => a.score - b.score)[0];

  if (weak && weak.score < 0.35) {
    return weak.key === "attendance"
      ? `Guruhlarida davomat filial o'rtachasidan ${Math.abs(weak.display)}% past — sababini birga aniqlang.`
      : weak.key === "grade"
        ? `O'quvchilarining bahosi filial o'rtachasidek o'smayapti — metodik yordam kerak bo'lishi mumkin.`
        : `Guruhlarida to'lov intizomi past — ota-onalar bilan aloqani tekshiring.`;
  }

  if (signals.absence?.missedLessons > 0) {
    return `${signals.absence.missedLessons} ta dars o'tkazilmagan — ko'rsatkichga ta'sir qilmoqda.`;
  }
  return "";
};

export const recomputeRankings = async (branchId, { limit = DEFAULT_LIMIT } = {}) => {
  const now = new Date();
  const config = await resolveConfig(branchId);
  const students = await loadStudents(branchId);

  const teacher = await buildTeacherRanking({ branchId, now, limit });
  await saveRanking(teacher);

  if (!students.length) {
    await saveRanking({ type: "payment_delay", branchId, scanned: 0, rows: [], totals: {} });
    await saveRanking({ type: "absence", branchId, scanned: 0, rows: [], totals: {} });
    return { payment_delay: 0, absence: 0, teacher: teacher.rows.length };
  }

  const signals = await collectStudentSignals(students, now);

  const payment = await buildPaymentDelayRanking({
    branchId,
    students,
    signals,
    config,
    limit,
  });
  const absence = await buildAbsenceRanking({
    branchId,
    students,
    signals,
    config,
    limit,
  });

  await saveRanking(payment);
  await saveRanking(absence);

  return {
    payment_delay: payment.rows.length,
    absence: absence.rows.length,
    teacher: teacher.rows.length,
  };
};

export const saveRanking = async ({ type, branchId, scanned, rows, totals }) => {
  await prisma.aiRanking.upsert({
    where: { branchId_type: { branchId, type } },
    update: {
      generatedAt: new Date(),
      scanned: scanned || 0,
      rows: rows || [],
      totals: totals || {},
    },
    create: {
      branchId,
      type,
      generatedAt: new Date(),
      scanned: scanned || 0,
      rows: rows || [],
      totals: totals || {},
    },
  });
};

export const readRanking = async (branchId, type) => {
  const doc = await prisma.aiRanking.findUnique({
    where: { branchId_type: { branchId, type } },
  });
  if (!doc) return null;
  return {
    type: doc.type,
    generatedAt: doc.generatedAt,
    scanned: doc.scanned,
    rows: typeof doc.rows === 'string' ? JSON.parse(doc.rows) : doc.rows || [],
    totals: plainTotals(doc.totals),
    staleDays: Math.floor((Date.now() - new Date(doc.generatedAt).getTime()) / DAY_MS),
  };
};

export const readAllRankings = async (branchId, types = RANKING_TYPES) => {
  const docs = await prisma.aiRanking.findMany({
    where: { branchId, type: { in: types } },
  });
  const byType = new Map(docs.map((d) => [d.type, d]));
  const out = {};
  for (const t of types) {
    const doc = byType.get(t);
    out[t] = doc
      ? {
          type: doc.type,
          generatedAt: doc.generatedAt,
          scanned: doc.scanned,
          rows: typeof doc.rows === 'string' ? JSON.parse(doc.rows) : doc.rows || [],
          totals: plainTotals(doc.totals),
        }
      : null;
  }
  return out;
};

const plainTotals = (totals) => {
  if (!totals) return {};
  if (typeof totals === 'string') {
      try { return JSON.parse(totals); } catch (e) { return {}; }
  }
  if (totals instanceof Map) return Object.fromEntries(totals);
  return { ...totals };
};
