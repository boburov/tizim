import prisma from "../../../config/prisma.js";
import { collectTeacherSignals } from "../signals/teacher.signal.js";
import {
  buildFactors,
  weightedScore,
  severityFor,
  sampleConfidence,
  norm,
  readMap,
} from "../scoring/common.scoring.js";
import { DEFAULT_THRESHOLDS } from "../../../models/aiConfig.model.js";
import { narrate } from "./narration.service.js";
import {
  buildInsight,
  closeStale,
  mkStats,
  writeIfConfident,
  fmtMoney,
} from "./insightWriter.service.js";
import { resolveConfig } from "./aiConfig.service.js";

const TEACHER_KINDS = [
  "teacher_attendance_issue",
  "teacher_low_load",
  "teacher_top_performer",
];

const MISSED_LESSON_IMPACT_SHARE = 0.05;

const buildAbsenceRefs = (teacherId, absence) => {
  const refs = [];
  if (absence.hrIds?.length) {
    refs.push({
      model: "TeacherAttendance",
      ids: absence.hrIds,
      total: absence.hrAbsences,
      href: "/owner/teachers/davomat",
    });
  }
  if (absence.lessonIds?.length) {
    refs.push({
      model: "TeacherAbsence",
      ids: absence.lessonIds,
      total: absence.missedLessons,
      href: `/owner/users/${teacherId}`,
    });
  }
  return refs;
};

const detectAttendanceIssue = ({ teacher, signals, monthlyValue, thresholds }) => {
  const { absence, load } = signals;
  const totalMissed = absence.missedLessons + absence.hrAbsences;
  if (totalMissed === 0) return null;

  const factors = buildFactors([
    {
      key: "missedLessons",
      label: "O'tkazilmagan darslar",
      value: absence.missedLessons,
      unit: "ta",
      normalized: norm(absence.missedLessons, 4),
      weight: 0.4,
    },
    {
      key: "hrAbsences",
      label: "Ishga kelmagan kunlar",
      value: absence.hrAbsences,
      unit: "kun",
      normalized: norm(absence.hrAbsences, 4),
      weight: 0.25,
    },
    {
      key: "absenceThisWeek",
      label: "Shu haftadagi yo'qliklar",
      value: absence.missedThisWeek + absence.hrThisWeek,
      unit: "marta",
      normalized: norm(absence.missedThisWeek + absence.hrThisWeek, 2),
      weight: 0.25,
    },
    {
      key: "affectedGroups",
      label: "Ta'sirlangan guruhlar",
      value: absence.affectedGroups,
      unit: "ta",
      normalized: norm(absence.affectedGroups, 3),
      weight: 0.1,
    },
  ]);

  const score = weightedScore(factors);
  const severity = severityFor(score, thresholds);

  const daysSince = absence.lastDate
    ? Math.floor((Date.now() - new Date(absence.lastDate).getTime()) / 86400000)
    : 30;
  const confidence = sampleConfidence({
    observed: totalMissed,
    minSample: 1,
    fullSample: 4,
    recencyDays: daysSince,
  });

  const atRisk = monthlyValue * MISSED_LESSON_IMPACT_SHARE * absence.missedLessons;
  const expectedImpact = {
    amount: Math.round(atRisk),
    currency: "UZS",
    label: atRisk > 0 ? `${fmtMoney(atRisk)} so'm o'quvchi ishonchi xavf ostida` : "",
  };

  const name = `${teacher.firstName} ${teacher.lastName || ""}`.trim();
  const weekPart =
    absence.missedThisWeek + absence.hrThisWeek > 0
      ? ` Shu hafta ${absence.missedThisWeek + absence.hrThisWeek} marta.`
      : "";

  return {
    kind: "teacher_attendance_issue",
    subjectId: teacher._id,
    subjectLabel: name,
    title: `${name} — oxirgi 4 haftada ${totalMissed} marta kelmagan`,
    severity,
    score,
    confidence,
    factors,
    expectedImpact,
    sourceRefs: buildAbsenceRefs(teacher._id, absence),
    recommendedActions: [
      {
        key: "talk_to_teacher",
        label: "O'qituvchi bilan suhbatlashing va sababini aniqlang",
        dueInDays: 2,
      },
      ...(absence.missedLessons > 0
        ? [
            {
              key: "reschedule_lessons",
              label: `${absence.missedLessons} ta o'tkazilmagan darsni qoplash jadvalini tuzing`,
              dueInDays: 7,
            },
          ]
        : []),
      ...(load.students > 0
        ? [
            {
              key: "notify_students",
              label: `Ta'sirlangan ${load.students} o'quvchini xabardor qiling`,
              dueInDays: 1,
            },
          ]
        : []),
    ],
    narration: narrate({
      headline: `${name} oxirgi 4 haftada ${totalMissed} marta darsga chiqmagan.${weekPart}`,
      factors,
      expectedImpact,
      confidence,
      stance: "risk",
    }),
  };
};

const detectLowLoad = ({ teacher, signals, thresholds }) => {
  const { load, baseline } = signals;
  if (!baseline?.studentsPerTeacher || baseline.sampleSize < 3) return null;
  if (load.groups === 0) return null;

  const gap = (baseline.studentsPerTeacher - load.students) / baseline.studentsPerTeacher;
  if (gap < 0.25) return null;

  const factors = buildFactors([
    {
      key: "loadGap",
      label: "O'rtachadan farq",
      value: Math.round(gap * 100),
      unit: "%",
      normalized: norm(gap, 0.6),
      weight: 0.6,
    },
    {
      key: "studentCount",
      label: "O'quvchi soni",
      value: load.students,
      unit: "ta",
      normalized: 1 - norm(load.students, Math.max(1, baseline.studentsPerTeacher)),
      weight: 0.25,
      direction: "neutral",
    },
    {
      key: "groupCount",
      label: "Guruhlar soni",
      value: load.groups,
      unit: "ta",
      normalized: 1 - norm(load.groups, 4),
      weight: 0.15,
      direction: "neutral",
    },
  ]);

  const score = weightedScore(factors);
  const confidence = sampleConfidence({
    observed: baseline.sampleSize,
    minSample: 3,
    fullSample: 12,
    consistency: baseline.sampleSize >= 6 ? 1 : 0.7,
  });

  const name = `${teacher.firstName} ${teacher.lastName || ""}`.trim();
  return {
    kind: "teacher_low_load",
    subjectId: teacher._id,
    subjectLabel: name,
    title: `${name} — yuklamasi filial o'rtachasidan ${Math.round(gap * 100)}% past`,
    severity: severityFor(score, thresholds) === "high" ? "medium" : "low",
    score,
    confidence,
    factors,
    expectedImpact: {
      amount: 0,
      currency: "UZS",
      label: `${load.groups} guruh, ${load.students} o'quvchi`,
    },
    sourceRefs: [
      {
        model: "Group",
        ids: load.perGroup.map((p) => p.groupId).slice(0, 20),
        total: load.groups,
        href: `/owner/users/${teacher._id}`,
      },
    ],
    recommendedActions: [
      {
        key: "review_load",
        label: "Yuklamani ko'rib chiqing — yangi guruh berish mumkinmi?",
        dueInDays: 14,
      },
    ],
    narration: narrate({
      headline: `${name} da ${load.students} o'quvchi bor — filial o'rtachasi ${Math.round(baseline.studentsPerTeacher)}.`,
      factors,
      confidence,
      stance: "watch",
    }),
  };
};

const detectTopPerformer = ({ teacher, signals, thresholds }) => {
  const { outcome, baseline, load } = signals;
  if (baseline?.sampleSize < 3) return null;
  if (outcome.gradeImprovement == null || outcome.groupsWithGrades === 0) return null;
  if (outcome.gradeSamples < 20) return null;

  const baseImprovement = baseline.gradeImprovement ?? 0;
  const lift = outcome.gradeImprovement - baseImprovement;
  if (lift < 0.15) return null;

  const attLift =
    outcome.attendanceRate != null && baseline.attendanceRate != null
      ? outcome.attendanceRate - baseline.attendanceRate
      : 0;

  const factors = buildFactors([
    {
      key: "outcomeLift",
      label: "Baho o'sishi ustunligi",
      value: Number(lift.toFixed(2)),
      unit: "ball",
      normalized: norm(lift, 0.5),
      weight: 0.55,
      direction: "good",
    },
    {
      key: "gradeImprovement",
      label: "Guruhlaridagi baho o'sishi",
      value: Number(outcome.gradeImprovement.toFixed(2)),
      unit: "ball",
      normalized: norm(outcome.gradeImprovement, 0.8),
      weight: 0.2,
      direction: "good",
    },
    {
      key: "attendanceLift",
      label: "Davomat ustunligi",
      value: Math.round(attLift * 100),
      unit: "%",
      normalized: norm(Math.max(0, attLift), 0.1),
      weight: 0.15,
      direction: "good",
    },
    {
      key: "studentCount",
      label: "Ta'sir doirasi",
      value: load.students,
      unit: "o'quvchi",
      normalized: norm(load.students, 40),
      weight: 0.1,
      direction: "good",
    },
  ]);

  const score = weightedScore(factors);
  const confidence = sampleConfidence({
    observed: outcome.gradeSamples,
    minSample: 20,
    fullSample: 120,
    consistency: baseline.sampleSize >= 5 ? 1 : 0.75,
  });

  const name = `${teacher.firstName} ${teacher.lastName || ""}`.trim();
  return {
    kind: "teacher_top_performer",
    subjectId: teacher._id,
    subjectLabel: name,
    title: `${name} — o'quvchilari eng tez o'sayotgan o'qituvchi`,
    severity: score >= thresholds.highSeverityScore ? "medium" : "low",
    score,
    confidence,
    factors,
    expectedImpact: {
      amount: 0,
      currency: "UZS",
      label: `${load.students} o'quvchiga ta'sir qiladi`,
    },
    sourceRefs: [
      {
        model: "Group",
        ids: load.perGroup.map((p) => p.groupId).slice(0, 20),
        total: load.groups,
        href: `/owner/users/${teacher._id}`,
      },
    ],
    recommendedActions: [
      {
        key: "recognize_teacher",
        label: "Rag'batlantirishni ko'rib chiqing (miqdorni o'zingiz belgilaysiz)",
        dueInDays: 14,
      },
      {
        key: "share_method",
        label: "Uning uslubini boshqa o'qituvchilar bilan bo'lishishni tashkil qiling",
        dueInDays: 30,
      },
    ],
    narration: narrate({
      headline: `${name} guruhlarida o'rtacha baho ${outcome.gradeImprovement.toFixed(2)} ballga ko'tarildi — filial o'rtachasidan ${lift.toFixed(2)} ball yuqori.`,
      factors,
      confidence,
      stance: "opportunity",
    }),
  };
};

const loadMonthlyByTeacher = async (teachers, now) => {
  const groupIds = [...new Set(teachers.flatMap((t) => t.groupIds.map(String)))];
  if (!groupIds.length) return new Map();

  const rows = await prisma.studentPayment.findMany({
    where: {
      groupId: { in: groupIds },
      year: now.getUTCFullYear(),
      month: now.getUTCMonth() + 1,
      writtenOff: false,
    },
    select: { groupId: true, expectedAmount: true },
  });

  const byGroup = new Map();
  for (const r of rows) {
    if (!byGroup.has(r.groupId)) byGroup.set(r.groupId, 0);
    byGroup.set(r.groupId, byGroup.get(r.groupId) + r.expectedAmount);
  }

  const out = new Map();
  for (const t of teachers) {
    let total = 0;
    for (const gid of t.groupIds) total += byGroup.get(String(gid)) || 0;
    out.set(String(t._id), total);
  }
  return out;
};

export const recomputeTeacherInsights = async (branchId, now = new Date()) => {
  const config = await resolveConfig(branchId);
  const thresholds = readMap(config.thresholds, DEFAULT_THRESHOLDS);

  const { teachers, signals } = await collectTeacherSignals(branchId, now);
  const stats = {
    scanned: teachers.length,
    attendanceIssue: mkStats(),
    lowLoad: mkStats(),
    topPerformer: mkStats(),
  };
  if (!teachers.length) return stats;

  const monthlyByTeacher = await loadMonthlyByTeacher(teachers, now);

  const stillOpen = {
    teacher_attendance_issue: new Set(),
    teacher_low_load: new Set(),
    teacher_top_performer: new Set(),
  };

  const detectors = [
    { fn: detectAttendanceIssue, stat: "attendanceIssue" },
    { fn: detectLowLoad, stat: "lowLoad" },
    { fn: detectTopPerformer, stat: "topPerformer" },
  ];

  for (const teacher of teachers) {
    const tid = String(teacher._id);
    const sig = signals.get(tid);
    if (!sig) continue;
    const monthlyValue = monthlyByTeacher.get(tid) || 0;

    for (const { fn, stat } of detectors) {
      const found = fn({ teacher, signals: sig, monthlyValue, thresholds });
      if (!found) continue;
      await writeIfConfident({
        candidate: buildInsight({ branchId, now, ...found }),
        confidenceFloor: config.confidenceFloor,
        stats: stats[stat],
        stillOpen: stillOpen[found.kind],
      });
    }
  }

  for (const kind of TEACHER_KINDS) {
    const closed = await closeStale(branchId, [kind], stillOpen[kind], now);
    const statKey =
      kind === "teacher_attendance_issue"
        ? "attendanceIssue"
        : kind === "teacher_low_load"
          ? "lowLoad"
          : "topPerformer";
    stats[statKey].closed = closed;
  }

  return stats;
};
