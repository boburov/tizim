import prisma from "../../../config/prisma.js";
import { withLegacyId, withLegacyIds } from "../../../utils/serialize.js";
import { AI_ENGINE_VERSION } from "../../../constants/ai.js";
import ApiError from "../../../utils/ApiError.js";
import logger from "../../../config/logger.js";
import { parsePagination, buildMeta } from "../../../utils/pagination.js";
import { MONTH_NAMES_UZ } from "../../../constants/calendar.js";
import {
  runWithBranchContext,
  branchFilter,
} from "../../../helpers/branchContext.helper.js";
import {
  periodPulse,
  yesterdayWindow,
  lastWeekWindow,
  lastMonthWindow,
  localDayKey,
} from "../signals/pulse.signal.js";
import { revenueForecast, overdueSignal } from "../signals/finance.signal.js";
import { collectCourseSignals } from "../signals/course.signal.js";
import { loadGroups } from "../signals/group.signal.js";
import { fmtMoney } from "./insightWriter.service.js";

// HISOBOT DVIGATELI - kunlik / haftalik / oylik.
//
// UCHTA DAVR, BITTA MANBA: hamma hisobot periodPulse() dan o'qiydi,
// faqat oyna boshqa. Har biri o'z aggregation'ini yozsa, ularning
// raqamlari ertami-kechmi bir-biriga zid bo'lardi va owner qaysi biriga
// ishonishni bilmasdi.
//
// FARQ - CHUQURLIK, ma'lumot emas:
//   daily   → nima bo'ldi (fakt + shoshilinch vazifalar)
//   weekly  → trend (o'tgan hafta bilan taqqoslash) + kurs kesimi
//   monthly → ijroiya xulosasi (bashorat + yopiq halqa natijalari)

// Oy nomlari umumiy konstantadan olinadi - "sentabr"/"sentyabr" kabi
// farqlar bir sahifada yonma-yon chiqmasligi uchun.
const MONTH_NAMES = MONTH_NAMES_UZ;

const pct = (v) => (v == null ? null : Math.round(v * 100));

const delta = (current, previous) => {
  if (previous == null || current == null || previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
};

const arrow = (d) => (d == null ? "" : d > 0 ? `+${d}%` : `${d}%`);

const metric = (key, label, value, unit, d = null, hint = "") => ({
  key,
  label,
  value,
  unit,
  delta: d,
  deltaDirection: d == null ? null : d > 0 ? "up" : d < 0 ? "down" : "flat",
  hint,
});

/** Davr kaliti va sarlavhasi - AiReport.periodKey idempotentlik uchun. */
export const periodMeta = (period, now = new Date()) => {
  if (period === "daily") {
    const w = yesterdayWindow(now);
    const key = localDayKey(w.start);
    const d = new Date(w.start);
    return {
      ...w,
      periodKey: key,
      title: `${d.getUTCDate()}-${MONTH_NAMES[d.getUTCMonth()]} kunlik hisoboti`,
    };
  }
  if (period === "weekly") {
    const w = lastWeekWindow(now);
    // ISO hafta raqami: yilning birinchi payshanbasiga tayanadi.
    const thursday = new Date(w.start.getTime() + 3 * 24 * 60 * 60 * 1000);
    const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
    const week = Math.ceil(((thursday - yearStart) / 86400000 + yearStart.getUTCDay() + 1) / 7);
    const from = new Date(w.start);
    const to = new Date(w.end.getTime() - 86400000);
    return {
      ...w,
      periodKey: `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`,
      title: `${from.getUTCDate()}–${to.getUTCDate()} ${MONTH_NAMES[to.getUTCMonth()]} haftalik hisoboti`,
    };
  }
  if (period === "monthly") {
    const w = lastMonthWindow(now);
    const d = new Date(w.start.getTime() + 86400000); // oy ichiga kirish
    return {
      ...w,
      periodKey: `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
      title: `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()} — ijroiya hisoboti`,
    };
  }
  throw new ApiError(400, "Noma'lum hisobot davri");
};

/** Oldingi (taqqoslash) davri - bir xil uzunlikda, darhol oldinda. */
const priorWindow = ({ start, end }) => ({
  start: new Date(start.getTime() - (end - start)),
  end: start,
});

/** MOLIYA bo'limi - barcha davrlarda bor. */
const financeSection = (pulse, prior) => {
  const revDelta = delta(pulse.revenue.collected, prior.revenue.collected);
  const lines = [];

  if (pulse.revenue.collected > 0) {
    lines.push(
      `${fmtMoney(pulse.revenue.collected)} so'm yig'ildi ` +
        `(${pulse.revenue.transactions} to'lov: ${fmtMoney(pulse.revenue.cash)} naqd, ` +
        `${fmtMoney(pulse.revenue.card)} karta).`,
    );
    if (revDelta != null) {
      lines.push(
        revDelta >= 0
          ? `Bu oldingi davrdan ${revDelta}% ko'p.`
          : `Bu oldingi davrdan ${Math.abs(revDelta)}% kam.`,
      );
    }
  } else {
    lines.push("Bu davrda to'lov qabul qilinmagan.");
  }

  if (pulse.expense.salaryPaid > 0) {
    lines.push(
      `Maosh xarajati ${fmtMoney(pulse.expense.salaryPaid)} so'm ` +
        `(${pulse.expense.transactions} tranzaksiya). ` +
        `Sof qoldiq: ${fmtMoney(pulse.net)} so'm.`,
    );
    // HALOL ESLATMA: tizimda faqat maosh chiqimi yozilади.
    lines.push(
      "Diqqat: tizimda faqat maosh chiqimi qayd etiladi — ijara va boshqa xarajatlar bu songa kirmaydi.",
    );
  }

  return {
    key: "finance",
    title: "Moliya",
    headline:
      pulse.revenue.collected > 0
        ? `${fmtMoney(pulse.revenue.collected)} so'm yig'ildi ${arrow(revDelta)}`
        : "To'lov bo'lmadi",
    metrics: [
      metric("collected", "Yig'ilgan", pulse.revenue.collected, "so'm", revDelta,
        `${pulse.revenue.transactions} to'lov`),
      metric("salaryPaid", "Maosh chiqimi", pulse.expense.salaryPaid, "so'm",
        delta(pulse.expense.salaryPaid, prior.expense.salaryPaid),
        `${pulse.expense.transactions} tranzaksiya`),
      metric("net", "Sof qoldiq", pulse.net, "so'm", delta(pulse.net, prior.net),
        "kirim − maosh"),
      metric("cash", "Naqd ulushi", pulse.revenue.collected > 0
        ? Math.round((pulse.revenue.cash / pulse.revenue.collected) * 100) : null, "%"),
    ],
    narration: lines.join(" "),
  };
};

/** DAVOMAT bo'limi. */
const attendanceSection = (pulse, prior) => {
  const rateDelta = delta(pulse.attendance.rate, prior.attendance.rate);
  const lines = [];

  if (pulse.attendance.marked > 0) {
    lines.push(
      `Davomat ${pct(pulse.attendance.rate)}% — ${pulse.attendance.present} keldi, ` +
        `${pulse.attendance.absent} kelmadi (${pulse.attendance.marked} yozuv).`,
    );
    if (rateDelta != null) {
      lines.push(
        rateDelta >= 0
          ? `Oldingi davrga nisbatan ${rateDelta}% yaxshilandi.`
          : `Oldingi davrga nisbatan ${Math.abs(rateDelta)}% pasaydi.`,
      );
    }
    if (pulse.attendance.excused > 0 || pulse.attendance.exempt > 0) {
      lines.push(
        `${pulse.attendance.excused} sababli, ${pulse.attendance.exempt} ozod qilingan — ` +
          "ular foizga kiritilmagan.",
      );
    }
    if (pulse.attendance.lateMinutes > 0) {
      lines.push(`Jami kechikish: ${pulse.attendance.lateMinutes} daqiqa.`);
    }
  } else {
    lines.push("Bu davrda davomat yozuvi yo'q.");
  }

  return {
    key: "attendance",
    title: "Davomat",
    headline:
      pulse.attendance.marked > 0
        ? `${pct(pulse.attendance.rate)}% davomat ${arrow(rateDelta)}`
        : "Yozuv yo'q",
    metrics: [
      metric("rate", "Davomat darajasi", pct(pulse.attendance.rate), "%", rateDelta,
        `${pulse.attendance.marked} yozuv`),
      metric("absent", "Kelmagan", pulse.attendance.absent, "ta",
        delta(pulse.attendance.absent, prior.attendance.absent)),
      metric("excused", "Sababli", pulse.attendance.excused, "ta"),
      metric("lateMinutes", "Kechikish", pulse.attendance.lateMinutes, "daqiqa",
        delta(pulse.attendance.lateMinutes, prior.attendance.lateMinutes)),
    ],
    narration: lines.join(" "),
  };
};

/** O'QUVCHILAR OQIMI bo'limi. */
const studentsSection = (pulse, prior) => {
  const net = pulse.students.joined - pulse.students.left;
  const lines = [
    `${pulse.students.joined} o'quvchi qo'shildi, ${pulse.students.left} ketdi ` +
      `(sof: ${net > 0 ? "+" : ""}${net}).`,
  ];
  if (pulse.students.graduated > 0) {
    lines.push(
      `${pulse.students.graduated} o'quvchi kursni tugatdi — bu ketish emas, muvaffaqiyat.`,
    );
  }
  if (pulse.students.transferred > 0) {
    lines.push(`${pulse.students.transferred} o'quvchi boshqa guruhga ko'chdi.`);
  }
  if (pulse.complaints.created > 0) {
    lines.push(
      `${pulse.complaints.created} shikoyat keldi, ${pulse.complaints.resolved} tasi yopildi.`,
    );
  }

  return {
    key: "students",
    title: "O'quvchilar oqimi",
    headline: `Sof oqim ${net > 0 ? "+" : ""}${net} o'quvchi`,
    metrics: [
      metric("joined", "Qo'shildi", pulse.students.joined, "ta",
        delta(pulse.students.joined, prior.students.joined)),
      metric("left", "Ketdi", pulse.students.left, "ta",
        delta(pulse.students.left, prior.students.left)),
      metric("graduated", "Tugatdi", pulse.students.graduated, "ta"),
      metric("complaints", "Shikoyat", pulse.complaints.created, "ta",
        delta(pulse.complaints.created, prior.complaints.created)),
    ],
    narration: lines.join(" "),
  };
};

/** LIDLAR bo'limi. */
const leadsSection = (pulse, prior) => {
  const conv = pulse.leads.created > 0 ? pulse.leads.enrolled / pulse.leads.created : null;
  const lines = [
    `${pulse.leads.created} yangi lid keldi, ${pulse.leads.enrolled} tasi yozildi, ` +
      `${pulse.leads.rejected} tasi rad etildi.`,
  ];
  if (conv != null && pulse.leads.created >= 5) {
    lines.push(
      `Shu davr kogortining konversiyasi ${pct(conv)}% — lekin lidlar qaror qilishga ` +
        "1-3 hafta oladi, shuning uchun bu son keyinchalik o'sadi.",
    );
  }

  return {
    key: "leads",
    title: "Lidlar",
    headline: `${pulse.leads.created} lid, ${pulse.leads.enrolled} yozilish`,
    metrics: [
      metric("created", "Yangi lid", pulse.leads.created, "ta",
        delta(pulse.leads.created, prior.leads.created)),
      metric("enrolled", "Yozilgan", pulse.leads.enrolled, "ta",
        delta(pulse.leads.enrolled, prior.leads.enrolled)),
      metric("rejected", "Rad etilgan", pulse.leads.rejected, "ta"),
      metric("conversion", "Kogort konversiyasi", pct(conv), "%"),
    ],
    narration: lines.join(" "),
  };
};

/** O'QITUVCHILAR bo'limi. */
const teachersSection = (pulse, prior) => {
  const total = pulse.teachers.hrAbsences + pulse.teachers.missedLessons;
  const lines =
    total > 0
      ? [
          `${pulse.teachers.affectedTeachers} o'qituvchi kelmadi: ` +
            `${pulse.teachers.missedLessons} dars o'tkazilmadi, ` +
            `${pulse.teachers.hrAbsences} ish kuni yo'q.`,
          "Diqqat: tizimda o'qituvchi KECHIKISHI qayd etilmaydi — faqat kelmagan kunlar.",
        ]
      : ["Barcha o'qituvchilar darslarga chiqdi."];

  return {
    key: "teachers",
    title: "O'qituvchilar",
    headline: total > 0 ? `${total} yo'qlik qayd etildi` : "Yo'qlik yo'q",
    metrics: [
      metric("missedLessons", "O'tkazilmagan dars", pulse.teachers.missedLessons, "ta",
        delta(pulse.teachers.missedLessons, prior.teachers.missedLessons)),
      metric("hrAbsences", "Ishga kelmagan kun", pulse.teachers.hrAbsences, "kun",
        delta(pulse.teachers.hrAbsences, prior.teachers.hrAbsences)),
      metric("affected", "Ta'sirlangan o'qituvchi", pulse.teachers.affectedTeachers, "ta"),
    ],
    narration: lines.join(" "),
  };
};

/** KURS KESIMI - faqat haftalik va oylik hisobotda (kunlik uchun juda shovqinli). */
const coursesSection = async (branchId, now) => {
  const groups = await loadGroups(branchId);
  if (!groups.length) return null;
  const { signals } = await collectCourseSignals(groups, now);
  if (!signals.size) return null;

  const rows = [...signals.values()]
    .filter((s) => s.bucket.course)
    .map((s) => ({
      title: s.bucket.course.title,
      students: s.enrollment.active,
      groups: s.enrollment.groups,
      attendance: s.attendance.recentRate,
      drop: s.attendance.drop,
      churn: s.enrollment.churnRate,
      revenue: s.revenue.expected,
      perStudent: s.revenue.revenuePerStudent,
    }))
    .sort((a, b) => b.revenue - a.revenue);
  if (!rows.length) return null;

  const best = rows.reduce((a, b) => (b.perStudent > a.perStudent ? b : a));
  const worst = rows.reduce((a, b) => (b.drop > a.drop ? b : a));

  const lines = [
    `${rows.length} kurs bo'yicha kesim. Eng yuqori o'quvchi qiymati: ${best.title} ` +
      `(${fmtMoney(best.perStudent)} so'm/o'quvchi).`,
  ];
  if (worst.drop > 0.08) {
    lines.push(
      `Eng katta davomat pasayishi: ${worst.title} — ${pct(worst.drop)}% ` +
        `(hozir ${pct(worst.attendance)}%).`,
    );
  }
  const unassigned = [...signals.values()].find((s) => !s.bucket.course);
  if (unassigned && unassigned.enrollment.active > 0) {
    lines.push(
      `${unassigned.enrollment.active} o'quvchi kursi belgilanmagan guruhlarda — ` +
        "ular kurs kesimiga kirmaydi.",
    );
  }

  return {
    key: "courses",
    title: "Kurslar",
    headline: `${rows.length} kurs, eng foydalisi: ${best.title}`,
    // Kurs jadvalining o'zi metrics ichida - frontend uni jadval qilib chizadi.
    metrics: rows.slice(0, 8).map((r) =>
      metric(
        r.title,
        r.title,
        r.students,
        "o'quvchi",
        r.drop > 0 ? -pct(r.drop) : null,
        `${pct(r.attendance)}% davomat · ${fmtMoney(r.revenue)} so'm`,
      ),
    ),
    narration: lines.join(" "),
  };
};

/**
 * BASHORAT bo'limi - faqat oylik ijroiya hisobotida.
 * Kunlik hisobotda bashorat ko'rsatish shovqin: u kun sayin o'zgarmaydi.
 */
const forecastSection = async (branchId, now) => {
  const [forecast, overdue] = await Promise.all([
    revenueForecast(branchId, now),
    overdueSignal(now),
  ]);

  const dropPct = Math.round(forecast.deltaRatio * 100);
  const lines = [
    `Keyingi oy bashorati: ${fmtMoney(forecast.forecastGross)} so'm ` +
      `(${dropPct > 0 ? "+" : ""}${dropPct}%). ` +
      `Hisob ${forecast.activeStudents} faol o'quvchi bazasidan chiqadi, ` +
      `ulardan ${forecast.riskyStudents} tasi ketish xavfida.`,
  ];
  if (overdue.amount > 0) {
    lines.push(
      `Yig'ilishi kerak bo'lgan muddati o'tgan qarz: ${fmtMoney(overdue.amount)} so'm ` +
        `(${overdue.students} o'quvchi, eng eskisi ${overdue.maxDebtDays} kun).`,
    );
  }

  return {
    key: "forecast",
    title: "Keyingi oy bashorati",
    headline: `${fmtMoney(forecast.forecastGross)} so'm kutilmoqda (${dropPct > 0 ? "+" : ""}${dropPct}%)`,
    metrics: [
      metric("forecastGross", "Bashorat", Math.round(forecast.forecastGross), "so'm", dropPct),
      metric("atRisk", "Xavf ostidagi", Math.round(forecast.atRisk), "so'm", null,
        `${forecast.riskyStudents} o'quvchi`),
      metric("collectionRate", "Yig'ish darajasi", pct(forecast.collectionRate), "%", null,
        `oxirgi ${forecast.collectionSample} oy`),
      metric("overdue", "Muddati o'tgan", overdue.amount, "so'm", null,
        `${overdue.students} o'quvchi`),
    ],
    narration: lines.join(" "),
  };
};

/**
 * YOPIQ HALQA bo'limi - faqat oylik hisobotda.
 *
 * "Sizga aytilgan 12 ta xavfli o'quvchidan 9 tasi qoldi" - bu MAHSULOTNI
 * QUTQARADIGAN bo'lim. Bashorat qilgan tizim o'z bashoratining natijasini
 * ko'rsatmasa, u shunchaki fikr generatori bo'lib qoladi.
 */
const outcomeSection = async ({ start, end }) => {
  // Guruhlash IKKI ustun bo'yicha - `insights` jadvalining O'Z ustunlari.
  const rows = await prisma.insight.groupBy({
    by: ["outcome", "status"],
    where: { ...branchFilter(), resolvedAt: { gte: start, lt: end } },
    _count: { _all: true },
  });

  let prevented = 0;
  let occurred = 0;
  let dismissed = 0;
  let doneByOwner = 0;
  for (const r of rows) {
    // `groupBy` natijasida kalitlar `_id` emas, USTUN NOMLARI; sanoq
    // esa `_count` ichida.
    const c = r._count._all;
    if (r.outcome === "prevented") prevented += c;
    if (r.outcome === "occurred") occurred += c;
    if (r.status === "dismissed") dismissed += c;
    if (r.status === "done") doneByOwner += c;
  }

  const total = prevented + occurred;
  const lines = [];
  if (total > 0) {
    lines.push(
      `Bu davrda yopilgan ${total} ta bashoratdan ${prevented} tasida xavf ` +
        `amalga oshmadi, ${occurred} tasida amalga oshdi.`,
    );
    lines.push(`Aniqlik: ${Math.round((prevented / total) * 100)}%.`);
  } else {
    lines.push("Bu davrda natijasi aniqlangan bashorat yo'q.");
  }
  if (dismissed > 0) {
    lines.push(
      `${dismissed} ta baho "to'g'ri emas" deb belgilandi — ular modelni ` +
        "kalibrlash uchun eng qimmatli signal.",
    );
  }

  return {
    section: {
      key: "outcomes",
      title: "Bashoratlar natijasi",
      headline:
        total > 0
          ? `${prevented}/${total} xavf oldi olindi`
          : "Natija hali aniqlanmagan",
      metrics: [
        metric("prevented", "Oldi olingan", prevented, "ta"),
        metric("occurred", "Amalga oshgan", occurred, "ta"),
        metric("doneByOwner", "Bajarilgan vazifa", doneByOwner, "ta"),
        metric("dismissed", "To'g'ri emas", dismissed, "ta"),
      ],
      narration: lines.join(" "),
    },
    snapshot: { prevented, occurred, resolvedByOwner: doneByOwner },
  };
};

/** Hisobot yopilgan paytdagi ochiq insight kesimi. */
const insightSnapshot = async () => {
  // `expectedImpact.amount` Mongo'da ichma-ich obyekt edi; Prisma'da
  // tekis ustun: `expectedImpactAmount`.
  const rows = await prisma.insight.groupBy({
    by: ["severity", "stance"],
    where: { ...branchFilter(), status: { in: ["open", "acked"] } },
    _count: { _all: true },
    _sum: { expectedImpactAmount: true },
  });
  const snap = { high: 0, medium: 0, opportunities: 0, impactAtRisk: 0 };
  for (const r of rows) {
    const c = r._count._all;
    if (r.stance === "opportunity") snap.opportunities += c;
    else {
      if (r.severity === "high") snap.high += c;
      if (r.severity === "medium") snap.medium += c;
      snap.impactAtRisk += r._sum.expectedImpactAmount || 0;
    }
  }
  return snap;
};

/**
 * Bitta filial uchun bitta hisobotni tuzadi va SAQLAYDI (idempotent).
 *
 * MUHIM: branch kontekstida chaqirilishi shart.
 */
export const buildReport = async (branchId, period, now = new Date()) => {
  const meta = periodMeta(period, now);
  const prior = priorWindow(meta);

  const [pulse, priorPulse, snapshot] = await Promise.all([
    periodPulse({ start: meta.start, end: meta.end }),
    periodPulse(prior),
    insightSnapshot(),
  ]);

  const sections = [
    financeSection(pulse, priorPulse),
    attendanceSection(pulse, priorPulse),
    studentsSection(pulse, priorPulse),
    leadsSection(pulse, priorPulse),
    teachersSection(pulse, priorPulse),
  ];

  let outcomeSnapshot = { prevented: 0, occurred: 0, resolvedByOwner: 0 };

  // Haftalik va oylik: kurs kesimi qo'shiladi (kunlik uchun juda shovqinli -
  // bir kunda kurs darajasida ma'noli o'zgarish bo'lmaydi).
  if (period !== "daily") {
    const courses = await coursesSection(branchId, now);
    if (courses) sections.push(courses);
  }

  // Oylik: bashorat + yopiq halqa. Bu ikkisi ijroiya hisobotini
  // "o'tgan oy hisoboti" dan "qaror hujjati" ga aylantiradi.
  if (period === "monthly") {
    const [forecast, outcomes] = await Promise.all([
      forecastSection(branchId, now),
      outcomeSection({ start: meta.start, end: meta.end }),
    ]);
    sections.push(forecast, outcomes.section);
    outcomeSnapshot = outcomes.snapshot;
  }

  // XULOSA - bo'lim sarlavhalaridan quriladi. Ko'p owner faqat shuni
  // o'qiydi, shuning uchun u har bir bo'limning eng muhim sonini
  // o'z ichiga olishi kerak.
  const summary = [
    `${meta.title}.`,
    sections.map((s) => s.headline).filter(Boolean).join(" · ") + ".",
    snapshot.high > 0
      ? `Hozir ${snapshot.high} ta yuqori ustuvorlikli vazifa ochiq ` +
        `(${fmtMoney(snapshot.impactAtRisk)} so'm xavf ostida).`
      : "Yuqori ustuvorlikli ochiq vazifa yo'q.",
  ].join(" ");

  // ⚠ SNAPSHOT'LAR YASSI USTUNLARGA YOZILADI.
  //
  // Mongo'da `insightSnapshot` va `outcomeSnapshot` EMBEDDED obyekt edi.
  // `schema.prisma` da ular alohida ustunlarga yoyilgan
  // (`insightHigh`, `insightMedium`, ... `outcomeResolvedByOwner`).
  //
  // Obyekt shaklida yuborilsa Prisma "Unknown argument `insightSnapshot`"
  // bilan RAD ETADI — ya'ni AI hisobotini yaratish HAR chaqiruvda
  // yiqilardi (kunlik/haftalik/oylik joblar ham).
  const doc = {
    branchId,
    period,
    periodKey: meta.periodKey,
    periodStart: meta.start,
    periodEnd: meta.end,
    title: meta.title,
    summary,
    sections,
    insightHigh: snapshot.high ?? 0,
    insightMedium: snapshot.medium ?? 0,
    insightOpportunities: snapshot.opportunities ?? 0,
    insightImpactAtRisk: snapshot.impactAtRisk ?? 0,
    outcomePrevented: outcomeSnapshot.prevented ?? 0,
    outcomeOccurred: outcomeSnapshot.occurred ?? 0,
    outcomeResolvedByOwner: outcomeSnapshot.resolvedByOwner ?? 0,
    engineVersion: AI_ENGINE_VERSION,
    generatedAt: now,
  };

  // IDEMPOTENT: bir davr uchun bitta hisobot. Job qayta ishga tushsa
  // (restart, retry) mavjud yozuv YANGILANADI, ikkinchisi yaratilmaydi.
  // `(branchId, period, periodKey)` TO'LIQ unique (qisman emas), ya'ni
  // Prisma `upsert` to'g'ridan-to'g'ri ishlaydi.
  const saved = await prisma.aiReport.upsert({
    where: {
      branchId_period_periodKey: {
        branchId: String(branchId),
        period,
        periodKey: meta.periodKey,
      },
    },
    create: { ...doc, branchId: String(branchId), period, periodKey: meta.periodKey },
    update: doc,
  });
  return withLegacyId(saved);
};

/** Barcha faol filiallar uchun berilgan davr hisobotini tuzadi. */
export const buildReportsForAll = async (period, now = new Date()) => {
  const branches = await prisma.branch.findMany({
    where: { isActive: true, isDeleted: false },
    select: { id: true, name: true },
  });

  const results = [];
  for (const b of branches) {
    try {
      const report = await runWithBranchContext(
        {
          branchId: String(b.id),
          allowedBranchIds: [String(b.id)],
          canSeeAllBranches: false,
          userId: null,
        },
        () => buildReport(b.id, period, now),
      );
      results.push({ branchId: String(b.id), name: b.name, periodKey: report.periodKey });
    } catch (err) {
      logger.error({ err, branch: b.name, period }, "AI hisobot tuzilmadi");
      results.push({ branchId: String(b.id), name: b.name, error: err.message });
    }
  }
  return results;
};

/** Hisobotlar ro'yxati (o'qish). */
export const listReports = async (query = {}) => {
  const { page, limit, skip } = parsePagination(query);
  const filter = { ...branchFilter() };
  if (query.period) filter.period = query.period;

  const [items, total] = await Promise.all([
    prisma.aiReport.findMany({
      where: filter,
      // Ro'yxatda to'liq bo'limlar kerak emas - faqat sarlavha va xulosa.
      // Prisma'da `select("-sections")` yo'q; `omit` ayni shu ishni
      // qiladi va qolgan ustunlar ochiq sanab chiqilmaydi.
      omit: { sections: true },
      orderBy: { periodStart: "desc" },
      skip,
      take: limit,
    }),
    prisma.aiReport.count({ where: filter }),
  ]);
  return { items: withLegacyIds(items), meta: buildMeta({ page, limit, total }) };
};

/** Bitta hisobot (to'liq bo'limlar bilan). */
export const getReport = async (id) => {
  const doc = await prisma.aiReport.findFirst({
    where: { id: String(id), ...branchFilter() },
  });
  if (!doc) throw new ApiError(404, "Hisobot topilmadi");
  return withLegacyId(doc);
};

/** Eng oxirgi hisobot - dashboard "so'nggi hisobot" kartasi uchun. */
export const latestReport = async (period = "daily") => {
  const doc = await prisma.aiReport.findFirst({
    where: { ...branchFilter(), period },
    orderBy: { periodStart: "desc" },
  });
  return doc ? withLegacyId(doc) : null;
};
