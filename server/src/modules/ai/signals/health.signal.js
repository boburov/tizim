import User from "../../../models/user.model.js";
import Lead from "../../../models/lead.model.js";
import Group from "../../../models/group.model.js";
import GroupMembership from "../../../models/groupMembership.model.js";
import Insight from "../../../models/insight.model.js";
import {
  branchFilter,
  userBranchCondition,
} from "../../../helpers/branchContext.helper.js";
import { periodPulse, localDayStart, DAY_MS } from "./pulse.signal.js";
import {
  historicalCollectionRate,
  overdueSignal,
  cashflowSignal,
} from "./finance.signal.js";

// BIZNES SALOMATLIGI - beshta yo'nalish bo'yicha 0..100 ball.
//
// NEGA BALL KERAK: dashboardda 30 ta raqam bor va owner ularning
// qaysi biri "yomon" ekanini o'zi hisoblab chiqishi kerak edi. Ball bu
// ishni bir marta bajaradi: "Moliya 48" ni ko'rgan odam qayerga
// qarashni 1 soniyada biladi.
//
// NEGA BU XAVFLI VA QANDAY HIMOYALANGAN: ball - siqilgan ma'lumot,
// ya'ni u YOLG'ON ANIQLIK berishi oson. Uch qoida buni to'xtatadi:
//
//   1. Har bir ball yonida SABAB matni turadi ("To'lovlarning 84% i
//      yig'ilgan · 12 mln qarz"). Ballning o'zi hech qachon yolg'iz
//      ko'rsatilmaydi.
//   2. Ma'lumot yetarli bo'lmasa ball `null` - "0" EMAS. Nol ball
//      "juda yomon" degani, ma'lumotsizlik esa boshqa narsa.
//   3. Har bir tarkibiy qism o'z og'irligi bilan aralashtiriladi va
//      yo'q qismlar og'irligi qolganlarga QAYTA TAQSIMLANADI (blend).
//      Aks holda bitta yo'q ma'lumot butun yo'nalishni pastga tortardi.
//
// CHEGARALAR (benchmark) O'QUV MARKAZI uchun tanlangan va har birining
// izohi bor - "sanoat standarti" degan mavhum gapga tayanmaydi.

const HEALTH_WEIGHTS = {
  finance: 0.3,
  students: 0.3,
  teachers: 0.2,
  marketing: 0.1,
  sales: 0.1,
};

const clamp = (n, min = 0, max = 100) => Math.max(min, Math.min(max, n));

/**
 * Og'irlikli o'rtacha - `null` qismlar TASHLAB YUBORILADI va ularning
 * og'irligi qolganlarga qayta taqsimlanadi.
 *
 * @param {Array<{value: number|null, weight: number}>} parts
 * @returns {number|null} null = birorta ham qism hisoblanmadi
 */
const blend = (parts) => {
  const usable = parts.filter((p) => p.value != null && Number.isFinite(p.value));
  if (!usable.length) return null;
  const total = usable.reduce((s, p) => s + p.weight, 0);
  if (total <= 0) return null;
  return Math.round(usable.reduce((s, p) => s + p.value * p.weight, 0) / total);
};

/**
 * Ball → daraja. UI rangni SHU YERDAN oladi, o'zi qayta hisoblamaydi -
 * aks holda chegaralar ikki joyda yashab, jimgina ayrilib ketardi.
 */
export const healthLevel = (score) => {
  if (score == null) return "unknown";
  if (score >= 75) return "good";
  if (score >= 50) return "warning";
  return "critical";
};

/** Chiziqli normallashtirish: `good` qiymatda 100, `bad` qiymatda 0. */
const scale = (value, bad, good) => {
  if (value == null || !Number.isFinite(value)) return null;
  if (good === bad) return null;
  return clamp(((value - bad) / (good - bad)) * 100);
};

const pct = (v) => (v == null ? null : Math.round(v * 100));

/**
 * BESHTA YO'NALISH BO'YICHA SALOMATLIK.
 *
 * MUHIM: filial kontekstI ICHIDA chaqirilishi kerak - barcha so'rovlar
 * branchFilter() / userBranchCondition() orqali ko'lamlanadi.
 *
 * @param {Date} now
 * @returns {Promise<{overall: object, domains: object[]}>}
 */
export const businessHealth = async (now = new Date()) => {
  const todayStart = localDayStart(now);
  const win30 = { start: new Date(todayStart.getTime() - 30 * DAY_MS), end: todayStart };
  const win60 = { start: new Date(todayStart.getTime() - 60 * DAY_MS), end: win30.start };

  const userCond = userBranchCondition();
  const withUserBranch = (base) => (userCond ? { $and: [base, userCond] } : base);

  const [
    pulse30,
    prior30,
    collection,
    overdue,
    cashflow,
    teacherCount,
    activeStudents,
    churnOpen,
    leadPipeline,
  ] = await Promise.all([
    periodPulse(win30),
    periodPulse(win60),
    historicalCollectionRate(now),
    overdueSignal(now),
    cashflowSignal(now),
    User.countDocuments(
      withUserBranch({ role: "teacher", isActive: true, isDeleted: { $ne: true } }),
    ),
    activeStudentCount(),
    Insight.countDocuments({
      ...branchFilter(),
      kind: "student_churn_risk",
      status: { $in: ["open", "acked"] },
    }),
    openLeadDiscipline(todayStart),
  ]);

  const domains = [
    financeDomain({ collection, overdue, cashflow }),
    studentDomain({ pulse30, activeStudents, churnOpen }),
    teacherDomain({ pulse30, teacherCount, activeStudents }),
    marketingDomain({ pulse30, prior30, activeStudents }),
    salesDomain({ pulse30, prior30, leadPipeline }),
  ];

  const overall = blend(
    domains.map((d) => ({ value: d.score, weight: HEALTH_WEIGHTS[d.key] })),
  );

  return {
    overall: {
      score: overall,
      level: healthLevel(overall),
      // Nechta yo'nalish haqiqatan hisoblandi - "72 ball" ning ostidagi
      // asos. 5 dan 2 tasi bo'lsa owner buni bilishi kerak.
      covered: domains.filter((d) => d.score != null).length,
      total: domains.length,
    },
    domains,
    // XOM AGREGATLAR - brifing KPI kartalarini SHU YERDAN quradi.
    //
    // Nega qaytariladi: KPI'lar ham, ballar ham AYNAN bir xil sonlarga
    // tayanadi (30 kunlik puls, qarz, kassa, faol o'quvchilar). Ularni
    // ikki marta so'rash bir xil javob uchun ikki barobar yuklama
    // bo'lardi - va yomoni, ikki so'rov orasida ma'lumot o'zgarsa
    // "Moliya 48" bali yonidagi KPI boshqa raqam ko'rsatardi.
    //
    // Bu blok mijozga UZATILMAYDI (briefing.service uni ishlatib,
    // javobdan chiqarib tashlaydi) - u ichki hisob-kitob materiali.
    raw: {
      pulse30,
      prior30,
      collection,
      overdue,
      cashflow,
      teacherCount,
      activeStudents,
      churnOpen,
      leadPipeline,
      window: win30,
    },
  };
};

/** Filialdagi faol o'quvchilar soni (ochiq guruh a'zoligi bo'yicha). */
const activeStudentCount = async () => {
  const groups = await Group.find({ ...branchFilter(), isDeleted: false, isActive: true })
    .select("_id")
    .lean();
  if (!groups.length) return 0;
  const ids = await GroupMembership.distinct("student", {
    group: { $in: groups.map((g) => g._id) },
    leftAt: null,
    isDeleted: false,
  });
  return ids.length;
};

/** Ochiq lidlar va ulardan qanchasining bog'lanish muddati o'tgan. */
const openLeadDiscipline = async (todayStart) => {
  const base = { ...branchFilter(), status: { $nin: ["enrolled", "rejected"] } };
  const [open, overdue] = await Promise.all([
    Lead.countDocuments(base),
    Lead.countDocuments({ ...base, followUpAt: { $ne: null, $lt: todayStart } }),
  ]);
  return { open, overdue };
};

// --- MOLIYA -----------------------------------------------------------
//
// Uch savol: pul KELDIMI (yig'ish darajasi), qancha pul OSILIB qoldi
// (qarz), va oy ichida kirim chiqimni QOPLAYAPTIMI (kassa).
const financeDomain = ({ collection, overdue, cashflow }) => {
  // Oxirgi 3 tugagan oyning O'RTACHA kutilgan daromadi - qarzni shunga
  // nisbatan o'lchaymiz. "12 mln qarz" o'zi hech narsa demaydi: oylik
  // aylanmasi 15 mln bo'lsa bu falokat, 300 mln bo'lsa shovqin.
  const monthlyExpected =
    collection.months > 0 ? collection.expected / collection.months : 0;

  const collectionScore = collection.months > 0 ? pct(collection.rate) : null;

  // Bir OYLIK aylanmaga teng qarz = 0 ball. Yarmi = 50 ball.
  const overdueRatio = monthlyExpected > 0 ? overdue.amount / monthlyExpected : null;
  const overdueScore = scale(overdueRatio, 1, 0);

  // Kassa: joriy oyda kirim chiqimdan ko'pmi. Nisbat 1.0 = tenglashgan.
  const cashRatio =
    cashflow.outflow > 0 ? cashflow.inflow / cashflow.outflow : cashflow.inflow > 0 ? 2 : null;
  // 0.8 da (chiqim kirimdan 25% ko'p) 0 ball, 1.3 da to'liq ball.
  const cashScore = scale(cashRatio, 0.8, 1.3);

  const drivers = [];
  if (collectionScore != null) {
    drivers.push({ label: "Yig'ish darajasi", value: `${collectionScore}%` });
  }
  if (overdue.amount > 0) {
    drivers.push({ label: "Muddati o'tgan qarz", value: overdue.amount, unit: "so'm" });
  }
  if (cashRatio != null) {
    drivers.push({
      label: "Kirim / chiqim",
      value: `${Math.round(cashRatio * 100)}%`,
    });
  }

  return {
    key: "finance",
    label: "Moliya",
    score: blend([
      { value: collectionScore, weight: 0.45 },
      { value: overdueScore, weight: 0.35 },
      { value: cashScore, weight: 0.2 },
    ]),
    note: financeNote({ collectionScore, overdue, cashRatio }),
    drivers,
    href: "/owner/finance/accounting",
  };
};

const financeNote = ({ collectionScore, overdue, cashRatio }) => {
  if (collectionScore == null && !overdue.amount) return "Moliya tarixi hali yig'ilmagan.";
  if (cashRatio != null && cashRatio < 1) {
    return "Bu oyda chiqim kirimdan oshdi — qarz yig'ishni tezlashtiring.";
  }
  if (overdue.students > 0) {
    return `${overdue.students} o'quvchining to'lovi muddatidan kechikkan.`;
  }
  if (collectionScore != null && collectionScore < 90) {
    return `Kutilgan to'lovlarning ${100 - collectionScore}% i yig'ilmay qolmoqda.`;
  }
  return "To'lovlar rejadagidek yig'ilmoqda.";
};

// --- O'QUVCHILAR ------------------------------------------------------
//
// Uch savol: darsga KELISHYAPTIMI, soni O'SYAPTIMI, va qanchasi ketish
// arafasida.
const studentDomain = ({ pulse30, activeStudents, churnOpen }) => {
  // Kamida 20 ta yozuv bo'lmasa davomat foizi tasodifiy son.
  const attendanceScore =
    pulse30.attendance.marked >= 20 ? pct(pulse30.attendance.rate) : null;

  const net = pulse30.students.joined - pulse30.students.left;
  // Bazaning 5% iga teng oylik o'sish = to'liq ball, 5% qisqarish = 0.
  const netRatio = activeStudents > 0 ? net / activeStudents : null;
  const flowScore = scale(netRatio, -0.05, 0.05);

  // Bazaning 15% i ketish xavfida = 0 ball. Bu qattiq chegara: o'quv
  // markazida har oyda 15% o'quvchi ketsa biznes bir yilda yopiladi.
  const churnRatio = activeStudents > 0 ? churnOpen / activeStudents : null;
  const churnScore = scale(churnRatio, 0.15, 0);

  const drivers = [];
  if (attendanceScore != null) {
    drivers.push({ label: "Davomat", value: `${attendanceScore}%` });
  }
  drivers.push({
    label: "30 kunlik oqim",
    value: `${net >= 0 ? "+" : "−"}${Math.abs(net)}`,
  });
  if (churnOpen > 0) {
    drivers.push({ label: "Ketish xavfida", value: `${churnOpen} ta` });
  }

  return {
    key: "students",
    label: "O'quvchilar",
    score: blend([
      { value: attendanceScore, weight: 0.4 },
      { value: flowScore, weight: 0.3 },
      { value: churnScore, weight: 0.3 },
    ]),
    note: studentNote({ attendanceScore, net, churnOpen, pulse30 }),
    drivers,
    href: "/owner/students",
  };
};

const studentNote = ({ attendanceScore, net, churnOpen, pulse30 }) => {
  if (attendanceScore == null && !pulse30.students.joined && !pulse30.students.left) {
    return "Oxirgi 30 kunda harakat qayd etilmadi.";
  }
  if (net < 0) {
    return `30 kunda ${pulse30.students.left} o'quvchi ketdi, ${pulse30.students.joined} tasi qo'shildi.`;
  }
  if (churnOpen > 0) {
    return `${churnOpen} o'quvchi ketish xavfi ro'yxatida — ular bilan ishlash kerak.`;
  }
  if (attendanceScore != null && attendanceScore < 85) {
    return `Har 100 darsdan ${100 - attendanceScore} tasi qoldirilmoqda.`;
  }
  return "O'quvchilar bazasi barqaror.";
};

// --- O'QITUVCHILAR ----------------------------------------------------
//
// Uch savol: darsga CHIQYAPTIMI, ular haqida SHIKOYAT bormi, shikoyatlar
// YOPILYAPTIMI.
const teacherDomain = ({ pulse30, teacherCount, activeStudents }) => {
  const misses = pulse30.teachers.hrAbsences + pulse30.teachers.missedLessons;
  // Har bir o'qituvchiga oyiga 3 ta o'tkazilmagan dars = 0 ball.
  const perTeacher = teacherCount > 0 ? misses / teacherCount : null;
  const reliabilityScore = scale(perTeacher, 3, 0);

  // Har 100 o'quvchiga 5 ta shikoyat = 0 ball.
  const per100 = activeStudents > 0 ? (pulse30.complaints.created / activeStudents) * 100 : null;
  const complaintScore = scale(per100, 5, 0);

  const unresolved = pulse30.complaints.created - pulse30.complaints.resolved;
  const resolutionScore =
    pulse30.complaints.created >= 3
      ? pct(pulse30.complaints.resolved / pulse30.complaints.created)
      : null;

  const drivers = [];
  if (teacherCount > 0) {
    drivers.push({ label: "O'qituvchilar", value: `${teacherCount} ta` });
  }
  if (misses > 0) {
    drivers.push({ label: "O'tkazilmagan dars", value: `${misses} ta` });
  }
  if (pulse30.complaints.created > 0) {
    drivers.push({
      label: "Shikoyatlar",
      value: `${pulse30.complaints.created} ta`,
    });
  }

  return {
    key: "teachers",
    label: "O'qituvchilar",
    score: blend([
      { value: reliabilityScore, weight: 0.45 },
      { value: complaintScore, weight: 0.35 },
      { value: resolutionScore, weight: 0.2 },
    ]),
    note: teacherNote({ teacherCount, misses, unresolved, pulse30 }),
    drivers,
    href: "/owner/teachers",
  };
};

const teacherNote = ({ teacherCount, misses, unresolved, pulse30 }) => {
  if (!teacherCount) return "Filialda faol o'qituvchi topilmadi.";
  if (misses > 0) {
    return `30 kunda ${misses} dars o'tkazilmadi (${pulse30.teachers.affectedTeachers} o'qituvchi).`;
  }
  if (unresolved > 0) {
    return `${unresolved} shikoyat hali yopilmagan.`;
  }
  return "Darslar jadval bo'yicha o'tmoqda.";
};

// --- MARKETING --------------------------------------------------------
//
// Ikki savol: yangi lid OQIMI o'sdimi, va u bazaga nisbatan YETARLIMI.
const marketingDomain = ({ pulse30, prior30, activeStudents }) => {
  const created = pulse30.leads.created;
  const before = prior30.leads.created;

  const trend = before > 0 ? (created - before) / before : null;
  // −25% = 0 ball, +25% = 100 ball.
  const trendScore = scale(trend, -0.25, 0.25);

  // Oyiga bazaning 12% iga teng yangi lid = sog'lom voronka. Sabab:
  // o'quv markazida oylik chiqib ketish odatda 4-8%, ya'ni shunchasini
  // qoplash uchun konversiyani hisobga olib 2 barobar ko'p lid kerak.
  const coverage = activeStudents > 0 ? created / activeStudents : null;
  const coverageScore = scale(coverage, 0, 0.12);

  const drivers = [
    { label: "30 kunlik lid", value: `${created} ta` },
    ...(before > 0
      ? [{ label: "Oldingi 30 kun", value: `${before} ta` }]
      : []),
  ];

  return {
    key: "marketing",
    label: "Marketing",
    score: blend([
      { value: trendScore, weight: 0.5 },
      { value: coverageScore, weight: 0.5 },
    ]),
    note: marketingNote({ created, before, trend }),
    drivers,
    href: "/owner/leads/statistika",
  };
};

const marketingNote = ({ created, before, trend }) => {
  if (!created && !before) return "Oxirgi 60 kunda yangi lid kelmadi.";
  if (trend != null && trend <= -0.2) {
    return `Lid oqimi ${Math.abs(Math.round(trend * 100))}% pasaydi — reklamani tekshiring.`;
  }
  if (trend != null && trend >= 0.2) {
    return `Lid oqimi ${Math.round(trend * 100)}% oshdi.`;
  }
  return `Oxirgi 30 kunda ${created} ta yangi lid keldi.`;
};

// --- SOTUV ------------------------------------------------------------
//
// Ikki savol: lid o'quvchiga AYLANYAPTIMI, va navbatdagi lidlar bilan
// VAQTIDA bog'lanilyaptimi.
const salesDomain = ({ pulse30, prior30, leadPipeline }) => {
  const created = pulse30.leads.created + prior30.leads.created;
  const enrolled = pulse30.leads.enrolled + prior30.leads.enrolled;

  // 5 tadan kam lid ustida konversiya hisoblash yolg'on aniqlik.
  const conversion = created >= 5 ? enrolled / created : null;
  // 30% konversiya = to'liq ball (o'quv markazi uchun kuchli natija).
  const conversionScore = scale(conversion, 0, 0.3);

  // Muddati o'tgan bog'lanishlar ulushi: yarmi o'tgan bo'lsa 0 ball.
  const overdueShare = leadPipeline.open > 0 ? leadPipeline.overdue / leadPipeline.open : null;
  const disciplineScore = scale(overdueShare, 0.5, 0);

  const drivers = [];
  if (conversion != null) {
    drivers.push({ label: "Konversiya", value: `${pct(conversion)}%` });
  }
  drivers.push({ label: "Ochiq lid", value: `${leadPipeline.open} ta` });
  if (leadPipeline.overdue > 0) {
    drivers.push({ label: "Muddati o'tgan", value: `${leadPipeline.overdue} ta` });
  }

  return {
    key: "sales",
    label: "Sotuv",
    score: blend([
      { value: conversionScore, weight: 0.6 },
      { value: disciplineScore, weight: 0.4 },
    ]),
    note: salesNote({ conversion, created, enrolled, leadPipeline }),
    drivers,
    href: "/owner/leads",
  };
};

const salesNote = ({ conversion, created, enrolled, leadPipeline }) => {
  if (conversion == null) return "Konversiya uchun lid soni yetarli emas.";
  if (leadPipeline.overdue > 0) {
    return `${leadPipeline.overdue} lid bilan bog'lanish muddati o'tgan.`;
  }
  if (conversion < 0.15) {
    return `60 kunda ${created} liddan ${enrolled} tasi yozildi — voronkani ko'rib chiqing.`;
  }
  return `Har 100 liddan ${pct(conversion)} tasi o'quvchiga aylanmoqda.`;
};
