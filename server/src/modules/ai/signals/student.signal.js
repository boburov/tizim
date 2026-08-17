import prisma from "../../../config/prisma.js";
import {
  branchMatchStage,
  branchGroupMatchStage,
} from "../../../helpers/branchContext.helper.js";

const DAY_MS = 24 * 60 * 60 * 1000;
export const WINDOW_DAYS = 28;

const utcMidnight = (d) => {
  const x = new Date(d);
  return new Date(Date.UTC(x.getUTCFullYear(), x.getUTCMonth(), x.getUTCDate()));
};

export const buildWindows = (now = new Date()) => {
  const end = utcMidnight(now);
  const recentStart = new Date(end.getTime() - WINDOW_DAYS * DAY_MS);
  const priorStart = new Date(end.getTime() - 2 * WINDOW_DAYS * DAY_MS);
  return { priorStart, recentStart, end };
};

export const attendanceSignal = async (studentIds, windows) => {
  const { priorStart, recentStart, end } = windows;
  const branchStage = await branchGroupMatchStage("groupId");

  const rows = await prisma.attendance.findMany({
    where: {
      AND: branchStage,
      isDeleted: false,
      studentId: { in: studentIds.map(String) },
      date: { gte: priorStart, lt: end },
      status: { in: ["present", "absent"] },
    },
    select: { studentId: true, date: true, status: true, lateMinutes: true, id: true },
  });

  const out = new Map();
  for (const r of rows) {
    const sid = r.studentId;
    if (!out.has(sid)) {
      out.set(sid, {
        recentRate: null,
        priorRate: null,
        drop: 0,
        lessons: 0,
        lateMinutes: 0,
        absentIds: [],
        _recentTotal: 0,
        _recentPresent: 0,
        _priorTotal: 0,
        _priorPresent: 0,
      });
    }
    const cur = out.get(sid);
    const isRecent = r.date >= recentStart;

    if (isRecent) {
      cur._recentTotal++;
      if (r.status === "present") cur._recentPresent++;
      else if (cur.absentIds.length < 20) cur.absentIds.push(r.id);
      cur.lateMinutes += r.lateMinutes || 0;
    } else {
      cur._priorTotal++;
      if (r.status === "present") cur._priorPresent++;
    }
  }

  for (const v of out.values()) {
    if (v._recentTotal > 0) {
      v.recentRate = v._recentPresent / v._recentTotal;
      v.lessons = v._recentTotal;
    }
    if (v._priorTotal > 0) {
      v.priorRate = v._priorPresent / v._priorTotal;
    }
    if (v.priorRate != null && v.recentRate != null && v.priorRate > 0) {
      v.drop = Math.max(0, (v.priorRate - v.recentRate) / v.priorRate);
    }
    delete v._recentTotal;
    delete v._recentPresent;
    delete v._priorTotal;
    delete v._priorPresent;
  }
  return out;
};

export const absenceStreakSignal = async (studentIds, windows) => {
  const branchStage = await branchGroupMatchStage("groupId");
  const since = new Date(windows.end.getTime() - 90 * DAY_MS);

  const rows = await prisma.attendance.findMany({
    where: {
      AND: branchStage,
      isDeleted: false,
      studentId: { in: studentIds.map(String) },
      date: { gte: since },
      status: { in: ["present", "absent"] },
    },
    orderBy: { date: "desc" },
    select: { studentId: true, status: true, id: true },
  });

  const out = new Map();
  for (const r of rows) {
    const sid = r.studentId;
    if (!out.has(sid)) {
      out.set(sid, { streak: 0, ids: [], _broken: false });
    }
    const cur = out.get(sid);
    if (!cur._broken && cur.ids.length < 20) {
      if (r.status === "absent") {
        cur.streak++;
        cur.ids.push(r.id);
      } else {
        cur._broken = true;
      }
    }
  }

  for (const v of out.values()) {
    delete v._broken;
  }
  return out;
};

export const gradeSignal = async (studentIds, windows) => {
  const { priorStart, recentStart, end } = windows;
  const branchStage = await branchGroupMatchStage("groupId");

  const rows = await prisma.grade.findMany({
    where: {
      AND: branchStage,
      isDeleted: false,
      studentId: { in: studentIds.map(String) },
      date: { gte: priorStart, lt: end },
    },
    select: { studentId: true, value: true, date: true, id: true },
  });

  const out = new Map();
  for (const r of rows) {
    const sid = r.studentId;
    if (!out.has(sid)) {
      out.set(sid, {
        recentAvg: null,
        priorAvg: null,
        delta: 0,
        improvement: 0,
        count: 0,
        ids: [],
        _recentSum: 0,
        _recentCount: 0,
        _priorSum: 0,
        _priorCount: 0,
      });
    }
    const cur = out.get(sid);
    const isRecent = r.date >= recentStart;

    if (isRecent) {
      cur._recentSum += r.value;
      cur._recentCount++;
      if (cur.ids.length < 20) cur.ids.push(r.id);
    } else {
      cur._priorSum += r.value;
      cur._priorCount++;
    }
  }

  for (const v of out.values()) {
    if (v._recentCount > 0) {
      v.recentAvg = v._recentSum / v._recentCount;
      v.count = v._recentCount;
    }
    if (v._priorCount > 0) {
      v.priorAvg = v._priorSum / v._priorCount;
    }
    if (v.priorAvg != null && v.recentAvg != null) {
      v.delta = Math.max(0, v.priorAvg - v.recentAvg);
      v.improvement = Math.max(0, v.recentAvg - v.priorAvg);
    }
    delete v._recentSum;
    delete v._recentCount;
    delete v._priorSum;
    delete v._priorCount;
  }
  return out;
};

export const weekdayPatternSignal = async (studentIds, windows) => {
  const branchStage = await branchGroupMatchStage("groupId");
  const since = new Date(windows.end.getTime() - 90 * DAY_MS);

  const rows = await prisma.attendance.findMany({
    where: {
      AND: branchStage,
      isDeleted: false,
      studentId: { in: studentIds.map(String) },
      date: { gte: since, lt: windows.end },
      status: { in: ["present", "absent"] },
    },
    select: { studentId: true, dateKey: true, status: true, id: true },
  });

  const byStudent = new Map();
  for (const r of rows) {
    const sid = r.studentId;
    if (!byStudent.has(sid)) byStudent.set(sid, { days: [], total: 0, absent: 0 });
    const entry = byStudent.get(sid);

    const [y, m, d] = r.dateKey.split("-");
    const dt = new Date(Date.UTC(y, m - 1, d));
    const dow = dt.getUTCDay() + 1;

    let dayEntry = entry.days.find((x) => x.dow === dow);
    if (!dayEntry) {
      dayEntry = { dow, total: 0, absent: 0, rate: 0, ids: [] };
      entry.days.push(dayEntry);
    }

    dayEntry.total++;
    entry.total++;

    if (r.status === "absent") {
      dayEntry.absent++;
      entry.absent++;
      if (dayEntry.ids.length < 10) dayEntry.ids.push(r.id);
    }
  }

  const out = new Map();
  for (const [sid, entry] of byStudent) {
    for (const d of entry.days) {
      d.rate = d.total > 0 ? d.absent / d.total : 0;
    }
    const overallRate = entry.total > 0 ? entry.absent / entry.total : 0;
    const eligible = entry.days.filter((d) => d.total >= 4);
    let worst = null;
    for (const d of eligible) {
      if (!worst || d.rate > worst.rate) worst = d;
    }
    out.set(sid, {
      worstDay: worst?.dow ?? null,
      worstRate: worst?.rate ?? 0,
      worstTotal: worst?.total ?? 0,
      worstAbsences: worst?.absent ?? 0,
      overallRate,
      gap: worst ? Math.max(0, worst.rate - overallRate) : 0,
      sampleIds: worst?.ids || [],
    });
  }
  return out;
};

export const debtSignal = async (studentIds, now) => {
  const branchStage = branchMatchStage("branchId");
  const rows = await prisma.studentPayment.findMany({
    where: {
      AND: branchStage,
      studentId: { in: studentIds.map(String) },
      writtenOff: false,
      status: { in: ["unpaid", "partial"] },
    },
    select: {
      studentId: true,
      expectedAmount: true,
      paidAmount: true,
      year: true,
      month: true,
      id: true,
    },
  });

  const filteredRows = rows.filter((r) => r.expectedAmount > r.paidAmount);

  const byStudent = new Map();
  for (const r of filteredRows) {
    const sid = r.studentId;
    if (!byStudent.has(sid)) {
      byStudent.set(sid, {
        debtAmount: 0,
        periods: 0,
        oldestYear: Infinity,
        oldestMonth: Infinity,
        ids: [],
        debtDays: 0,
      });
    }
    const entry = byStudent.get(sid);
    entry.debtAmount += r.expectedAmount - r.paidAmount;
    entry.periods++;
    if (
      r.year < entry.oldestYear ||
      (r.year === entry.oldestYear && r.month < entry.oldestMonth)
    ) {
      entry.oldestYear = r.year;
      entry.oldestMonth = r.month;
    }
    if (entry.ids.length < 20) entry.ids.push(r.id);
  }

  for (const entry of byStudent.values()) {
    if (entry.oldestYear !== Infinity) {
      const periodEnd = new Date(Date.UTC(entry.oldestYear, entry.oldestMonth, 0));
      entry.debtDays = Math.max(
        0,
        Math.floor((now.getTime() - periodEnd.getTime()) / DAY_MS),
      );
    }
    delete entry.oldestMonth;
  }
  return byStudent;
};

export const groupChurnSignal = async (windows) => {
  const branchStage = await branchGroupMatchStage("groupId");
  const since = new Date(windows.end.getTime() - 90 * DAY_MS);

  const rows = await prisma.groupMembership.findMany({
    where: {
      AND: branchStage,
      isDeleted: false,
    },
    select: { groupId: true, leftReason: true, leftAt: true },
  });

  const out = new Map();
  for (const r of rows) {
    const gid = r.groupId;
    if (!out.has(gid)) out.set(gid, { rate: 0, left: 0, total: 0 });
    const cur = out.get(gid);
    cur.total++;
    if (r.leftReason === "removed" && r.leftAt && r.leftAt >= since) {
      cur.left++;
    }
  }

  for (const v of out.values()) {
    v.rate = v.total > 0 ? v.left / v.total : 0;
  }
  return out;
};

export const paymentDisciplineSignal = async (studentIds, now) => {
  const since = new Date(now.getTime() - 365 * DAY_MS);
  const branchStage = branchMatchStage("branchId");

  const rows = await prisma.paymentTransaction.findMany({
    where: {
      AND: branchStage,
      studentId: { in: studentIds.map(String) },
      paidAt: { gte: since },
    },
    select: {
      studentId: true,
      year: true,
      month: true,
      paidAt: true,
      amount: true,
    },
  });

  const groupMap = new Map();
  for (const r of rows) {
    const key = `${r.studentId}-${r.year}-${r.month}`;
    if (!groupMap.has(key)) {
      groupMap.set(key, {
        studentId: r.studentId,
        year: r.year,
        month: r.month,
        lastPaidAt: r.paidAt,
        total: 0,
      });
    }
    const cur = groupMap.get(key);
    cur.total += r.amount;
    if (r.paidAt > cur.lastPaidAt) cur.lastPaidAt = r.paidAt;
  }

  const byStudent = new Map();
  for (const r of groupMap.values()) {
    const sid = String(r.studentId);
    if (!byStudent.has(sid)) {
      byStudent.set(sid, { periods: 0, lateCount: 0, totalLateDays: 0 });
    }
    const entry = byStudent.get(sid);
    const periodEnd = new Date(Date.UTC(r.year, r.month, 0));
    const lateDays = Math.floor((r.lastPaidAt - periodEnd) / DAY_MS);
    entry.periods += 1;
    if (lateDays > 5) {
      entry.lateCount += 1;
      entry.totalLateDays += lateDays;
    }
  }

  for (const v of byStudent.values()) {
    v.lateRatio = v.periods > 0 ? v.lateCount / v.periods : 0;
    v.avgLateDays = v.lateCount > 0 ? v.totalLateDays / v.lateCount : 0;
  }
  return byStudent;
};

export const freezeSignal = async (studentIds) => {
  const rows = await prisma.studentFreeze.findMany({
    where: {
      studentId: { in: studentIds.map(String) },
      isDeleted: false,
    },
    select: { studentId: true, id: true },
  });

  const out = new Map();
  for (const r of rows) {
    const sid = r.studentId;
    if (!out.has(sid)) out.set(sid, { count: 0, ids: [] });
    const cur = out.get(sid);
    cur.count++;
    if (cur.ids.length < 10) cur.ids.push(r.id);
  }
  return out;
};

export const collectStudentSignals = async (students, now = new Date()) => {
  const windows = buildWindows(now);
  const ids = students.map((s) => String(s.id || s._id));
  if (!ids.length) return new Map();

  const [
    attendance,
    streak,
    grades,
    debt,
    groupChurn,
    freeze,
    discipline,
    weekday,
  ] = await Promise.all([
    attendanceSignal(ids, windows),
    absenceStreakSignal(ids, windows),
    gradeSignal(ids, windows),
    debtSignal(ids, now),
    groupChurnSignal(windows),
    freezeSignal(ids),
    paymentDisciplineSignal(ids, now),
    weekdayPatternSignal(ids, windows),
  ]);

  const out = new Map();
  for (const s of students) {
    const sid = String(s.id || s._id);
    const att = attendance.get(sid) || {
      recentRate: null,
      priorRate: null,
      drop: 0,
      lessons: 0,
      lateMinutes: 0,
      absentIds: [],
    };

    let worstGroup = { rate: 0, left: 0, total: 0, groupId: null };
    for (const gid of s.groupIds || []) {
      const g = groupChurn.get(String(gid));
      if (g && g.rate > worstGroup.rate) worstGroup = { ...g, groupId: gid };
    }

    const enrolledDays = s.enrolledAt
      ? Math.max(
          0,
          Math.floor((now.getTime() - new Date(s.enrolledAt).getTime()) / DAY_MS),
        )
      : null;

    out.set(sid, {
      windows,
      enrolledDays,
      attendance: att,
      streak: streak.get(sid) || { streak: 0, ids: [] },
      grades: grades.get(sid) || {
        recentAvg: null,
        priorAvg: null,
        delta: 0,
        improvement: 0,
        count: 0,
        ids: [],
      },
      weekday: weekday.get(sid) || {
        worstDay: null,
        worstRate: 0,
        worstTotal: 0,
        worstAbsences: 0,
        overallRate: 0,
        gap: 0,
        sampleIds: [],
      },
      debt: debt.get(sid) || { debtAmount: 0, periods: 0, debtDays: 0, ids: [] },
      groupChurn: worstGroup,
      freeze: freeze.get(sid) || { count: 0, ids: [] },
      discipline: discipline.get(sid) || {
        periods: 0,
        lateCount: 0,
        totalLateDays: 0,
        lateRatio: 0,
        avgLateDays: 0,
      },
    });
  }
  return out;
};
