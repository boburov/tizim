import mongoose from "mongoose";
import User from "../../../models/user.model.js";
import Group from "../../../models/group.model.js";
import GroupMembership from "../../../models/groupMembership.model.js";
import StudentPayment from "../../../models/studentPayment.model.js";
import { DEFAULT_THRESHOLDS } from "../../../models/aiConfig.model.js";
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

// Prioritet formulasi, upsert va eskirganni yopish mantiqi
// insightWriter.service.js ga ko'chirildi - u yerda BARCHA domenlar uchun
// bitta yo'l bor. Ilgari bu yerda turgan nusxa har yangi detektorda
// takrorlanardi va ertami-kechmi bittasida noto'g'ri qilinardi.

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
      // DIQQAT: bu yerda `/owner/students/${sid}?tab=finance` turardi va u
      // 404 qaytarardi - marshrut jadvalida `students/:id` UMUMAN YO'Q
      // (`students` ostida faqat statik tablar bor: tolovlar, qarzdorlar,
      // statistika, chiqib-ketish). O'quvchining to'lov tarixi aslida
      // alohida sahifada ochiladi.
      //
      // Bu xato eng zararli turdagi xato edi: karta ishonchli ko'rinardi,
      // "Ishingni ko'rsat" tugmasi bor edi, lekin bosilganda owner 404
      // olardi - ya'ni AI aynan tekshirib bo'lmaydigan da'vo qilib turardi.
      // Endi havolalar test bilan qulflangan (aiAdvisor.test.js, 17-bo'lim).
      href: `/owner/finance/student-payments/student/${sid}`,
    });
  }
  return refs;
};

// Mongo $dayOfWeek: 1=yakshanba ... 7=shanba.
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

/**
 * DETEKTOR: tez o'sayotgan o'quvchi (imkoniyat).
 *
 * NEGA KERAK: tizim faqat yomon xabar bergan sahifa bo'lib qolsa, owner
 * uni ochishni to'xtatadi. "Kim yaxshi ishlayapti" ham qaror uchun kerak -
 * bu o'quvchilar guvohnoma/rag'bat uchun nomzod va ular haqida ota-onaga
 * xabar berish eng arzon ushlab qolish (retention) vositasi.
 *
 * XOM BAHO EMAS, O'SISH: 5 ball bilan kelgan o'quvchi "yaxshi", lekin u
 * markazning hissasi emas. 3.1 dan 4.4 ga ko'tarilgan o'quvchi - hissa.
 */
const detectImproving = ({ subjectLabel, signals, thresholds }) => {
  const { grades, attendance } = signals;
  if (!grades.improvement || grades.improvement < 0.4) return null;
  // Baho namunasi kichik bo'lsa o'sish tasodifiy bo'lishi mumkin.
  if ((grades.count || 0) < 6) return null;
  // Davomati past bo'lsa "o'sish" ishonchsiz: kam dars, kam baho.
  if (attendance.recentRate == null || attendance.recentRate < 0.7) return null;

  const factors = buildFactors([
    {
      key: "gradeImprovement",
      label: "Baho o'sishi",
      value: Number(grades.improvement.toFixed(2)),
      unit: "ball",
      // 1.5 ball o'sish (1-5 shkalada) = to'liq signal.
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
    // Imkoniyat, lekin PUL ta'siri yo'q: bu o'quvchini "ushlab qolish
    // daromadi" deb hisoblash xavf summalarini shishirardi.
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

/**
 * DETEKTOR: g'ayrioddiy davomat naqshi (kuzatuv).
 *
 * "Aynan dushanbalarni qoldiradi" - umumiy davomat foizidan BOSHQA signal.
 * 80% davomatli o'quvchi yaxshi ko'rinadi, lekin qoldirgan 20% i bitta
 * kunga to'plangan bo'lsa bu TIZIMLI muammo (ish, transport, boshqa
 * to'garak) - va tizimli muammoni JADVALNI o'zgartirib hal qilish mumkin.
 * Tasodifiy kasallikni esa yo'q.
 *
 * Shu insight "ertaga kim kelmasligi mumkin" ro'yxatining ham asosi:
 * briefing servisi o'quvchining eng yomon kunini ertangi kun bilan
 * taqqoslaydi.
 */
const detectAttendancePattern = ({ sid, subjectLabel, signals, thresholds }) => {
  const { weekday, attendance } = signals;
  if (!weekday.worstDay) return null;
  // Naqsh KUCHI: shu kun boshqa kunlardan qanchalik yomonroq. 15 punktdan
  // kam farq - tasodif.
  if (weekday.gap < 0.15) return null;
  // Kamida 2 marta qoldirgan bo'lishi kerak.
  if (weekday.worstAbsences < 2) return null;
  // Shu kun uchun kamida 4 kuzatuv (signal qatlamida ham filtrlangan).
  if (weekday.worstTotal < 4) return null;

  const dayName = DOW_LABELS[weekday.worstDay] || "shu kun";

  const factors = buildFactors([
    {
      key: "weekdayGap",
      label: "Naqsh kuchi",
      value: dayName,
      // 40 punkt farq = to'liq signal.
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

    // --- 2. TO'LOV XAVFI (churn'dan MUSTAQIL) ---
    // Muntazam qatnaydigan, lekin doim kechikib to'laydigan o'quvchi
    // yuqoridagi churn filtridan o'tmaydi - lekin pul oqimi uchun muhim.
    const payment = scorePaymentRisk(signals, config);

    if (payment.confidence < config.confidenceFloor) {
      stats.payment.skippedLowConfidence += 1;
    } else if (payment.severity !== "low") {
      stillOpen.payment_risk.add(sid);
      // Bu yerda xavf ostidagi pul = KUTILAYOTGAN QARZ (mavjud qarz +
      // joriy oy to'lovi), ketish yo'qotishi emas.
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

    // --- 3. TEZ O'SAYOTGAN O'QUVCHI (imkoniyat) ---
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

    // --- 4. DAVOMAT NAQSHI (kuzatuv) ---
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
