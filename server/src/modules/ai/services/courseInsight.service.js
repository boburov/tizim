import { collectCourseSignals } from "../signals/course.signal.js";
import { loadGroups } from "../signals/group.signal.js";
import { demandByDirection } from "../signals/lead.signal.js";
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

// KURS DETEKTORLARI:
//   1. course_attendance_drop - kursda davomat pasaydi (xavf)
//   2. course_demand          - talab yuqori, joy yo'q → guruh ochish (imkoniyat)
//   3. course_marketing       - kurs yaxshi ishlaydi, lekin lid kam (imkoniyat)
//
// Bu detektor "yana bitta IELTS kechki guruhi ochilsinmi?" va "CEFR uchun
// marketingni oshirish kerakmi?" degan savollarga javob beradi. Ikkalasi
// ham Course modeli va Course.leadDirection bog'lanishi tufayli mumkin -
// ular bo'lmasa savol umuman hisoblanmasdi.
//
// "Kursi belgilanmagan" guruhlar bucket'i ATAYLAB o'tkazib yuboriladi:
// u kurs emas, migratsiya qoldig'i. Unga tavsiya berish ("Kursi
// belgilanmagan kursiga yana guruh ochingiz") ma'nosiz bo'lardi.

const COURSE_KINDS = ["course_attendance_drop", "course_demand", "course_marketing"];

/** DETEKTOR 1: kursda davomat pasayishi. */
const detectAttendanceDrop = ({ course, sig, thresholds }) => {
  const { attendance, enrollment, revenue } = sig;
  if (attendance.recentRate == null || attendance.priorRate == null) return null;
  // 8% dan kam nisbiy pasayish - normal tebranish.
  if (attendance.drop < 0.08) return null;
  // Dars soni kam bo'lsa foiz ishonchsiz.
  if (attendance.lessons < 20) return null;

  const factors = buildFactors([
    {
      key: "courseAttendanceDrop",
      label: "Davomat pasayishi",
      value: Math.round(attendance.drop * 100),
      unit: "%",
      // 25% nisbiy pasayish = to'liq signal.
      normalized: norm(attendance.drop, 0.25),
      weight: 0.5,
    },
    {
      key: "attendanceRate",
      label: "Joriy davomat",
      value: Math.round(attendance.recentRate * 100),
      unit: "%",
      normalized: 1 - norm(attendance.recentRate, 0.9),
      weight: 0.25,
      direction: "neutral",
    },
    {
      key: "courseChurn",
      label: "Kursdan ketish darajasi",
      value: Math.round(enrollment.churnRate * 100),
      unit: "%",
      normalized: norm(enrollment.churnRate, 0.25),
      weight: 0.25,
    },
  ]);

  const score = weightedScore(factors);
  const confidence = sampleConfidence({
    observed: attendance.lessons,
    minSample: 20,
    fullSample: 200,
  });

  // Ta'sir: davomat pasayishi ketishning oldingi ko'rsatkichi. Kursning
  // oylik daromadining pasayish ULUSHIGA teng deb baholanadi - taxminiy,
  // lekin tushunarli va ustuvorlikni to'g'ri tartiblaydi.
  const atRisk = Math.round(revenue.expected * attendance.drop);

  return {
    kind: "course_attendance_drop",
    subjectId: course._id,
    subjectLabel: course.title,
    title: `${course.title} kursida davomat ${Math.round(attendance.drop * 100)}% pasaydi`,
    severity: severityFor(score, thresholds),
    score,
    confidence,
    factors,
    expectedImpact: {
      amount: atRisk,
      currency: "UZS",
      label: atRisk ? `${fmtMoney(atRisk)} so'm oylik daromad xavf ostida` : "",
    },
    sourceRefs: [
      {
        model: "Attendance",
        ids: attendance.absentIds,
        total: attendance.lessons,
        href: "/owner/attendance",
      },
    ],
    recommendedActions: [
      {
        key: "review_course_teachers",
        label: `${enrollment.groups} guruh o'qituvchilari bilan yig'ilish o'tkazing`,
        dueInDays: 7,
      },
      {
        key: "survey_course_students",
        label: "Kurs o'quvchilaridan fikr-mulohaza to'plang",
        dueInDays: 14,
      },
    ],
    narration: narrate({
      headline:
        `${course.title} kursida davomat ${Math.round(attendance.priorRate * 100)}% dan ` +
        `${Math.round(attendance.recentRate * 100)}% ga tushdi ` +
        `(${enrollment.groups} guruh, ${enrollment.active} o'quvchi).`,
      factors,
      expectedImpact: { amount: atRisk },
      confidence,
      stance: "risk",
    }),
  };
};

/**
 * DETEKTOR 2: talab yuqori → yangi guruh ochish.
 *
 * Ikki shart BIRGA bo'lishi kerak:
 *   (a) yo'nalishda javob kutayotgan lidlar bor (talab)
 *   (b) mavjud guruhlar to'lgan (joy yo'q)
 * Faqat (a) bo'lsa - lidlar bilan ishlash kerak, yangi guruh emas.
 * Faqat (b) bo'lsa - guruhlar to'la, lekin yangi mijoz yo'q.
 * Aynan shu ikki shartning kesishmasi "yana guruh ochish" qarorini
 * asoslaydi.
 */
const detectDemand = ({ course, sig, demand, medianGroupSize, thresholds }) => {
  if (!demand || demand.open < 3) return null;
  const { enrollment } = sig;
  if (enrollment.groups === 0) return null;

  // Guruhlar to'lganmi: o'rtacha guruh hajmi filial medianasidan yuqori.
  const fullness = medianGroupSize > 0 ? enrollment.avgGroupSize / medianGroupSize : 0;
  if (fullness < 0.9) return null;

  const factors = buildFactors([
    {
      key: "demandOpen",
      label: "Javob kutayotgan lidlar",
      value: demand.open,
      unit: "ta",
      // 10 lid = to'liq signal (bir guruhga yetadi).
      normalized: norm(demand.open, 10),
      weight: 0.45,
      direction: "good",
    },
    {
      key: "avgGroupSize",
      label: "Guruhlarning to'ldirilishi",
      value: Math.round(enrollment.avgGroupSize),
      unit: "o'quvchi",
      normalized: norm(fullness, 1.3),
      weight: 0.3,
      direction: "good",
    },
    {
      key: "demandTotal",
      label: "30 kunlik lid oqimi",
      value: demand.total,
      unit: "ta",
      normalized: norm(demand.total, 25),
      weight: 0.25,
      direction: "good",
    },
  ]);

  const score = weightedScore(factors);
  const confidence = sampleConfidence({
    observed: demand.total,
    minSample: 4,
    fullSample: 30,
  });

  // Kutilayotgan qo'shimcha daromad: kutayotgan lidlar × bir o'quvchidan
  // o'rtacha daromad × yo'nalishning tarixiy konversiyasi.
  const upside = Math.round(
    demand.open * (sig.revenue.revenuePerStudent || 0) * Math.max(0.2, demand.conversionRate),
  );

  return {
    kind: "course_demand",
    subjectId: course._id,
    subjectLabel: course.title,
    title: `${course.title} — ${demand.open} lid kutmoqda, guruhlar to'lgan`,
    severity: severityFor(score, thresholds) === "high" ? "medium" : "low",
    score,
    confidence,
    factors,
    expectedImpact: {
      amount: upside,
      currency: "UZS",
      label: upside ? `Yangi guruh oyiga ~${fmtMoney(upside)} so'm qo'shishi mumkin` : "",
    },
    sourceRefs: [
      {
        model: "Lead",
        ids: [],
        total: demand.total,
        href: "/owner/leads/statistika",
      },
    ],
    recommendedActions: [
      {
        key: "open_new_group",
        label: `${course.title} uchun yangi guruh ochishni rejalashtiring`,
        dueInDays: 21,
      },
      {
        key: "contact_waiting_leads",
        label: `Kutayotgan ${demand.open} lid bilan bog'lanib vaqtni aniqlang`,
        dueInDays: 5,
      },
    ],
    narration: narrate({
      headline:
        `${course.title} yo'nalishida oxirgi 30 kunda ${demand.total} lid keldi, ` +
        `${demand.open} tasi hali javob kutmoqda. Mavjud ${enrollment.groups} guruhning ` +
        `o'rtacha to'ldirilishi ${Math.round(enrollment.avgGroupSize)} o'quvchi ` +
        `(filial medianasi ${medianGroupSize}).`,
      factors,
      expectedImpact: { amount: upside },
      confidence,
      stance: "opportunity",
    }),
  };
};

/**
 * DETEKTOR 3: marketing imkoniyati.
 *
 * Kurs YAXSHI ishlaydi (davomat yuqori, ketish past, bir o'quvchidan
 * daromad yaxshi), lekin LID OQIMI past yoki guruhlar to'lmagan.
 * Ya'ni mahsulot yaxshi, talab yetishmayapti - bu marketing masalasi.
 *
 * Teskari holatni (lid ko'p, mahsulot yomon) marketing bilan hal qilish
 * pulni yo'qotish bo'lardi, shuning uchun sifat sharti MAJBURIY.
 */
const detectMarketing = ({ course, sig, demand, medianGroupSize, thresholds }) => {
  const { attendance, enrollment, revenue } = sig;
  // Sifat sharti: davomat yaxshi va ketish past.
  if (attendance.recentRate == null || attendance.recentRate < 0.8) return null;
  if (enrollment.churnRate > 0.15) return null;
  if (attendance.lessons < 20) return null;
  if (enrollment.groups === 0) return null;

  // Joy bor: guruhlar medianadan bo'sh.
  const fullness = medianGroupSize > 0 ? enrollment.avgGroupSize / medianGroupSize : 1;
  if (fullness > 0.85) return null;
  // Lid oqimi ham past bo'lishi kerak - aks holda muammo marketingda emas,
  // konversiyada.
  const leadFlow = demand?.total || 0;
  if (leadFlow > 15) return null;

  const factors = buildFactors([
    {
      key: "attendanceRate",
      label: "Kurs davomati",
      value: Math.round(attendance.recentRate * 100),
      unit: "%",
      normalized: norm(attendance.recentRate, 1),
      weight: 0.3,
      direction: "good",
    },
    {
      key: "courseChurn",
      label: "Ketish darajasi",
      value: Math.round(enrollment.churnRate * 100),
      unit: "%",
      normalized: 1 - norm(enrollment.churnRate, 0.15),
      weight: 0.25,
      direction: "good",
    },
    {
      key: "avgGroupSize",
      label: "Bo'sh joy bor",
      value: Math.round(enrollment.avgGroupSize),
      unit: "o'quvchi",
      normalized: 1 - norm(fullness, 1),
      weight: 0.25,
      direction: "good",
    },
    {
      key: "demandTotal",
      label: "30 kunlik lid oqimi",
      value: leadFlow,
      unit: "ta",
      normalized: 1 - norm(leadFlow, 15),
      weight: 0.2,
      direction: "neutral",
    },
  ]);

  const score = weightedScore(factors);
  const confidence = sampleConfidence({
    observed: attendance.lessons,
    minSample: 20,
    fullSample: 150,
    // Lid ma'lumoti bo'lmasa xulosa zaifroq: yo'nalish bog'lanmagan
    // bo'lishi mumkin (Course.leadDirection null).
    consistency: demand ? 1 : 0.6,
  });

  const capacity = Math.max(0, Math.round((medianGroupSize - enrollment.avgGroupSize) * enrollment.groups));
  const upside = Math.round(capacity * (revenue.revenuePerStudent || 0));

  return {
    kind: "course_marketing",
    subjectId: course._id,
    subjectLabel: course.title,
    title: `${course.title} yaxshi ishlaydi, lekin bo'sh joy bor — marketing imkoniyati`,
    severity: "low",
    score,
    confidence,
    factors,
    expectedImpact: {
      amount: upside,
      currency: "UZS",
      label: upside
        ? `${capacity} bo'sh joy = oyiga ~${fmtMoney(upside)} so'm`
        : "",
    },
    sourceRefs: [
      {
        model: "Attendance",
        ids: [],
        total: attendance.lessons,
        href: "/owner/attendance",
      },
    ],
    recommendedActions: [
      {
        key: "increase_marketing",
        label: `${course.title} uchun marketingni kuchaytiring — mahsulot ko'rsatkichlari yaxshi`,
        dueInDays: 30,
      },
      ...(demand
        ? []
        : [
            {
              key: "link_course_direction",
              label: "Kursni lid yo'nalishiga bog'lang — konversiyani o'lchash uchun",
              dueInDays: 14,
            },
          ]),
    ],
    narration: narrate({
      headline:
        `${course.title} kursida davomat ${Math.round(attendance.recentRate * 100)}%, ` +
        `ketish ${Math.round(enrollment.churnRate * 100)}% — ko'rsatkichlar yaxshi. ` +
        `Lekin guruhlarda ${capacity} bo'sh joy bor va oxirgi 30 kunda faqat ${leadFlow} lid keldi.`,
      factors,
      expectedImpact: { amount: upside },
      confidence,
      stance: "opportunity",
    }),
  };
};

/**
 * Bitta filial uchun kurs insight'larini qayta hisoblaydi.
 *
 * @param {string} branchId
 * @param {Array} groups - guruh detektori allaqachon yuklagan ro'yxat
 *   (qayta o'qishdan qochish uchun). Berilmasa o'zi yuklaydi.
 * @param {number} medianGroupSize - filial medianasi (guruh detektoridan)
 */
export const recomputeCourseInsights = async (
  branchId,
  now = new Date(),
  { groups = null, medianGroupSize = 0 } = {},
) => {
  const config = await resolveConfig(branchId);
  const thresholds = readMap(config.thresholds, DEFAULT_THRESHOLDS);

  const groupList = groups || (await loadGroups(branchId));

  const stats = {
    scanned: 0,
    attendanceDrop: mkStats(),
    demand: mkStats(),
    marketing: mkStats(),
  };
  if (!groupList.length) return stats;

  const [{ signals }, demandRows] = await Promise.all([
    collectCourseSignals(groupList, now),
    demandByDirection(now),
  ]);

  // Yo'nalish → kurs bog'lanishi orqali talab ma'lumotini kursga ulaymiz.
  const demandByCourse = new Map();
  for (const d of demandRows) {
    if (d.course) demandByCourse.set(String(d.course._id), d);
  }

  const stillOpen = {
    course_attendance_drop: new Set(),
    course_demand: new Set(),
    course_marketing: new Set(),
  };

  for (const sig of signals.values()) {
    // "Kursi belgilanmagan" - kurs emas, migratsiya qoldig'i.
    const course = sig.bucket.course;
    if (!course) continue;
    stats.scanned += 1;

    const demand = demandByCourse.get(String(course._id)) || null;
    const ctx = { course, sig, demand, medianGroupSize, thresholds };

    const candidates = [
      { stat: "attendanceDrop", found: detectAttendanceDrop(ctx) },
      { stat: "demand", found: detectDemand(ctx) },
      { stat: "marketing", found: detectMarketing(ctx) },
    ];

    for (const { stat, found } of candidates) {
      if (!found) continue;
      await writeIfConfident({
        candidate: buildInsight({ branchId, now, ...found }),
        confidenceFloor: config.confidenceFloor,
        stats: stats[stat],
        stillOpen: stillOpen[found.kind],
      });
    }
  }

  for (const kind of COURSE_KINDS) {
    const closed = await closeStale(branchId, [kind], stillOpen[kind], now);
    const statKey =
      kind === "course_attendance_drop"
        ? "attendanceDrop"
        : kind === "course_demand"
          ? "demand"
          : "marketing";
    stats[statKey].closed = closed;
  }

  return stats;
};

export { COURSE_KINDS };
