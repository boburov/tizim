import prisma from "../../../config/prisma.js";
import { DEFAULT_THRESHOLDS } from "../../../constants/aiDefaults.js";
import { ROLES } from "../../../constants/roles.js";
import { branchMatchStage } from "../../../helpers/branchContext.helper.js";
import { collectStudentSignals } from "../signals/student.signal.js";
import { scoreChurn, churnActions } from "../scoring/churn.scoring.js";
import { scorePaymentRisk, paymentActions } from "../scoring/payment.scoring.js";
import { narrateChurn, narratePaymentRisk, narrate } from "./narration.service.js";
import {
  buildFactors,
  weightedScore,
  sampleConfidence,
  severityFor,
  norm,
  readMap,
} from "../scoring/common.scoring.js";
import {
  buildInsight,
  closeStale,
  mkStats,
  upsertInsight,
  fmtMoney,
} from "./insightWriter.service.js";
import { resolveConfig } from "./aiConfig.service.js";

const DAY_MS = 24 * 60 * 60 * 1000;

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

const loadMonthlyValue = async (studentIds, now) => {
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const rows = await prisma.studentPayment.findMany({
    where: {
      AND: branchMatchStage("branchId"),
      studentId: { in: studentIds.map(String) },
      year,
      month,
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
      href: `/owner/finance/student-payments/student/${sid}`,
    });
  }
  return refs;
};

const DOW_LABELS = [
  null,
  "yakshanba",
  "dushanba",
  "seshanba",
  "chorshanba",
  "payshanba",
  "juma",
  "shanba",
];

const detectImproving = ({ subjectLabel, signals, thresholds }) => {
  const { grades, attendance } = signals;
  if (!grades.improvement || grades.improvement < 0.4) return null;
  if ((grades.count || 0) < 6) return null;
  if (attendance.recentRate == null || attendance.recentRate < 0.7) return null;

  const factors = buildFactors([
    {
      key: "gradeImprovement",
      label: "Baho o'sishi",
      value: Number(grades.improvement.toFixed(2)),
      unit: "ball",
      normalized: norm(grades.improvement, 1.5),
      weight: 0.6,
      direction: "good",
    },
    {
      key: "attendanceRate",
      label: "Davomat darajasi",
      value: Math.round(attendance.recentRate * 100),
      unit: "%",
      normalized: norm(attendance.recentRate, 1),
      weight: 0.4,
      direction: "good",
    },
  ]);

  const score = weightedScore(factors);
  const confidence = sampleConfidence({
    observed: grades.count,
    minSample: 6,
    fullSample: 30,
  });

  return {
    kind: "student_improving",
    title: `${subjectLabel} — bahosi ${grades.improvement.toFixed(1)} ballga ko'tarildi`,
    severity: severityFor(score, thresholds) === "high" ? "medium" : "low",
    score,
    confidence,
    factors,
    expectedImpact: {
      amount: 0,
      currency: "UZS",
      label: `${grades.priorAvg?.toFixed(1)} → ${grades.recentAvg?.toFixed(1)} ball`,
    },
    sourceRefs: grades.ids?.length
      ? [
          {
            model: "Grade",
            ids: grades.ids,
            total: grades.count,
            href: "/owner/grades",
          },
        ]
      : [],
    recommendedActions: [
      {
        key: "praise_student",
        label: "Ota-onaga muvaffaqiyat haqida xabar bering — eng arzon ushlab qolish yo'li",
        dueInDays: 7,
      },
    ],
    narration: narrate({
      headline:
        `${subjectLabel} ning o'rtacha bahosi ${grades.priorAvg?.toFixed(1)} dan ` +
        `${grades.recentAvg?.toFixed(1)} ga ko'tarildi (davomat ${Math.round(attendance.recentRate * 100)}%).`,
      factors,
      confidence,
      stance: "opportunity",
    }),
  };
};

const detectAttendancePattern = ({ sid, subjectLabel, signals, thresholds }) => {
  const { weekday, attendance } = signals;
  if (!weekday.worstDay) return null;
  if (weekday.gap < 0.15) return null;
  if (weekday.worstAbsences < 2) return null;
  if (weekday.worstTotal < 4) return null;

  const dayName = DOW_LABELS[weekday.worstDay] || "shu kun";

  const factors = buildFactors([
    {
      key: "weekdayGap",
      label: "Naqsh kuchi",
      value: dayName,
      normalized: norm(weekday.gap, 0.4),
      weight: 0.5,
    },
    {
      key: "weekdayAbsences",
      label: `${dayName} kunidagi qoldirishlar`,
      value: weekday.worstAbsences,
      unit: "marta",
      normalized: norm(weekday.worstAbsences, 5),
      weight: 0.3,
    },
    {
      key: "weekdayRate",
      label: `${dayName} qoldirish darajasi`,
      value: Math.round(weekday.worstRate * 100),
      unit: "%",
      normalized: norm(weekday.worstRate, 0.6),
      weight: 0.2,
    },
  ]);

  const score = weightedScore(factors);
  const confidence = sampleConfidence({
    observed: weekday.worstTotal,
    minSample: 4,
    fullSample: 12,
  });

  return {
    kind: "attendance_anomaly",
    title: `${subjectLabel} — aynan ${dayName} kunlari kelmaydi`,
    severity: severityFor(score, thresholds) === "high" ? "medium" : "low",
    score,
    confidence,
    factors,
    expectedImpact: {
      amount: 0,
      currency: "UZS",
      label: `${dayName}: ${weekday.worstAbsences}/${weekday.worstTotal} dars qoldirilgan`,
    },
    sourceRefs: weekday.sampleIds?.length
      ? [
          {
            model: "Attendance",
            ids: weekday.sampleIds,
            total: weekday.worstAbsences,
            href: `/owner/users/${sid}/davomat`,
          },
        ]
      : [],
    recommendedActions: [
      {
        key: "ask_schedule_conflict",
        label: `${dayName} kunidagi to'siqni aniqlang — jadvalni moslash mumkinmi?`,
        dueInDays: 7,
      },
    ],
    narration: narrate({
      headline:
        `${subjectLabel} ${dayName} kunlari ${weekday.worstTotal} darsdan ` +
        `${weekday.worstAbsences} tasini qoldirgan (${Math.round(weekday.worstRate * 100)}%), ` +
        `umumiy qoldirish darajasi esa ${Math.round(weekday.overallRate * 100)}%. ` +
        "Bu tasodifiy emas, tizimli to'siqqa o'xshaydi.",
      factors,
      confidence,
      stance: "watch",
    }),
  };
};

export const recomputeStudentInsights = async (branchId, now = new Date()) => {
  const config = await resolveConfig(branchId);
  const students = await loadStudents(branchId);

  const thresholds = readMap(config.thresholds, DEFAULT_THRESHOLDS);
  const stats = {
    scanned: students.length,
    churn: mkStats(),
    payment: mkStats(),
    improving: mkStats(),
    attendancePattern: mkStats(),
  };
  if (!students.length) return stats;

  const ids = students.map((s) => String(s._id));
  const [signalsMap, valueMap] = await Promise.all([
    collectStudentSignals(students, now),
    loadMonthlyValue(ids, now),
  ]);

  const stillOpen = {
    student_churn_risk: new Set(),
    payment_risk: new Set(),
    student_improving: new Set(),
    attendance_anomaly: new Set(),
  };

  for (const student of students) {
    const sid = String(student._id);
    const signals = signalsMap.get(sid);
    if (!signals) continue;

    const amount = valueMap.get(sid) || 0;
    const subjectLabel = `${student.firstName} ${student.lastName}`.trim();
    const base = { branchId, subjectId: student._id, subjectLabel, now };

    const churn = scoreChurn(signals, config);

    if (churn.confidence < config.confidenceFloor) {
      stats.churn.skippedLowConfidence += 1;
    } else if (churn.severity !== "low") {
      stillOpen.student_churn_risk.add(sid);
      const expectedImpact = {
        amount,
        currency: "UZS",
        label: amount ? `Oyiga ${fmtMoney(amount)} so'm xavf ostida` : "",
      };
      const res = await upsertInsight(
        buildInsight({
          ...base,
          kind: "student_churn_risk",
          title: `${subjectLabel} — ketish xavfi ${Math.round(churn.score * 100)}%`,
          severity: churn.severity,
          score: churn.score,
          confidence: churn.confidence,
          factors: churn.factors,
          sourceRefs: buildSourceRefs(sid, signals, ["attendance", "grade", "payment"]),
          recommendedActions: churnActions(churn.factors, {
            debtAmount: signals.debt.debtAmount,
          }),
          expectedImpact,
          narration: narrateChurn({ subjectLabel, ...churn, expectedImpact }),
        }),
      );
      stats.churn[res] += 1;
    }

    const payment = scorePaymentRisk(signals, config);

    if (payment.confidence < config.confidenceFloor) {
      stats.payment.skippedLowConfidence += 1;
    } else if (payment.severity !== "low") {
      stillOpen.payment_risk.add(sid);
      const atRisk = (signals.debt.debtAmount || 0) + amount;
      const expectedImpact = {
        amount: atRisk,
        currency: "UZS",
        label: atRisk ? `Kutilayotgan qarz: ${fmtMoney(atRisk)} so'm` : "",
      };
      const res = await upsertInsight(
        buildInsight({
          ...base,
          kind: "payment_risk",
          title: `${subjectLabel} — kechikib to'lash ehtimoli ${Math.round(payment.score * 100)}%`,
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
          narration: narratePaymentRisk({
            subjectLabel,
            score: payment.score,
            factors: payment.factors,
            expectedImpact,
          }),
        }),
      );
      stats.payment[res] += 1;
    }

    const improving = detectImproving({ subjectLabel, signals, thresholds });
    if (improving) {
      if (improving.confidence < config.confidenceFloor) {
        stats.improving.skippedLowConfidence += 1;
      } else {
        stillOpen.student_improving.add(sid);
        const res = await upsertInsight(buildInsight({ ...base, ...improving }));
        stats.improving[res] += 1;
      }
    }

    const pattern = detectAttendancePattern({ sid, subjectLabel, signals, thresholds });
    if (pattern) {
      if (pattern.confidence < config.confidenceFloor) {
        stats.attendancePattern.skippedLowConfidence += 1;
      } else {
        stillOpen.attendance_anomaly.add(sid);
        const res = await upsertInsight(buildInsight({ ...base, ...pattern }));
        stats.attendancePattern[res] += 1;
      }
    }
  }

  stats.churn.closed = await closeStale(
    branchId,
    ["student_churn_risk"],
    stillOpen.student_churn_risk,
    now,
  );
  stats.payment.closed = await closeStale(
    branchId,
    ["payment_risk"],
    stillOpen.payment_risk,
    now,
  );
  stats.improving.closed = await closeStale(
    branchId,
    ["student_improving"],
    stillOpen.student_improving,
    now,
  );
  stats.attendancePattern.closed = await closeStale(
    branchId,
    ["attendance_anomaly"],
    stillOpen.attendance_anomaly,
    now,
  );

  return stats;
};
