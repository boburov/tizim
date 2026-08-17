import prisma from "../../../config/prisma.js";
import { collectGroupSignals, DAY_LABELS } from "../signals/group.signal.js";
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
} from "./insightWriter.service.js";
import { resolveConfig } from "./aiConfig.service.js";

const GROUP_KINDS = ["group_underfilled", "group_complaints", "slot_opportunity"];

const detectUnderfilled = ({ group, size, median, sampleSize, thresholds }) => {
  if (sampleSize < 4 || median <= 0) return null;
  if (size.active === 0) return null;

  const gap = (median - size.active) / median;
  if (gap < 0.3) return null;

  const factors = buildFactors([
    {
      key: "sizeGap",
      label: "Medianadan farq",
      value: Math.round(gap * 100),
      unit: "%",
      normalized: norm(gap, 0.7),
      weight: 0.5,
    },
    {
      key: "groupSize",
      label: "Guruhdagi o'quvchi",
      value: size.active,
      unit: "ta",
      normalized: 1 - norm(size.active, median),
      weight: 0.25,
      direction: "neutral",
    },
    {
      key: "netFlow",
      label: "60 kunlik sof oqim",
      value: size.netFlow,
      unit: "o'quvchi",
      normalized: size.netFlow < 0 ? norm(Math.abs(size.netFlow), 5) : 0,
      weight: 0.25,
      direction: size.netFlow < 0 ? "bad" : "good",
    },
  ]);

  const score = weightedScore(factors);
  const confidence = sampleConfidence({
    observed: sampleSize,
    minSample: 4,
    fullSample: 15,
  });

  return {
    kind: "group_underfilled",
    subjectId: group._id,
    subjectLabel: group.name,
    title: `${group.name} — ${size.active} o'quvchi (median ${median})`,
    severity: severityFor(score, thresholds) === "high" ? "medium" : "low",
    score,
    confidence,
    factors,
    expectedImpact: {
      amount: 0,
      currency: "UZS",
      label: `${median - size.active} o'quvchiga joy bor`,
    },
    sourceRefs: [
      {
        model: "GroupMembership",
        ids: [],
        total: size.active,
        href: `/owner/groups/${group._id}/o-quvchilar`,
      },
    ],
    recommendedActions: [
      {
        key: "fill_group",
        label: "Kutish ro'yxatidagi lidlarni shu guruhga taklif qiling",
        dueInDays: 14,
      },
      ...(size.netFlow < 0
        ? [
            {
              key: "investigate_outflow",
              label: "Guruhdan ketish sabablarini tekshiring",
              dueInDays: 7,
            },
          ]
        : []),
    ],
    narration: narrate({
      headline:
        `${group.name} guruhida ${size.active} o'quvchi bor — filial medianasi ${median}. ` +
        `Oxirgi 60 kunda ${size.joinedRecently} qo'shildi, ${size.leftRecently} ketdi.`,
      factors,
      confidence,
      stance: "watch",
    }),
  };
};

const detectComplaints = ({ group, complaints, thresholds }) => {
  if (!complaints || complaints.recent === 0) return null;
  if (complaints.recent < 2) return null;
  if (complaints.delta <= 0) return null;

  const factors = buildFactors([
    {
      key: "complaintCount",
      label: "Oxirgi 4 haftadagi shikoyat",
      value: complaints.recent,
      unit: "ta",
      normalized: norm(complaints.recent, 6),
      weight: 0.4,
    },
    {
      key: "complaintDelta",
      label: "O'zgarish",
      value: complaints.delta,
      unit: "ta",
      normalized: norm(complaints.delta, 4),
      weight: 0.35,
    },
    {
      key: "unresolvedComplaints",
      label: "Yopilmagan shikoyat",
      value: complaints.unresolved,
      unit: "ta",
      normalized: norm(complaints.unresolved, 3),
      weight: 0.25,
    },
  ]);

  const score = weightedScore(factors);
  const confidence = sampleConfidence({
    observed: complaints.recent + complaints.prior,
    minSample: 2,
    fullSample: 10,
  });

  return {
    kind: "group_complaints",
    subjectId: group._id,
    subjectLabel: group.name,
    title: `${group.name} — shikoyatlar ${complaints.prior} dan ${complaints.recent} ga oshdi`,
    severity: severityFor(score, thresholds),
    score,
    confidence,
    factors,
    expectedImpact: { amount: 0, currency: "UZS", label: "" },
    sourceRefs: [
      {
        model: "Feedback",
        ids: complaints.ids,
        total: complaints.recent,
        href: "/owner/feedback",
      },
    ],
    recommendedActions: [
      {
        key: "read_complaints",
        label: `${complaints.recent} shikoyatni o'qing va sababini aniqlang`,
        dueInDays: 3,
      },
      ...(complaints.unresolved > 0
        ? [
            {
              key: "close_complaints",
              label: `${complaints.unresolved} yopilmagan shikoyatga javob bering`,
              dueInDays: 5,
            },
          ]
        : []),
    ],
    narration: narrate({
      headline:
        `${group.name} guruhida oxirgi 4 haftada ${complaints.recent} shikoyat keldi — ` +
        `oldingi 4 haftada ${complaints.prior} ta edi. ` +
        "Diqqat: bu shikoyat soni, qoniqish balli emas — reyting so'rovnomasi tizimda yo'q.",
      factors,
      confidence,
      stance: "risk",
    }),
  };
};

const detectSlotOpportunity = ({ slots, thresholds, branchName }) => {
  if (!slots?.busiest || slots.busiest.sessions < 3) return null;
  if (!slots.quiet.length) return null;

  const quietest = slots.quiet[0];
  const weekendGap =
    slots.weekdaySessions > 0
      ? Math.max(
          0,
          1 - slots.weekendSessions / 2 / (slots.weekdaySessions / 5),
        )
      : 0;

  const factors = buildFactors([
    {
      key: "quietDays",
      label: "Bo'sh kunlar",
      value: slots.quiet.length,
      unit: "kun",
      normalized: norm(slots.quiet.length, 3),
      weight: 0.4,
      direction: "good",
    },
    {
      key: "slotGap",
      label: `${quietest.label} vs ${slots.busiest.label}`,
      value: `${quietest.sessions} / ${slots.busiest.sessions}`,
      normalized: norm(
        (slots.busiest.sessions - quietest.sessions) / slots.busiest.sessions,
        0.8,
      ),
      weight: 0.35,
      direction: "good",
    },
    {
      key: "weekendGap",
      label: "Dam olish kunlari bo'shligi",
      value: Math.round(weekendGap * 100),
      unit: "%",
      normalized: norm(weekendGap, 0.8),
      weight: 0.25,
      direction: "good",
    },
  ]);

  const score = weightedScore(factors);
  const confidence = sampleConfidence({
    observed: slots.days.reduce((a, d) => a + d.sessions, 0),
    minSample: 5,
    fullSample: 30,
  });

  const quietList = slots.quiet
    .slice(0, 3)
    .map((d) => `${d.label} (${d.sessions} dars)`)
    .join(", ");

  return {
    kind: "slot_opportunity",
    subjectLabel: branchName,
    title: `Bo'sh dars vaqtlari: ${quietList}`,
    severity: severityFor(score, thresholds) === "high" ? "medium" : "low",
    score,
    confidence,
    factors,
    expectedImpact: {
      amount: 0,
      currency: "UZS",
      label: `${slots.busiest.label} kuni ${slots.busiest.sessions} dars, ${quietest.label} kuni ${quietest.sessions}`,
    },
    sourceRefs: [
      {
        model: "Group",
        ids: slots.busiest.groups.map((g) => g.groupId).slice(0, 20),
        total: slots.days.reduce((a, d) => a + d.sessions, 0),
        href: "/owner/groups",
      },
    ],
    recommendedActions: [
      {
        key: "open_group_quiet_slot",
        label: `${quietest.label} kuniga yangi guruh ochishni ko'rib chiqing`,
        dueInDays: 30,
      },
      ...(weekendGap > 0.4
        ? [
            {
              key: "expand_weekend",
              label: "Dam olish kunlari sig'imini oshiring — talab bor, dars kam",
              dueInDays: 30,
            },
          ]
        : []),
    ],
    narration: narrate({
      headline:
        `Eng band kun — ${slots.busiest.label} (${slots.busiest.sessions} dars). ` +
        `Eng bo'sh: ${quietList}. ` +
        "Diqqat: bu DARS VAQTI tahlili — tizimda xona (Room) modeli yo'q, " +
        "shuning uchun xona bandligi hisoblanmaydi.",
      factors,
      confidence,
      stance: "opportunity",
    }),
  };
};

export const recomputeGroupInsights = async (branchId, now = new Date()) => {
  const config = await resolveConfig(branchId);
  const thresholds = readMap(config.thresholds, DEFAULT_THRESHOLDS);

  const branch = await prisma.branch.findUnique({
    where: { id: branchId },
    select: { name: true },
  });
  const branchName = branch?.name || "Filial";

  const signals = await collectGroupSignals(branchId, now);
  const stats = {
    scanned: signals.groups.length,
    underfilled: mkStats(),
    complaints: mkStats(),
    slots: mkStats(),
  };
  if (!signals.groups.length) return { ...stats, signals };

  const stillOpen = { group_underfilled: new Set(), group_complaints: new Set() };

  for (const group of signals.groups) {
    const gid = String(group._id);
    const size = signals.size.byGroup.get(gid) || {
      active: 0,
      joinedRecently: 0,
      leftRecently: 0,
      netFlow: 0,
    };

    const underfilled = detectUnderfilled({
      group,
      size,
      median: signals.size.medianSize,
      sampleSize: signals.size.sampleSize || 0,
      thresholds,
    });
    if (underfilled) {
      await writeIfConfident({
        candidate: buildInsight({ branchId, now, ...underfilled }),
        confidenceFloor: config.confidenceFloor,
        stats: stats.underfilled,
        stillOpen: stillOpen.group_underfilled,
      });
    }

    const complaints = detectComplaints({
      group,
      complaints: signals.complaints.get(gid),
      thresholds,
    });
    if (complaints) {
      await writeIfConfident({
        candidate: buildInsight({ branchId, now, ...complaints }),
        confidenceFloor: config.confidenceFloor,
        stats: stats.complaints,
        stillOpen: stillOpen.group_complaints,
      });
    }
  }

  const slotFound = detectSlotOpportunity({ slots: signals.slots, thresholds, branchName });
  if (slotFound) {
    await writeIfConfident({
      candidate: buildInsight({ branchId, subjectId: branchId, now, ...slotFound }),
      confidenceFloor: config.confidenceFloor,
      stats: stats.slots,
      stillOpen: null,
    });
  } else {
    stats.slots.closed = await closeStale(branchId, ["slot_opportunity"], new Set(), now);
  }

  stats.underfilled.closed = await closeStale(
    branchId,
    ["group_underfilled"],
    stillOpen.group_underfilled,
    now,
  );
  stats.complaints.closed = await closeStale(
    branchId,
    ["group_complaints"],
    stillOpen.group_complaints,
    now,
  );

  return { ...stats, signals };
};

export { GROUP_KINDS, DAY_LABELS };
