import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service.js';

import { GROUP_DAYS } from "../../../common/constants/calendar.js";
import { buildWindows } from "./student.signal.js";

/** GURUH SIGNALLARI — `signals/group.signal.js` ning ko'chirmasi. */
const DAY_MS = 24 * 60 * 60 * 1000;

export const DAY_LABELS: any = Object.freeze({
  mon: "Dushanba",
  tue: "Seshanba",
  wed: "Chorshanba",
  thu: "Payshanba",
  fri: "Juma",
  sat: "Shanba",
  sun: "Yakshanba",
});

const WEEKEND = ["sat", "sun"];

@Injectable()
export class GroupSignalService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async loadGroups(branchId: any) {
  return this.prisma.group.findMany({
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
}

  async groupSizeSignal(groups: any,now: any) {
  if (!groups.length) return { byGroup: new Map(), avgSize: 0, medianSize: 0, sampleSize: 0 };
  const gids = groups.map((g: any) => g.id || g._id);
  const since = new Date(now.getTime() - 60 * DAY_MS);

  const rows = await this.prisma.groupMembership.findMany({
    where: { groupId: { in: gids }, isDeleted: false },
    select: { groupId: true, leftAt: true, joinedAt: true, leftReason: true },
  });

  const byGroup = new Map();
  for (const r of (rows) as any[]) {
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
    .map((g: any) => byGroup.get(String(g.id || g._id))?.active || 0)
    .filter((n: any) => n > 0)
    .sort((a: any,b: any) => a - b);

  const avgSize = sizes.length ? sizes.reduce((a: any,b: any) => a + b, 0) / sizes.length : 0;
  const medianSize = sizes.length ? sizes[Math.floor(sizes.length / 2)] : 0;

  return { byGroup, avgSize, medianSize, sampleSize: sizes.length };
}

  slotUtilization(groups: any,sizeByGroup: any,now: any = new Date()) {
  const byDay: Map<string, any> = new Map(
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

  const active = days.filter((d: any) => d.sessions > 0);
  const busiest: any = days.reduce(
    (a: any, b: any) => (b.sessions > (a?.sessions ?? -1) ? b : a),
    null,
  );
  const avgSessions = active.length
    ? active.reduce((a, d: any) => a + d.sessions, 0) / active.length
    : 0;

  return {
    days,
    busiest,
    avgSessions,
    quiet: days
      .filter((d: any) => busiest && d.sessions < busiest.sessions * 0.5)
      .sort((a: any, b: any) => a.sessions - b.sessions),
    weekendSessions: days
      .filter((d) => d.isWeekend)
      .reduce((a, d: any) => a + d.sessions, 0),
    weekdaySessions: days
      .filter((d) => !d.isWeekend)
      .reduce((a, d: any) => a + d.sessions, 0),
  };
}

  async complaintSignal(groups: any,now: any) {
  if (!groups.length) return new Map();
  const windows = buildWindows(now);
  const gids = groups.map((g: any) => g.id || g._id);

  const rows = await this.prisma.feedback.findMany({
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
}

  async collectGroupSignals(branchId: any,now: any = new Date()) {
  const groups = await this.loadGroups(branchId);
  if (!groups.length) {
    return {
      groups: [],
      size: { byGroup: new Map(), avgSize: 0, medianSize: 0 },
      slots: null,
      complaints: new Map(),
    };
  }
  const size = await this.groupSizeSignal(groups, now);
  const [complaints] = await Promise.all([this.complaintSignal(groups, now)]);
  const slots = this.slotUtilization(groups, size.byGroup, now);
  return { groups, size, slots, complaints };
}
}