import mongoose from "mongoose";
import StudentPayment from "../../../models/studentPayment.model.js";
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

// O'QITUVCHI DETEKTORLARI - uchta:
//   1. teacher_attendance_issue  - dars o'tkazilmagan kunlar (xavf)
//   2. teacher_low_load          - yuklamasi past (kuzatuv)
//   3. teacher_top_performer     - eng samarali (imkoniyat)
//
// Uchalasida ham BIR XIL himoya ishlaydi: filial namunasi kichik bo'lsa
// (2-3 o'qituvchi) ishonch pasayadi va insight yaratilmaydi. "O'rtachadan
// past" degan xulosa 3 kishilik namunada matematik ma'noga ega emas, lekin
// UI da xuddi shunday ishonchli ko'rinadi - va aynan shunday insight
// owner ishonchini butunlay yo'qotadi.

const TEACHER_KINDS = [
  "teacher_attendance_issue",
  "teacher_low_load",
  "teacher_top_performer",
];

// Bir o'qituvchi kelmagan kuni markazga qancha turadi? To'g'ridan-to'g'ri
// pul yo'qotilmaydi (dars keyin qoplanadi yoki qoplanmaydi), lekin
// o'quvchi ishonchi yo'qoladi. Shuning uchun ta'sir shu o'qituvchining
// o'quvchilari ARZIYDIGAN summaning bir ULUSHI sifatida baholanadi.
// 0.05 = "har bir o'tkazilmagan dars o'quvchi bazasining 5% ini xavfga qo'yadi".
// Bu taxmin va shunday deb belgilangan - owner uni AiConfig'dan sozlay oladi.
const MISSED_LESSON_IMPACT_SHARE = 0.05;

/**
 * DETEKTOR 1: dars o'tkazilmagan kunlar.
 *
 * "Kechikdi" EMAS, "kelmadi": kodbazada o'qituvchi kechikishi yozilmaydi
 * (TeacherAttendance.status faqat present/absent/excused, lateMinutes yo'q).
 * Kechikish hisobotini ko'rsatish uchun avval uni yozadigan maydon kerak -
 * aks holda son o'ylab topilgan bo'lardi.
 */
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
      // 4 dars = to'liq signal: oyda haftada bir dars o'tkazilmasa
      // bu tizimli muammo.
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
      // Shu haftada 2 marta - shoshilinch signal, oyda 2 martadan boshqa hodisa.
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

  // Ishonch bu yerda YUQORI bo'lishi tabiiy: bu bashorat emas, QAYD
  // ETILGAN FAKT. "3 marta kelmadi" - hisoblangan son, ehtimol emas.
  // Kamaytiruvchi yagona omil - yozuvning qanchalik yangi bo'lishi.
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

/**
 * DETEKTOR 2: yuklamasi past o'qituvchi.
 *
 * Bu XAVF emas, KUZATUV (stance: watch): o'qituvchining aybi bo'lishi
 * shart emas - guruh yangi ochilgan yoki kurs tugayotgan bo'lishi mumkin.
 * Shuning uchun tavsiya ham "jazolash" emas, "yuklamani ko'rib chiqish".
 *
 * Gemini maslahatiga ko'ra AI yuklamani QAYTA TAQSIMLASHNI tavsiya
 * qilmaydi - u faqat holatni ko'rsatadi. Avtomatik qayta taqsimlash
 * HR muammosi va uni AI hal qilmasligi kerak.
 */
const detectLowLoad = ({ teacher, signals, thresholds }) => {
  const { load, baseline } = signals;
  // Filialda taqqoslash uchun namuna yo'q → xulosa chiqarilmaydi.
  if (!baseline?.studentsPerTeacher || baseline.sampleSize < 3) return null;
  if (load.groups === 0) return null;

  const gap = (baseline.studentsPerTeacher - load.students) / baseline.studentsPerTeacher;
  // 25% dan kam farq - shovqin, signal emas.
  if (gap < 0.25) return null;

  const factors = buildFactors([
    {
      key: "loadGap",
      label: "O'rtachadan farq",
      value: Math.round(gap * 100),
      unit: "%",
      // 60% past = to'liq signal.
      normalized: norm(gap, 0.6),
      weight: 0.6,
    },
    {
      key: "studentCount",
      label: "O'quvchi soni",
      value: load.students,
      unit: "ta",
      // Teskari: o'quvchi kam bo'lsa normalized yuqori.
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
    // Namuna kichik bo'lsa izchillik ham past: 4 o'qituvchi bilan
    // "o'rtacha" tushunchasi zaif.
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
    // Bo'sh sig'im - YO'QOTILGAN daromad emas, IMKONIYAT. Shuning uchun
    // ta'sir summasi 0: uni "xavf ostidagi pul" ga qo'shish moliya
    // ko'rsatkichini shishirardi.
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

/**
 * DETEKTOR 3: eng samarali o'qituvchi (imkoniyat).
 *
 * BU YERDA ENG MUHIM QAROR: ball XOM O'RTACHADAN emas, O'SISHdan chiqadi.
 * "Uning o'quvchilari 4.6 ball" - u kuchli guruh olgan bo'lishi mumkin.
 * "Uning o'quvchilari 3.4 dan 4.2 ga ko'tarildi" - bu uning hissasi.
 *
 * Aynan shu farq Gemini "The Hallucinated Scolding" deb atagan xatoning
 * teskarisi: qiyin guruh olgan yaxshi o'qituvchini jazolash o'rniga,
 * o'quvchilarni haqiqatan o'stirgan o'qituvchini topadi.
 */
const detectTopPerformer = ({ teacher, signals, thresholds }) => {
  const { outcome, baseline, load } = signals;
  if (baseline?.sampleSize < 3) return null;
  if (outcome.gradeImprovement == null || outcome.groupsWithGrades === 0) return null;
  // Baho namunasi kichik bo'lsa o'sish tasodifiy bo'lishi mumkin.
  if (outcome.gradeSamples < 20) return null;

  const baseImprovement = baseline.gradeImprovement ?? 0;
  const lift = outcome.gradeImprovement - baseImprovement;
  // Faqat sezilarli ustunlik: 0.15 balldan kam farq o'lchov shovqini.
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
      // 0.5 ball ustunlik = to'liq signal (1-5 shkalada bu katta farq).
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
    // MIQDOR ATAYLAB YO'Q: "unga 500 000 so'm bonus bering" deb aytish
    // huquqiy va ishonch xavfi. AI ko'rsatkichni beradi, miqdorni owner
    // belgilaydi.
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

/**
 * O'qituvchi bo'yicha oylik daromad qiymati - guruhlarining joriy oy
 * kutilgan to'lovlari yig'indisi. Ta'sir summasini hisoblash uchun.
 *
 * Bir guruhda ikki o'qituvchi bo'lsa summa IKKALASIGA ham yoziladi -
 * bu ataylab: "shu o'qituvchi kelmasa qancha pul xavf ostida" savoliga
 * javob, guruh daromadini bo'lish emas.
 */
const loadMonthlyByTeacher = async (teachers, now) => {
  const groupIds = [...new Set(teachers.flatMap((t) => t.groupIds.map(String)))];
  if (!groupIds.length) return new Map();

  const rows = await StudentPayment.aggregate([
    {
      $match: {
        group: { $in: groupIds.map((id) => new mongoose.Types.ObjectId(id)) },
        year: now.getUTCFullYear(),
        month: now.getUTCMonth() + 1,
        writtenOff: false,
      },
    },
    { $group: { _id: "$group", amount: { $sum: "$expectedAmount" } } },
  ]);
  const byGroup = new Map(rows.map((r) => [String(r._id), r.amount || 0]));

  const out = new Map();
  for (const t of teachers) {
    let total = 0;
    for (const gid of t.groupIds) total += byGroup.get(String(gid)) || 0;
    out.set(String(t._id), total);
  }
  return out;
};

/**
 * Bitta filial uchun o'qituvchi insight'larini qayta hisoblaydi.
 *
 * MUHIM: chaqiruvchi buni runWithBranchContext() ichida ishga tushirishi
 * SHART - aks holda signal aggregation'lari boshqa filial ma'lumotini
 * qamrab oladi.
 */
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

  // Har bir tur ALOHIDA yopiladi: davomat muammosi tugagan o'qituvchining
  // "yuklamasi past" insight'i o'z-o'zidan yopilmasligi kerak.
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
