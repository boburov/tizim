import prisma from "../../../config/prisma.js";
import { GROUP_DAYS } from "../../../constants/calendar.js";
import { buildWindows } from "./student.signal.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export const DAY_LABELS = Object.freeze({
  mon: "Dushanba",
  tue: "Seshanba",
  wed: "Chorshanba",
  thu: "Payshanba",
  fri: "Juma",
  sat: "Shanba",
  sun: "Yakshanba",
});

const WEEKEND = ["sat", "sun"];

export const loadGroups = async (branchId) =>
  prisma.group.findMany({
    where: { branchId: String(branchId), isDeleted: false, isActive: true },
    select: {
      id: true,
      name: true,
      courseId: true,
      schedule: true,
      startDate: true,
      teachers: true,
    },
  });

export const groupSizeSignal = async (groups, now) => {
  if (!groups.length) return { byGroup: new Map(), avgSize: 0, medianSize: 0, sampleSize: 0 };
  const gids = groups.map((g) => g.id || g._id);
  const since = new Date(now.getTime() - 60 * DAY_MS);

  const rows = await prisma.groupMembership.findMany({
    where: { groupId: { in: gids }, isDeleted: false },
    select: { groupId: true, leftAt: true, joinedAt: true, leftReason: true },
  });

  const byGroup = new Map();
  for (const r of rows) {
    const gid = r.groupId;
    if (!byGroup.has(gid)) {
      byGroup.set(gid, {
        active: 0,
        joinedRecently: 0,
        leftRecently: 0,
        everJoined: 0,
      });
    }
    const e = byGroup.get(gid);
    e.everJoined++;
    if (!r.leftAt) e.active++;
    if (r.joinedAt >= since) e.joinedRecently++;
    if (r.leftReason === "removed" && r.leftAt >= since) e.leftRecently++;
  }

  for (const e of byGroup.values()) {
    e.netFlow = e.joinedRecently - e.leftRecently;
  }

  const sizes = groups
    .map((g) => byGroup.get(String(g.id || g._id))?.active || 0)
    .filter((n) => n > 0)
    .sort((a, b) => a - b);

  const avgSize = sizes.length ? sizes.reduce((a, b) => a + b, 0) / sizes.length : 0;
  const medianSize = sizes.length ? sizes[Math.floor(sizes.length / 2)] : 0;

  return { byGroup, avgSize, medianSize, sampleSize: sizes.length };
};

export const slotUtilization = (groups, sizeByGroup, now = new Date()) => {
  const byDay = new Map(
    GROUP_DAYS.map((d) => [d, { sessions: 0, students: 0, groups: [] }]),
  );

  for (const g of groups) {
    const gid = String(g.id || g._id);
    const students = sizeByGroup.get(gid)?.active || 0;

    const schedule = Array.isArray(g.schedule) ? g.schedule : (g.schedule ? [g.schedule] : []);

    const activeSlots = new Map();
    for (const s of schedule) {
      if (s.effectiveFrom && new Date(s.effectiveFrom) > now) continue;
      const key = `${s.day}-${s.startTime}`;
      const prev = activeSlots.get(key);
      const prevAt = prev?.effectiveFrom ? new Date(prev.effectiveFrom).getTime() : 0;
      const curAt = s.effectiveFrom ? new Date(s.effectiveFrom).getTime() : 0;
      if (!prev || curAt >= prevAt) activeSlots.set(key, s);
    }

    for (const s of activeSlots.values()) {
      const entry = byDay.get(s.day);
      if (!entry) continue;
      entry.sessions += 1;
      entry.students += students;
      entry.groups.push({ groupId: g.id || g._id, name: g.name, startTime: s.startTime });
    }
  }

  const days = GROUP_DAYS.map((d) => ({
    day: d,
    label: DAY_LABELS[d],
    isWeekend: WEEKEND.includes(d),
    ...byDay.get(d),
  }));

  const active = days.filter((d) => d.sessions > 0);
  const busiest = days.reduce(
    (a, b) => (b.sessions > (a?.sessions ?? -1) ? b : a),
    null,
  );
  const avgSessions = active.length
    ? active.reduce((a, d) => a + d.sessions, 0) / active.length
    : 0;

  return {
    days,
    busiest,
    avgSessions,
    quiet: days
      .filter((d) => busiest && d.sessions < busiest.sessions * 0.5)
      .sort((a, b) => a.sessions - b.sessions),
    weekendSessions: days
      .filter((d) => d.isWeekend)
      .reduce((a, d) => a + d.sessions, 0),
    weekdaySessions: days
      .filter((d) => !d.isWeekend)
      .reduce((a, d) => a + d.sessions, 0),
  };
};

export const complaintSignal = async (groups, now) => {
  if (!groups.length) return new Map();
  const windows = buildWindows(now);
  const gids = groups.map((g) => g.id || g._id);

  const rows = await prisma.feedback.findMany({
    where: {
      groupId: { in: gids },
      createdAt: { gte: windows.priorStart, lt: windows.end },
    },
    select: { groupId: true, createdAt: true, status: true, id: true },
  });

  const out = new Map();
  for (const r of rows) {
    const gid = r.groupId;
    if (!out.has(gid)) {
      out.set(gid, { recent: 0, prior: 0, unresolved: 0, delta: 0, ids: [] });
    }
    const e = out.get(gid);
    if (r.createdAt >= windows.recentStart) {
      e.recent++;
      if (["new", "in_review"].includes(r.status)) e.unresolved++;
      if (e.ids.length < 10) e.ids.push(r.id);
    } else {
      e.prior++;
    }
  }
  for (const e of out.values()) e.delta = e.recent - e.prior;
  return out;
};

export const collectGroupSignals = async (branchId, now = new Date()) => {
  const groups = await loadGroups(branchId);
  if (!groups.length) {
    return {
      groups: [],
      size: { byGroup: new Map(), avgSize: 0, medianSize: 0 },
      slots: null,
      complaints: new Map(),
    };
  }
  const size = await groupSizeSignal(groups, now);
  const [complaints] = await Promise.all([complaintSignal(groups, now)]);
  const slots = slotUtilization(groups, size.byGroup, now);
  return { groups, size, slots, complaints };
};
