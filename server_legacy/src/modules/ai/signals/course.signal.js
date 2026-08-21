import prisma from "../../../config/prisma.js";
import { buildWindows } from "./student.signal.js";

const UNASSIGNED = "__unassigned__";

export const groupsByCourse = async (groups) => {
  const courseIds = [
    ...new Set(groups.filter((g) => g.courseId).map((g) => String(g.courseId))),
  ];
  const courses = courseIds.length
    ? await prisma.course.findMany({
        where: { id: { in: courseIds } },
        select: { id: true, title: true, code: true, level: true },
      })
    : [];
  const courseById = new Map(courses.map((c) => [c.id, c]));

  const buckets = new Map();
  for (const g of groups) {
    const key = g.courseId ? String(g.courseId) : UNASSIGNED;
    if (!buckets.has(key)) {
      buckets.set(key, {
        key,
        course: courseById.get(key) || null,
        title: courseById.get(key)?.title || "Kursi belgilanmagan",
        groups: [],
      });
    }
    buckets.get(key).groups.push(g);
  }
  return [...buckets.values()];
};

export const courseAttendance = async (buckets, now) => {
  const windows = buildWindows(now);
  const allGroupIds = buckets.flatMap((b) => b.groups.map((g) => String(g.id || g._id)));
  if (!allGroupIds.length) return new Map();

  const rows = await prisma.attendance.findMany({
    where: {
      groupId: { in: allGroupIds },
      isDeleted: false,
      date: { gte: windows.priorStart, lt: windows.end },
      status: { in: ["present", "absent"] },
    },
    select: { groupId: true, date: true, status: true, id: true },
  });

  const byGroup = new Map();
  for (const r of rows) {
    const gid = r.groupId;
    if (!byGroup.has(gid)) {
      byGroup.set(gid, {
        recent: { present: 0, total: 0 },
        prior: { present: 0, total: 0 },
        absentIds: [],
      });
    }
    const e = byGroup.get(gid);
    const window = r.date >= windows.recentStart ? "recent" : "prior";
    e[window].total++;
    if (r.status === "present") e[window].present++;
    else if (window === "recent" && e.absentIds.length < 20) e.absentIds.push(r.id);
  }

  const out = new Map();
  for (const b of buckets) {
    const agg = {
      recent: { present: 0, total: 0 },
      prior: { present: 0, total: 0 },
      absentIds: [],
    };
    for (const g of b.groups) {
      const e = byGroup.get(String(g.id || g._id));
      if (!e) continue;
      agg.recent.present += e.recent.present;
      agg.recent.total += e.recent.total;
      agg.prior.present += e.prior.present;
      agg.prior.total += e.prior.total;
      if (agg.absentIds.length < 20) {
        agg.absentIds.push(...e.absentIds.slice(0, 20 - agg.absentIds.length));
      }
    }

    const recentRate = agg.recent.total > 0 ? agg.recent.present / agg.recent.total : null;
    const priorRate = agg.prior.total > 0 ? agg.prior.present / agg.prior.total : null;
    out.set(b.key, {
      recentRate,
      priorRate,
      lessons: agg.recent.total,
      drop:
        priorRate != null && recentRate != null && priorRate > 0
          ? Math.max(0, (priorRate - recentRate) / priorRate)
          : 0,
      absentIds: agg.absentIds,
    });
  }
  return out;
};

export const courseEnrollment = async (buckets, now) => {
  const allGroupIds = buckets.flatMap((b) => b.groups.map((g) => String(g.id || g._id)));
  if (!allGroupIds.length) return new Map();
  const since = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  const rows = await prisma.groupMembership.findMany({
    where: { groupId: { in: allGroupIds }, isDeleted: false },
    select: { groupId: true, leftAt: true, leftReason: true },
  });

  const byGroup = new Map();
  for (const r of rows) {
    const gid = r.groupId;
    if (!byGroup.has(gid)) {
      byGroup.set(gid, { active: 0, left: 0, graduated: 0 });
    }
    const e = byGroup.get(gid);
    if (!r.leftAt) e.active++;
    else if (r.leftReason === "removed" && r.leftAt >= since) e.left++;
    else if (r.leftReason === "graduated") e.graduated++;
  }

  const out = new Map();
  for (const b of buckets) {
    let active = 0;
    let left = 0;
    let graduated = 0;
    for (const g of b.groups) {
      const e = byGroup.get(String(g.id || g._id));
      if (!e) continue;
      active += e.active;
      left += e.left;
      graduated += e.graduated;
    }
    out.set(b.key, {
      active,
      left,
      graduated,
      groups: b.groups.length,
      avgGroupSize: b.groups.length ? active / b.groups.length : 0,
      churnRate: active + left > 0 ? left / (active + left) : 0,
    });
  }
  return out;
};

export const courseRevenue = async (buckets, now) => {
  const allGroupIds = buckets.flatMap((b) => b.groups.map((g) => String(g.id || g._id)));
  if (!allGroupIds.length) return new Map();

  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;

  const rows = await prisma.studentPayment.findMany({
    where: {
      groupId: { in: allGroupIds },
      year,
      month,
      writtenOff: false,
    },
    select: { groupId: true, expectedAmount: true, paidAmount: true },
  });

  const byGroup = new Map();
  for (const r of rows) {
    const gid = r.groupId;
    if (!byGroup.has(gid)) {
      byGroup.set(gid, { expected: 0, paid: 0 });
    }
    const e = byGroup.get(gid);
    e.expected += r.expectedAmount;
    e.paid += r.paidAmount;
  }

  const out = new Map();
  for (const b of buckets) {
    let expected = 0;
    let paid = 0;
    for (const g of b.groups) {
      const e = byGroup.get(String(g.id || g._id));
      if (!e) continue;
      expected += e.expected;
      paid += e.paid;
    }
    out.set(b.key, {
      expected,
      paid,
      collectionRate: expected > 0 ? paid / expected : null,
      revenuePerStudent: 0,
    });
  }
  return out;
};

export const collectCourseSignals = async (groups, now = new Date()) => {
  const buckets = await groupsByCourse(groups);
  if (!buckets.length) return { buckets: [], signals: new Map() };

  const [attendance, enrollment, revenue] = await Promise.all([
    courseAttendance(buckets, now),
    courseEnrollment(buckets, now),
    courseRevenue(buckets, now),
  ]);

  const signals = new Map();
  for (const b of buckets) {
    const enr = enrollment.get(b.key) || {
      active: 0,
      left: 0,
      graduated: 0,
      groups: 0,
      avgGroupSize: 0,
      churnRate: 0,
    };
    const rev = revenue.get(b.key) || { expected: 0, paid: 0, collectionRate: null };
    signals.set(b.key, {
      bucket: b,
      attendance: attendance.get(b.key) || {
        recentRate: null,
        priorRate: null,
        lessons: 0,
        drop: 0,
        absentIds: [],
      },
      enrollment: enr,
      revenue: {
        ...rev,
        revenuePerStudent: enr.active > 0 ? rev.expected / enr.active : 0,
      },
    });
  }
  return { buckets, signals };
};
