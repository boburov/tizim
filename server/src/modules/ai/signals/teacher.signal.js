import prisma from "../../../config/prisma.js";
import { ROLES } from "../../../constants/roles.js";
import { buildWindows } from "./student.signal.js";

const DAY_MS = 24 * 60 * 60 * 1000;

export const loadTeachers = async (branchId) => {
  const groups = await prisma.group.findMany({
    where: {
      branchId: String(branchId),
      isDeleted: false,
      isActive: true,
    },
    select: { id: true, name: true, courseId: true },
  });
  if (!groups.length) return { teachers: [], groups: [] };

  const groupIds = groups.map((g) => g.id);
  const periods = await prisma.teacherGroupPeriod.findMany({
    where: {
      groupId: { in: groupIds },
      endDate: null,
      isDeleted: false,
    },
    select: { teacherId: true, groupId: true },
  });
  if (!periods.length) return { teachers: [], groups };

  const byTeacher = new Map();
  for (const p of periods) {
    const tid = String(p.teacherId);
    if (!byTeacher.has(tid)) byTeacher.set(tid, []);
    byTeacher.get(tid).push(p.groupId);
  }

  const users = await prisma.user.findMany({
    where: {
      id: { in: [...byTeacher.keys()] },
      role: ROLES.TEACHER,
      isActive: true,
      isDeleted: false,
    },
    select: { id: true, firstName: true, lastName: true },
  });

  return {
    teachers: users.map((u) => ({
      ...u,
      groupIds: byTeacher.get(String(u.id)) || [],
    })),
    groups,
  };
};

export const teacherAbsenceSignal = async (teacherIds, groupIds, now) => {
  const since = new Date(now.getTime() - 28 * DAY_MS);
  const weekSince = new Date(now.getTime() - 7 * DAY_MS);

  const [hrRows, lessonRows] = await Promise.all([
    prisma.teacherAttendance.findMany({
      where: {
        teacherId: { in: teacherIds.map(String) },
        isDeleted: false,
        date: { gte: since },
        status: "absent",
      },
      select: { teacherId: true, date: true, id: true },
    }),
    prisma.teacherAbsence.findMany({
      where: {
        teacherId: { in: teacherIds.map(String) },
        groupId: { in: groupIds.map(String) },
        isDeleted: false,
        date: { gte: since },
      },
      select: { teacherId: true, groupId: true, date: true, id: true },
    }),
  ]);

  const out = new Map();
  const ensure = (tid) => {
    if (!out.has(tid)) {
      out.set(tid, {
        hrAbsences: 0,
        hrThisWeek: 0,
        missedLessons: 0,
        missedThisWeek: 0,
        affectedGroups: 0,
        lastDate: null,
        hrIds: [],
        lessonIds: [],
        _groups: new Set(),
      });
    }
    return out.get(tid);
  };

  for (const r of hrRows) {
    const e = ensure(String(r.teacherId));
    e.hrAbsences++;
    if (r.date >= weekSince) e.hrThisWeek++;
    if (e.hrIds.length < 20) e.hrIds.push(r.id);
    if (!e.lastDate || r.date > e.lastDate) e.lastDate = r.date;
  }
  for (const r of lessonRows) {
    const e = ensure(String(r.teacherId));
    e.missedLessons++;
    if (r.date >= weekSince) e.missedThisWeek++;
    e._groups.add(r.groupId);
    if (e.lessonIds.length < 20) e.lessonIds.push(r.id);
    if (!e.lastDate || r.date > e.lastDate) e.lastDate = r.date;
  }
  for (const e of out.values()) {
    e.affectedGroups = e._groups.size;
    delete e._groups;
  }
  return out;
};

export const teacherLoadSignal = async (teachers) => {
  const allGroupIds = [...new Set(teachers.flatMap((t) => t.groupIds.map(String)))];
  if (!allGroupIds.length) return new Map();

  const rows = await prisma.groupMembership.groupBy({
    by: ["groupId"],
    where: {
      groupId: { in: allGroupIds },
      leftAt: null,
      isDeleted: false,
    },
    _count: { studentId: true },
  });
  const byGroup = new Map(rows.map((r) => [r.groupId, r._count.studentId]));

  const out = new Map();
  for (const t of teachers) {
    let students = 0;
    const perGroup = [];
    for (const gid of t.groupIds) {
      const n = byGroup.get(String(gid)) || 0;
      students += n;
      perGroup.push({ groupId: gid, students: n });
    }
    out.set(String(t.id || t._id), {
      groups: t.groupIds.length,
      students,
      perGroup,
      avgPerGroup: t.groupIds.length ? students / t.groupIds.length : 0,
    });
  }
  return out;
};

export const teacherOutcomeSignal = async (teachers, now) => {
  const windows = buildWindows(now);
  const allGroupIds = [...new Set(teachers.flatMap((t) => t.groupIds.map(String)))];
  if (!allGroupIds.length) return new Map();

  const [attRows, gradeRows] = await Promise.all([
    prisma.attendance.findMany({
      where: {
        groupId: { in: allGroupIds },
        isDeleted: false,
        date: { gte: windows.recentStart, lt: windows.end },
        status: { in: ["present", "absent"] },
      },
      select: { groupId: true, status: true },
    }),
    prisma.grade.findMany({
      where: {
        groupId: { in: allGroupIds },
        isDeleted: false,
        date: { gte: windows.priorStart, lt: windows.end },
      },
      select: { groupId: true, date: true, value: true },
    }),
  ]);

  const attGroupMap = new Map();
  for (const r of attRows) {
    if (!attGroupMap.has(r.groupId)) attGroupMap.set(r.groupId, { total: 0, present: 0 });
    const e = attGroupMap.get(r.groupId);
    e.total++;
    if (r.status === "present") e.present++;
  }

  const attByGroup = new Map(
    [...attGroupMap.entries()].map(([gid, e]) => [
      gid,
      { rate: e.total > 0 ? e.present / e.total : null, lessons: e.total },
    ]),
  );

  const gradeByGroup = new Map();
  for (const r of gradeRows) {
    const gid = r.groupId;
    if (!gradeByGroup.has(gid)) {
      gradeByGroup.set(gid, {
        recentAvg: null,
        priorAvg: null,
        count: 0,
        _recentSum: 0,
        _recentCount: 0,
        _priorSum: 0,
        _priorCount: 0,
      });
    }
    const e = gradeByGroup.get(gid);
    if (r.date >= windows.recentStart) {
      e._recentSum += r.value;
      e._recentCount++;
    } else {
      e._priorSum += r.value;
      e._priorCount++;
    }
  }

  for (const e of gradeByGroup.values()) {
    if (e._recentCount > 0) e.recentAvg = e._recentSum / e._recentCount;
    if (e._priorCount > 0) e.priorAvg = e._priorSum / e._priorCount;
    e.count = e._recentCount + e._priorCount;
    delete e._recentSum;
    delete e._recentCount;
    delete e._priorSum;
    delete e._priorCount;
  }

  const out = new Map();
  for (const t of teachers) {
    let lessons = 0;
    let present = 0;
    let gradeDelta = 0;
    let gradeSamples = 0;
    let groupsWithGrades = 0;

    for (const gid of t.groupIds) {
      const a = attByGroup.get(String(gid));
      if (a?.lessons) {
        lessons += a.lessons;
        present += a.rate * a.lessons;
      }
      const g = gradeByGroup.get(String(gid));
      if (g?.recentAvg != null && g?.priorAvg != null) {
        gradeDelta += g.recentAvg - g.priorAvg;
        gradeSamples += g.count;
        groupsWithGrades += 1;
      }
    }

    out.set(String(t.id || t._id), {
      attendanceRate: lessons > 0 ? present / lessons : null,
      lessons,
      gradeImprovement: groupsWithGrades > 0 ? gradeDelta / groupsWithGrades : null,
      gradeSamples,
      groupsWithGrades,
    });
  }
  return out;
};

export const teacherPaymentSignal = async (teachers, now) => {
  const allGroupIds = [...new Set(teachers.flatMap((t) => t.groupIds.map(String)))];
  if (!allGroupIds.length) return new Map();

  const since = new Date(now.getTime() - 182 * DAY_MS);

  const rows = await prisma.paymentTransaction.findMany({
    where: {
      groupId: { in: allGroupIds },
      paidAt: { gte: since },
    },
    select: { groupId: true, studentId: true, year: true, month: true, paidAt: true },
  });

  const periodMap = new Map();
  for (const r of rows) {
    const key = `${r.groupId}-${r.studentId}-${r.year}-${r.month}`;
    if (!periodMap.has(key)) {
      periodMap.set(key, {
        groupId: r.groupId,
        year: r.year,
        month: r.month,
        lastPaidAt: r.paidAt,
      });
    }
    const e = periodMap.get(key);
    if (r.paidAt > e.lastPaidAt) e.lastPaidAt = r.paidAt;
  }

  const byGroup = new Map();
  for (const r of periodMap.values()) {
    const gid = r.groupId;
    if (!byGroup.has(gid)) byGroup.set(gid, { periods: 0, onTime: 0 });
    const entry = byGroup.get(gid);
    const periodEnd = new Date(Date.UTC(r.year, r.month, 0));
    const lateDays = Math.floor((r.lastPaidAt - periodEnd) / DAY_MS);
    entry.periods += 1;
    if (lateDays <= 5) entry.onTime += 1;
  }

  const out = new Map();
  for (const t of teachers) {
    let periods = 0;
    let onTime = 0;
    for (const gid of t.groupIds) {
      const g = byGroup.get(String(gid));
      if (!g) continue;
      periods += g.periods;
      onTime += g.onTime;
    }
    out.set(String(t.id || t._id), {
      periods,
      onTime,
      onTimeRatio: periods > 0 ? onTime / periods : null,
    });
  }
  return out;
};

export const teacherBaseline = (outcomes, loads, payments) => {
  const rates = [...outcomes.values()].map((o) => o.attendanceRate).filter((v) => v != null);
  const improvements = [...outcomes.values()]
    .map((o) => o.gradeImprovement)
    .filter((v) => v != null);
  const studentCounts = [...loads.values()].map((l) => l.students).filter((v) => v > 0);

  const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);

  const payRatios = payments
    ? [...payments.values()].map((p) => p.onTimeRatio).filter((v) => v != null)
    : [];

  return {
    attendanceRate: mean(rates),
    gradeImprovement: mean(improvements),
    paymentOnTimeRatio: mean(payRatios),
    studentsPerTeacher: mean(studentCounts),
    sampleSize: Math.max(rates.length, improvements.length, studentCounts.length),
  };
};

export const collectTeacherSignals = async (branchId, now = new Date()) => {
  const { teachers, groups } = await loadTeachers(branchId);
  if (!teachers.length) return { teachers: [], groups, signals: new Map(), baseline: null };

  const teacherIds = teachers.map((t) => String(t.id || t._id));
  const groupIds = groups.map((g) => g.id || g._id);

  const [absence, loads, outcomes, payments] = await Promise.all([
    teacherAbsenceSignal(teacherIds, groupIds, now),
    teacherLoadSignal(teachers),
    teacherOutcomeSignal(teachers, now),
    teacherPaymentSignal(teachers, now),
  ]);

  const baseline = teacherBaseline(outcomes, loads, payments);

  const signals = new Map();
  for (const t of teachers) {
    const tid = String(t.id || t._id);
    signals.set(tid, {
      absence: absence.get(tid) || {
        hrAbsences: 0,
        hrThisWeek: 0,
        missedLessons: 0,
        missedThisWeek: 0,
        affectedGroups: 0,
        lastDate: null,
        hrIds: [],
        lessonIds: [],
      },
      load: loads.get(tid) || { groups: 0, students: 0, perGroup: [], avgPerGroup: 0 },
      outcome: outcomes.get(tid) || {
        attendanceRate: null,
        lessons: 0,
        gradeImprovement: null,
        gradeSamples: 0,
        groupsWithGrades: 0,
      },
      payment: payments.get(tid) || { periods: 0, onTime: 0, onTimeRatio: null },
      baseline,
    });
  }
  return { teachers, groups, signals, baseline };
};
