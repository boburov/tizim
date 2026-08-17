import prisma from "../../../config/prisma.js";
import { branchMatchStage } from "../../../helpers/branchContext.helper.js";
import { collectLeadSignals } from "../signals/lead.signal.js";
import {
  buildFactors,
  weightedScore,
  severityFor,
  sampleConfidence,
  consistencyOf,
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

const PER_KIND_CAP = 10;

const LEAD_KINDS = ["lead_hot", "lead_stale", "lead_conversion_drop"];

const STATUS_LABELS = {
  new: "Yangi",
  info_given: "Ma'lumot berilgan",
  trial: "Sinovga yozilgan",
  trial_attended: "Sinovga kelgan",
  recontacted: "Qayta bog'lanilgan",
  rejected: "Rad etilgan",
};

const averageMonthlyFee = async (now) => {
  const rows = await prisma.studentPayment.findMany({
    where: {
      AND: branchMatchStage("branchId"),
      year: now.getUTCFullYear(),
      month: now.getUTCMonth() + 1,
      writtenOff: false,
      expectedAmount: { gt: 0 },
    },
    select: { expectedAmount: true },
  });

  if (!rows.length) return { avg: 0, count: 0 };
  const sum = rows.reduce((a, b) => a + b.expectedAmount, 0);
  return { avg: sum / rows.length, count: rows.length };
};

const detectHotLead = ({ lead, avgFee, thresholds }) => {
  const factors = buildFactors([
    {
      key: "trialAttended",
      label: "Sinov darsiga kelgan",
      value: lead.attended ? "Ha" : "Yo'q",
      normalized: lead.attended ? 1 : 0.45,
      weight: 0.45,
      direction: "good",
    },
    {
      key: "waitingDays",
      label: "Javob kutish muddati",
      value: lead.waitingDays,
      unit: "kun",
      normalized: norm(lead.waitingDays, 7),
      weight: 0.4,
    },
    {
      key: "followUpOverdue",
      label: "Qayta bog'lanish muddati",
      value: lead.followUpAt && new Date(lead.followUpAt) < new Date() ? "O'tgan" : "—",
      normalized: lead.followUpAt && new Date(lead.followUpAt) < new Date() ? 1 : 0,
      weight: 0.15,
    },
  ]);

  const score = weightedScore(factors);
  const confidence = sampleConfidence({
    observed: 4,
    minSample: 2,
    fullSample: 4,
    recencyDays: Math.max(0, lead.waitingDays - 7),
  });

  const expectedImpact = {
    amount: Math.round(avgFee),
    currency: "UZS",
    label: avgFee ? `Yozilsa oyiga ${fmtMoney(avgFee)} so'm` : "",
  };

  return {
    kind: "lead_hot",
    subjectId: lead._id,
    subjectLabel: lead.name,
    title: lead.attended
      ? `${lead.name} sinovga keldi, ${lead.waitingDays} kundan beri javob kutmoqda`
      : `${lead.name} sinovga yozilgan — ${lead.waitingDays} kun kutmoqda`,
    severity: severityFor(score, thresholds),
    score,
    confidence,
    factors,
    expectedImpact,
    sourceRefs: [
      {
        model: "Lead",
        ids: [lead._id],
        total: 1,
        href: `/owner/leads?leadId=${lead._id}`,
      },
    ],
    recommendedActions: [
      {
        key: "call_lead",
        label: `Qo'ng'iroq qiling: ${lead.phone}`,
        dueInDays: lead.attended ? 1 : 2,
      },
    ],
    narration: narrate({
      headline:
        `${lead.name} — holati "${STATUS_LABELS[lead.status] || lead.status}", ` +
        `${lead.waitingDays} kundan beri o'zgarmagan.`,
      factors,
      expectedImpact,
      confidence,
      stance: "opportunity",
    }),
  };
};

const detectStaleLead = ({ lead, avgFee, thresholds }) => {
  const factors = buildFactors([
    {
      key: "idleDays",
      label: "Harakatsiz kunlar",
      value: lead.idleDays,
      unit: "kun",
      normalized: norm(lead.idleDays, 30),
      weight: 0.6,
    },
    {
      key: "followUpOverdue",
      label: "Qayta bog'lanish muddati",
      value: lead.followUpOverdue ? "O'tgan" : "—",
      normalized: lead.followUpOverdue ? 1 : 0,
      weight: 0.25,
    },
    {
      key: "leadStage",
      label: "Voronka bosqichi",
      value: STATUS_LABELS[lead.status] || lead.status,
      normalized: ["trial", "trial_attended"].includes(lead.status) ? 1 : 0.4,
      weight: 0.15,
      direction: "neutral",
    },
  ]);

  const score = weightedScore(factors);
  const confidence = sampleConfidence({ observed: 3, minSample: 2, fullSample: 3 });

  const expectedImpact = {
    amount: Math.round(avgFee),
    currency: "UZS",
    label: avgFee ? `Yo'qolsa oyiga ${fmtMoney(avgFee)} so'm` : "",
  };

  return {
    kind: "lead_stale",
    subjectId: lead._id,
    subjectLabel: lead.name,
    title: `${lead.name} — ${lead.idleDays} kundan beri harakat yo'q`,
    severity: severityFor(score, thresholds) === "high" ? "medium" : "low",
    score,
    confidence,
    factors,
    expectedImpact,
    sourceRefs: [
      {
        model: "Lead",
        ids: [lead._id],
        total: 1,
        href: `/owner/leads?leadId=${lead._id}`,
      },
    ],
    recommendedActions: [
      {
        key: "recontact_lead",
        label: `Qayta bog'laning yoki yopilgan deb belgilang: ${lead.phone}`,
        dueInDays: 3,
      },
    ],
    narration: narrate({
      headline:
        `${lead.name} "${STATUS_LABELS[lead.status] || lead.status}" holatida ` +
        `${lead.idleDays} kundan beri turibdi.`,
      factors,
      expectedImpact,
      confidence,
      stance: "risk",
    }),
  };
};

const detectConversionDrop = ({ trend, weekly, avgFee, thresholds, branchName }) => {
  if (trend.recentRate == null || trend.priorRate == null) return null;
  if (trend.drop < 0.1) return null;
  if ((trend.recentLeads || 0) < 8) return null;

  const factors = buildFactors([
    {
      key: "conversionDrop",
      label: "Konversiya pasayishi",
      value: Math.round(trend.drop * 100),
      unit: "%",
      normalized: norm(trend.drop, 0.4),
      weight: 0.55,
    },
    {
      key: "conversionRate",
      label: "Joriy konversiya",
      value: Math.round(trend.recentRate * 100),
      unit: "%",
      normalized: 1 - norm(trend.recentRate, 0.4),
      weight: 0.25,
      direction: "neutral",
    },
    {
      key: "leadVolume",
      label: "Taqqoslangan lidlar",
      value: (trend.recentLeads || 0) + (trend.priorLeads || 0),
      unit: "ta",
      normalized: norm((trend.recentLeads || 0) + (trend.priorLeads || 0), 60),
      weight: 0.2,
      direction: "neutral",
    },
  ]);

  const score = weightedScore(factors);
  const confidence = sampleConfidence({
    observed: trend.recentLeads || 0,
    minSample: 8,
    fullSample: 50,
    consistency: consistencyOf(weekly.map((w) => w.rate)),
  });

  const lostEnrollments = (trend.recentLeads || 0) * (trend.priorRate - trend.recentRate);
  const impact = Math.max(0, Math.round(lostEnrollments * avgFee));

  return {
    kind: "lead_conversion_drop",
    subjectLabel: branchName,
    title: `Lid konversiyasi ${Math.round(trend.drop * 100)}% pasaydi`,
    severity: severityFor(score, thresholds),
    score,
    confidence,
    factors,
    expectedImpact: {
      amount: impact,
      currency: "UZS",
      label: impact
        ? `Taxminan ${lostEnrollments.toFixed(1)} yozilish yo'qolgan (${fmtMoney(impact)} so'm/oy)`
        : "",
    },
    sourceRefs: [{ model: "Lead", ids: [], total: trend.recentLeads || 0, href: "/owner/leads/statistika" }],
    recommendedActions: [
      {
        key: "review_funnel",
        label: "Voronkani tekshiring — qaysi bosqichda lidlar to'xtayapti?",
        dueInDays: 7,
      },
      {
        key: "review_rejection_reasons",
        label: "Rad etish sabablarini ko'rib chiqing",
        dueInDays: 7,
      },
    ],
    narration: narrate({
      headline:
        `Lid konversiyasi ${Math.round(trend.priorRate * 100)}% dan ` +
        `${Math.round(trend.recentRate * 100)}% ga tushdi ` +
        `(${trend.recentLeads} ta yangi lid kogorti bo'yicha). ` +
        "Hisob faqat pishgan kogortlarni oladi — oxirgi 2 hafta kiritilmagan.",
      factors,
      confidence,
      stance: "risk",
    }),
  };
};

export const recomputeLeadInsights = async (branchId, now = new Date()) => {
  const config = await resolveConfig(branchId);
  const thresholds = readMap(config.thresholds, DEFAULT_THRESHOLDS);

  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { name: true },
  });
  const branchName = branch?.name || "Filial";

  const [signals, fee] = await Promise.all([
    collectLeadSignals(now),
    averageMonthlyFee(now),
  ]);
  const avgFee = fee.avg;

  const stats = {
    scanned: signals.hot.length + signals.stale.length,
    hot: mkStats(),
    stale: mkStats(),
    conversion: mkStats(),
    capped: {
      hot: Math.max(0, signals.hot.length - PER_KIND_CAP),
      stale: Math.max(0, signals.stale.length - PER_KIND_CAP),
    },
  };

  const stillOpen = {
    lead_hot: new Set(signals.hot.map((l) => String(l._id))),
    lead_stale: new Set(signals.stale.map((l) => String(l._id))),
  };

  const hot = [...signals.hot]
    .sort((a, b) => Number(b.attended) - Number(a.attended) || b.waitingDays - a.waitingDays)
    .slice(0, PER_KIND_CAP);
  const stale = [...signals.stale]
    .sort((a, b) => b.idleDays - a.idleDays)
    .slice(0, PER_KIND_CAP);

  for (const lead of hot) {
    const found = detectHotLead({ lead, avgFee, thresholds });
    await writeIfConfident({
      candidate: buildInsight({ branchId, now, ...found }),
      confidenceFloor: config.confidenceFloor,
      stats: stats.hot,
      stillOpen: null,
    });
  }

  for (const lead of stale) {
    const found = detectStaleLead({ lead, avgFee, thresholds });
    await writeIfConfident({
      candidate: buildInsight({ branchId, now, ...found }),
      confidenceFloor: config.confidenceFloor,
      stats: stats.stale,
      stillOpen: null,
    });
  }

  const conversion = detectConversionDrop({
    trend: signals.trend,
    weekly: signals.weekly,
    avgFee,
    thresholds,
    branchName,
  });
  if (conversion) {
    await writeIfConfident({
      candidate: buildInsight({ branchId, subjectId: branchId, now, ...conversion }),
      confidenceFloor: config.confidenceFloor,
      stats: stats.conversion,
      stillOpen: null,
    });
  } else {
    stats.conversion.closed = await closeStale(
      branchId,
      ["lead_conversion_drop"],
      new Set(),
      now,
    );
  }

  stats.hot.closed = await closeStale(branchId, ["lead_hot"], stillOpen.lead_hot, now);
  stats.stale.closed = await closeStale(branchId, ["lead_stale"], stillOpen.lead_stale, now);

  return stats;
};

export { LEAD_KINDS, PER_KIND_CAP };
