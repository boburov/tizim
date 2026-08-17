import prisma from "../../../config/prisma.js";
import { branchMatchStage, branchFilter } from "../../../helpers/branchContext.helper.js";
import { LEAD_PIPELINE } from "../../../constants/leadStatus.js";

const DAY_MS = 24 * 60 * 60 * 1000;

const HOT_STATUSES = ["trial_attended", "trial"];
const OPEN_STATUSES = LEAD_PIPELINE.filter((s) => s !== "enrolled").concat("recontacted");

export const conversionByWeek = async (weeks, now) => {
  const since = new Date(now.getTime() - weeks * 7 * DAY_MS);
  
  const rows = await prisma.lead.findMany({
    where: {
      AND: branchMatchStage("branchId"),
      createdAt: { gte: since },
    },
    select: { createdAt: true, status: true },
    orderBy: { createdAt: "asc" },
  });

  const getIsoWeekInfo = (date) => {
    const target = new Date(date.valueOf());
    const dayNr = (date.getUTCDay() + 6) % 7;
    target.setUTCDate(target.getUTCDate() - dayNr + 3);
    const firstThursday = target.valueOf();
    target.setUTCMonth(0, 1);
    if (target.getUTCDay() !== 4) {
      target.setUTCMonth(0, 1 + ((4 - target.getUTCDay()) + 7) % 7);
    }
    const week = 1 + Math.ceil((firstThursday - target) / 604800000);
    const year = target.getUTCFullYear();
    return { year, week };
  };

  const byWeek = new Map();
  for (const r of rows) {
    const localDate = new Date(r.createdAt.getTime() + 5 * 60 * 60 * 1000);
    const { year, week } = getIsoWeekInfo(localDate);
    const weekKey = `${year}-W${String(week).padStart(2, "0")}`;

    if (!byWeek.has(weekKey)) {
      byWeek.set(weekKey, {
        year,
        week,
        weekKey,
        firstAt: r.createdAt,
        total: 0,
        enrolled: 0,
        rejected: 0,
      });
    }
    const entry = byWeek.get(weekKey);
    entry.total++;
    if (r.status === "enrolled") entry.enrolled++;
    if (r.status === "rejected") entry.rejected++;
  }

  const result = [...byWeek.values()].map((r) => ({
    weekKey: r.weekKey,
    weekStart: r.firstAt,
    total: r.total,
    enrolled: r.enrolled,
    rejected: r.rejected,
    rate: r.total > 0 ? r.enrolled / r.total : 0,
  }));

  result.sort((a, b) => a.weekKey.localeCompare(b.weekKey));
  return result;
};

export const conversionTrend = (weekly, now, ripenDays = 14) => {
  const cutoff = new Date(now.getTime() - ripenDays * DAY_MS);
  const ripe = weekly.filter((w) => new Date(w.weekStart) < cutoff);
  if (ripe.length < 4) {
    return { recentRate: null, priorRate: null, drop: 0, sample: ripe.length };
  }

  const half = Math.floor(ripe.length / 2);
  const prior = ripe.slice(0, half);
  const recent = ripe.slice(half);

  const rate = (arr) => {
    const total = arr.reduce((a, w) => a + w.total, 0);
    const enrolled = arr.reduce((a, w) => a + w.enrolled, 0);
    return total > 0 ? enrolled / total : null;
  };

  const recentRate = rate(recent);
  const priorRate = rate(prior);
  const drop =
    priorRate != null && recentRate != null && priorRate > 0
      ? Math.max(0, (priorRate - recentRate) / priorRate)
      : 0;

  return {
    recentRate,
    priorRate,
    drop,
    sample: ripe.length,
    recentLeads: recent.reduce((a, w) => a + w.total, 0),
    priorLeads: prior.reduce((a, w) => a + w.total, 0),
  };
};

export const hotLeads = async (now, limit = 25) => {
  const rows = await prisma.lead.findMany({
    where: {
      ...branchFilter("branchId"),
      status: { in: HOT_STATUSES },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      status: true,
      directionId: true,
      trialDate: true,
      followUpAt: true,
      statusHistory: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "desc" },
    take: limit,
  });

  return rows.map((l) => {
    let last = l.updatedAt;
    let history = l.statusHistory;
    if (typeof history === "string") {
      try { history = JSON.parse(history); } catch (e) { history = []; }
    }
    if (Array.isArray(history) && history.length > 0) {
      last = new Date(history[history.length - 1].at);
    }

    const waitingDays = Math.max(
      0,
      Math.floor((now.getTime() - new Date(last).getTime()) / DAY_MS),
    );
    return {
      _id: l.id,
      name: `${l.firstName} ${l.lastName || ""}`.trim(),
      phone: l.phone,
      status: l.status,
      direction: l.directionId,
      trialDate: l.trialDate,
      followUpAt: l.followUpAt,
      waitingDays,
      attended: l.status === "trial_attended",
    };
  });
};

export const staleLeads = async (now, staleDays = 10, limit = 25) => {
  const cutoff = new Date(now.getTime() - staleDays * DAY_MS);
  
  const rows = await prisma.lead.findMany({
    where: {
      ...branchFilter("branchId"),
      status: { in: OPEN_STATUSES },
      updatedAt: { lt: cutoff },
    },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      phone: true,
      status: true,
      directionId: true,
      followUpAt: true,
      updatedAt: true,
    },
    orderBy: { updatedAt: "asc" },
    take: limit,
  });

  return rows.map((l) => ({
    _id: l.id,
    name: `${l.firstName} ${l.lastName || ""}`.trim(),
    phone: l.phone,
    status: l.status,
    direction: l.directionId,
    idleDays: Math.max(
      0,
      Math.floor((now.getTime() - new Date(l.updatedAt).getTime()) / DAY_MS),
    ),
    followUpOverdue: Boolean(l.followUpAt && new Date(l.followUpAt) < now),
  }));
};

export const demandByDirection = async (now, days = 30) => {
  const since = new Date(now.getTime() - days * DAY_MS);
  
  const allRows = await prisma.lead.findMany({
    where: {
      AND: branchMatchStage("branchId"),
      createdAt: { gte: since },
      directionId: { not: null },
    },
    select: { directionId: true, status: true },
  });

  if (!allRows.length) return [];

  const byDir = new Map();
  for (const r of allRows) {
    if (!byDir.has(r.directionId)) {
      byDir.set(r.directionId, { total: 0, enrolled: 0, open: 0, rejected: 0 });
    }
    const e = byDir.get(r.directionId);
    e.total++;
    if (r.status === "enrolled") e.enrolled++;
    else if (r.status === "rejected") e.rejected++;
    else if (OPEN_STATUSES.includes(r.status)) e.open++;
  }

  const directionIds = [...byDir.keys()];

  const [options, courses] = await Promise.all([
    prisma.leadOption.findMany({
      where: { id: { in: directionIds } },
      select: { id: true, name: true },
    }),
    prisma.course.findMany({
      where: { leadDirectionId: { in: directionIds } },
      select: { id: true, title: true, code: true, leadDirectionId: true },
    }),
  ]);

  const titleById = new Map(options.map((o) => [o.id, o.name]));
  const courseByDirection = new Map(courses.map((c) => [c.leadDirectionId, c]));

  const result = [...byDir.entries()].map(([dirId, r]) => {
    const course = courseByDirection.get(dirId) || null;
    return {
      directionId: dirId,
      directionTitle: titleById.get(dirId) || "Nomsiz yo'nalish",
      course,
      total: r.total,
      enrolled: r.enrolled,
      open: r.open,
      rejected: r.rejected,
      conversionRate: r.total > 0 ? r.enrolled / r.total : 0,
    };
  });

  result.sort((a, b) => b.total - a.total);
  return result;
};

export const sourcePerformance = async (now, days = 90) => {
  const since = new Date(now.getTime() - days * DAY_MS);
  
  const allRows = await prisma.lead.findMany({
    where: {
      AND: branchMatchStage("branchId"),
      createdAt: { gte: since },
      sourceId: { not: null },
    },
    select: { sourceId: true, status: true },
  });

  if (!allRows.length) return [];

  const bySource = new Map();
  for (const r of allRows) {
    if (!bySource.has(r.sourceId)) {
      bySource.set(r.sourceId, { total: 0, enrolled: 0 });
    }
    const e = bySource.get(r.sourceId);
    e.total++;
    if (r.status === "enrolled") e.enrolled++;
  }

  const sourceIds = [...bySource.keys()];

  const options = await prisma.leadOption.findMany({
    where: { id: { in: sourceIds } },
    select: { id: true, name: true },
  });
  const titleById = new Map(options.map((o) => [o.id, o.name]));

  const result = [...bySource.entries()].map(([sourceId, r]) => ({
    sourceId,
    title: titleById.get(sourceId) || "Nomsiz manba",
    total: r.total,
    enrolled: r.enrolled,
    rate: r.total > 0 ? r.enrolled / r.total : 0,
  }));

  result.sort((a, b) => b.total - a.total);
  return result;
};

export const collectLeadSignals = async (now = new Date()) => {
  const [weekly, hot, stale, demand, sources] = await Promise.all([
    conversionByWeek(12, now),
    hotLeads(now),
    staleLeads(now),
    demandByDirection(now),
    sourcePerformance(now),
  ]);
  return {
    weekly,
    trend: conversionTrend(weekly, now),
    hot,
    stale,
    demand,
    sources,
  };
};
