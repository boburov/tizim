import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { StudentSignalService } from './signals/student.signal.js';
import { TeacherSignalService } from './signals/teacher.signal.js';
import { AiConfigService } from './ai-config.service.js';

import { ROLES } from "../../common/constants/permissions.js";
import { branchMatchStage } from "../../common/als/branch-context.js";
import { scorePaymentRisk } from "./scoring/payment.scoring.js";
import { scoreChurn } from "./scoring/churn.scoring.js";
import { scoreTeacher, qualifiesForRaise } from "./scoring/teacher.scoring.js";
import { sampleConfidence } from "./scoring/common.scoring.js";
import { fmtMoney } from "./insight-writer.service.js";
import { subjectHref } from "./subject-link.service.js";

/** REYTINGLAR — `services/ranking.service.js` ning ko'chirmasi. */
const DAY_MS = 24 * 60 * 60 * 1000;
const DEFAULT_LIMIT = 10;
export const RANKING_TYPES = ["payment_delay", "absence", "teacher"];

const clamp01 = (v: any) => Math.max(0, Math.min(1, v));

const nameOf = (u: any) => `${u.firstName || ""} ${u.lastName || ""}`.trim() || "Noma'lum";

const paymentDelayIndex = ({ discipline, debt }: any) => {
  const ratio = clamp01(discipline.lateRatio || 0);
  const avgDays = clamp01((discipline.avgLateDays || 0) / 30);
  const debtDays = clamp01((debt.debtDays || 0) / 90);
  const unpaid = clamp01((debt.periods || 0) / 4);
  return clamp01(0.3 * ratio + 0.18 * avgDays + 0.26 * debtDays + 0.26 * unpaid);
};

const paymentEvidenceConfidence = ({ discipline, debt }: any) =>
  sampleConfidence({
    observed: (discipline.periods || 0) + (debt.periods || 0),
    minSample: 2,
    fullSample: 8,
  });

const buildPaymentNote = (discipline: any,debt: any,monthlyExpected: any) => {
  if (debt.debtDays > 60) {
    return `${debt.periods} oylik to'lov ${debt.debtDays} kundan beri yopilmagan — bu yo'qotilgan pul bo'lib qolmoqda.`;
  }
  if (debt.debtAmount > 0) {
    return `Hozirgi qarzi ${fmtMoney(debt.debtAmount)} so'm.`;
  }
  if (discipline.lateRatio >= 0.5) {
    return `To'lovlarining yarmidan ko'pini kechiktiradi — to'lov sanasini kelishib olish kerak.`;
  }
  if (monthlyExpected > 0) {
    return `Joriy oyda ${fmtMoney(monthlyExpected)} so'm kutilmoqda.`;
  }
  return "";
};

const buildAbsenceNote = (streak: any,missRatio: any,sig: any) => {
  if ((streak.streak || 0) >= 3) {
    return `Oxirgi ${streak.streak} darsni ketma-ket qoldirdi — bu o'quvchi bilan ZUDLIK bilan ishlashimiz kerak.`;
  }
  if (missRatio >= 0.4) {
    return `Darslarning ${Math.round(missRatio * 100)}% ini qoldirgan — bu o'quvchi bilan ishlashimiz kerak.`;
  }
  if (sig.debt?.debtAmount > 0) {
    return `Dars qoldirish qarz bilan birga kelmoqda — sabab moliyaviy bo'lishi mumkin.`;
  }
  return `Davomati pasaymoqda — sababini so'rab ko'ring.`;
};

const buildTeacherNote = ({ result, raise, signals }: any) => {
  const best = result.dimensions
    .filter((d: any) => d.score != null)
    .sort((a: any,b: any) => b.score - a.score)[0];

  if (raise) {
    const reason =
      best?.key === "attendance"
        ? `o'quvchilarining davomati filial o'rtachasidan ${best.display}% yuqori`
        : best?.key === "grade"
          ? `o'quvchilarining bahosi filial o'rtachasidan ${best.display} ball tez o'smoqda`
          : `o'quvchilari filial o'rtachasidan ${best?.display}% ko'proq o'z vaqtida to'laydi`;
    return `Kuchli ko'rsatkich — ${reason}. Maoshini oshirishni ko'rib chiqing (miqdorni o'zingiz belgilaysiz).`;
  }

  const weak = result.dimensions
    .filter((d: any) => d.score != null)
    .sort((a: any,b: any) => a.score - b.score)[0];

  if (weak && weak.score < 0.35) {
    return weak.key === "attendance"
      ? `Guruhlarida davomat filial o'rtachasidan ${Math.abs(weak.display)}% past — sababini birga aniqlang.`
      : weak.key === "grade"
        ? `O'quvchilarining bahosi filial o'rtachasidek o'smayapti — metodik yordam kerak bo'lishi mumkin.`
        : `Guruhlarida to'lov intizomi past — ota-onalar bilan aloqani tekshiring.`;
  }

  if (signals.absence?.missedLessons > 0) {
    return `${signals.absence.missedLessons} ta dars o'tkazilmagan — ko'rsatkichga ta'sir qilmoqda.`;
  }
  return "";
};

const plainTotals = (totals: any) => {
  if (!totals) return {};
  if (typeof totals === 'string') {
      try { return JSON.parse(totals); } catch (e) { return {}; }
  }
  if (totals instanceof Map) return Object.fromEntries(totals);
  return { ...totals };
};

@Injectable()
export class RankingService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    private readonly students: StudentSignalService,
    private readonly teachers: TeacherSignalService,
    private readonly aiConfig: AiConfigService,
  ) {}

  private async loadStudents(branchId: any) {
  const groups = await this.prisma.group.findMany({
    where: { branchId: String(branchId), isDeleted: false },
    select: { id: true },
  });
  const groupIds = groups.map((g) => g.id);
  if (!groupIds.length) return [];

  const memberships = await this.prisma.groupMembership.findMany({
    where: { groupId: { in: groupIds }, leftAt: null, isDeleted: false },
    select: { studentId: true, groupId: true },
  });
  if (!memberships.length) return [];

  const byStudent = new Map();
  for (const m of memberships) {
    const sid = String(m.studentId);
    if (!byStudent.has(sid)) byStudent.set(sid, []);
    byStudent.get(sid).push(m.groupId);
  }

  const users = await this.prisma.user.findMany({
    where: {
      id: { in: [...byStudent.keys()] },
      role: ROLES.STUDENT,
      isActive: true,
      isDeleted: false,
      completedAt: null,
    },
    select: { id: true, firstName: true, lastName: true, enrolledAt: true },
  });

  return users.map((u) => ({
    ...u,
    _id: u.id,
    groupIds: byStudent.get(String(u.id)) || [],
  }));
}

  private async buildPaymentDelayRanking({ branchId, students, signals, config, limit }: any) {
  const monthly = await this.loadMonthlyExpected(students.map((s: any) => String(s._id)));

  const rows = [];
  let totalDebt = 0;

  for (const s of students) {
    const sid = String(s._id);
    const sig = signals.get(sid);
    if (!sig) continue;

    const { discipline, debt } = sig;
    if (!discipline.periods && !debt.periods) continue;

    const index = paymentDelayIndex(sig);
    if (index <= 0) continue;

    totalDebt += debt.debtAmount || 0;

    const risk = scorePaymentRisk(sig, config);

    const metrics = [];
    if (discipline.periods > 0) {
      metrics.push(
        {
          key: "lateRatio",
          label: "Kechikkan to'lovlar",
          value: Math.round((discipline.lateRatio || 0) * 100),
          unit: "%",
        },
        {
          key: "avgLateDays",
          label: "O'rtacha kechikish",
          value: Math.round(discipline.avgLateDays || 0),
          unit: "kun",
        },
      );
    }
    if (debt.periods > 0) {
      metrics.push({
        key: "unpaidPeriods",
        label: "Yopilmagan oylar",
        value: debt.periods,
        unit: "ta",
      });
    }
    if (debt.debtAmount > 0) {
      metrics.push(
        {
          key: "debtAmount",
          label: "Joriy qarz",
          value: Math.round(debt.debtAmount),
          unit: "so'm",
        },
        {
          key: "debtDays",
          label: "Qarz muddati",
          value: debt.debtDays || 0,
          unit: "kun",
        },
      );
    }

    rows.push({
      subjectType: "student",
      subjectId: s._id,
      label: nameOf(s),
      href: subjectHref("student", s._id),
      score: index,
      severity: risk.severity,
      confidence: paymentEvidenceConfidence(sig),
      metrics,
      note: buildPaymentNote(discipline, debt, monthly.get(sid) || 0),
    });
  }

  rows.sort((a, b) => b.score - a.score);
  return {
    type: "payment_delay",
    branchId,
    scanned: students.length,
    rows: rows.slice(0, limit).map((r, i) => ({ ...r, rank: i + 1 })),
    totals: { debtAmount: Math.round(totalDebt), affected: rows.length },
  };
}

  private async buildAbsenceRanking({ branchId, students, signals, config, limit }: any) {
  const rows = [];
  let totalMissed = 0;

  for (const s of students) {
    const sid = String(s._id);
    const sig = signals.get(sid);
    if (!sig) continue;

    const { attendance, streak } = sig;
    const lessons = attendance.lessons || 0;
    if (lessons < 4) continue;

    const rate = attendance.recentRate ?? 1;
    const missed = Math.round(lessons * (1 - rate));
    if (missed <= 0) continue;

    totalMissed += missed;

    const missRatio = clamp01(1 - rate);
    const streakScore = clamp01((streak.streak || 0) / 4);
    const index = clamp01(0.7 * missRatio + 0.3 * streakScore);

    const churn = scoreChurn(sig, config);

    rows.push({
      subjectType: "student",
      subjectId: s._id,
      label: nameOf(s),
      href: subjectHref("student", s._id),
      score: index,
      severity: churn.severity,
      confidence: churn.confidence,
      metrics: [
        { key: "missed", label: "Qoldirgan darslar", value: missed, unit: "ta" },
        { key: "lessons", label: "Jami darslar", value: lessons, unit: "ta" },
        {
          key: "attendanceRate",
          label: "Davomat",
          value: Math.round(rate * 100),
          unit: "%",
        },
        { key: "streak", label: "Ketma-ket", value: streak.streak || 0, unit: "ta" },
      ],
      note: buildAbsenceNote(streak, missRatio, sig),
    });
  }

  rows.sort((a, b) => b.score - a.score);
  return {
    type: "absence",
    branchId,
    scanned: students.length,
    rows: rows.slice(0, limit).map((r, i) => ({ ...r, rank: i + 1 })),
    totals: { missedLessons: totalMissed, affected: rows.length },
  };
}

  private async loadMonthlyExpected(studentIds: any) {
  if (!studentIds.length) return new Map();
  const now = new Date();
  
  const rows = await this.prisma.studentPayment.findMany({
    where: {
      AND: branchMatchStage("branchId"),
      studentId: { in: studentIds.map(String) },
      year: now.getUTCFullYear(),
      month: now.getUTCMonth() + 1,
    },
    select: { studentId: true, expectedAmount: true },
  });
  
  const byStudent = new Map();
  for (const r of rows) {
    const sid = r.studentId;
    if (!byStudent.has(sid)) byStudent.set(sid, 0);
    byStudent.set(sid, byStudent.get(sid) + r.expectedAmount);
  }
  return byStudent;
}

  private async buildTeacherRanking({ branchId, now, limit }: any) {
  const { teachers, signals, baseline } = await this.teachers.collectTeacherSignals(branchId, now);
  if (!teachers.length) {
    return { type: "teacher", branchId, scanned: 0, rows: [], totals: {} };
  }

  const scored = [];
  for (const t of (teachers) as any[]) {
    const tid = String(t.id || t._id);
    const sig = signals.get(tid);
    if (!sig) continue;

    const result = scoreTeacher(sig);
    if (result.score == null) continue;

    scored.push({ teacher: t, sig, result });
  }

  scored.sort((a, b) => b.result.score - a.result.score);

  const total = scored.length;
  const rows: any[] = [];
  let raiseCount = 0;

  scored.forEach((entry, i) => {
    const { teacher: t, sig, result } = entry;
    const raise = qualifiesForRaise(result, baseline, { rank: i + 1, total });
    if (raise) raiseCount += 1;

    const metrics = result.dimensions
      .filter((d) => d.score != null)
      .map((d) => ({
        key: d.key,
        label: d.label,
        value: d.display,
        unit: d.unit,
      }));

    metrics.push({
      key: "students",
      label: "O'quvchilari",
      value: sig.load.students || 0,
      unit: "ta",
    });

    rows.push({
      rank: i + 1,
      subjectType: "teacher",
      subjectId: t.id || t._id,
      label: `${t.firstName || ""} ${t.lastName || ""}`.trim() || "Noma'lum",
      href: subjectHref("teacher", t.id || t._id),
      score: result.score,
      severity: raise ? "high" : result.score >= 0.5 ? "medium" : "low",
      confidence: result.confidence,
      metrics,
      note: buildTeacherNote({ result, raise, signals: sig }),
    });
  });

  return {
    type: "teacher",
    branchId,
    scanned: teachers.length,
    rows: rows.slice(0, limit),
    totals: { raiseCandidates: raiseCount, ranked: total },
  };
}

  async recomputeRankings(branchId: any,{ limit = DEFAULT_LIMIT }: any = {}) {
  const now = new Date();
  const config = await this.aiConfig.resolveConfig(branchId);
  const students = await this.loadStudents(branchId);

  const teacher = await this.buildTeacherRanking({ branchId, now, limit });
  await this.saveRanking(teacher);

  if (!students.length) {
    await this.saveRanking({ type: "payment_delay", branchId, scanned: 0, rows: [], totals: {} });
    await this.saveRanking({ type: "absence", branchId, scanned: 0, rows: [], totals: {} });
    return { payment_delay: 0, absence: 0, teacher: teacher.rows.length };
  }

  const signals = await this.students.collectStudentSignals(students, now);

  const payment = await this.buildPaymentDelayRanking({
    branchId,
    students,
    signals,
    config,
    limit,
  });
  const absence = await this.buildAbsenceRanking({
    branchId,
    students,
    signals,
    config,
    limit,
  });

  await this.saveRanking(payment);
  await this.saveRanking(absence);

  return {
    payment_delay: payment.rows.length,
    absence: absence.rows.length,
    teacher: teacher.rows.length,
  };
}

  async saveRanking({ type, branchId, scanned, rows, totals }: any) {
  await this.prisma.aiRanking.upsert({
    where: { branchId_type: { branchId, type } },
    update: {
      generatedAt: new Date(),
      scanned: scanned || 0,
      rows: rows || [],
      totals: totals || {},
    },
    create: {
      branchId,
      type,
      generatedAt: new Date(),
      scanned: scanned || 0,
      rows: rows || [],
      totals: totals || {},
    },
  });
}

  async readRanking(branchId: any,type: any) {
  const doc = await this.prisma.aiRanking.findUnique({
    where: { branchId_type: { branchId, type } },
  });
  if (!doc) return null;
  return {
    type: doc.type,
    generatedAt: doc.generatedAt,
    scanned: doc.scanned,
    rows: typeof doc.rows === 'string' ? JSON.parse(doc.rows) : doc.rows || [],
    totals: plainTotals(doc.totals),
    staleDays: Math.floor((Date.now() - new Date(doc.generatedAt).getTime()) / DAY_MS),
  };
}

  async readAllRankings(branchId: any,types: any = RANKING_TYPES) {
  const docs = await this.prisma.aiRanking.findMany({
    where: { branchId, type: { in: types } },
  });
  const byType = new Map(docs.map((d) => [d.type, d]));
  const out: any = {};
  for (const t of types) {
    const doc = byType.get(t);
    out[t] = doc
      ? {
          type: doc.type,
          generatedAt: doc.generatedAt,
          scanned: doc.scanned,
          rows: typeof doc.rows === 'string' ? JSON.parse(doc.rows) : doc.rows || [],
          totals: plainTotals(doc.totals),
        }
      : null;
  }
  return out;
}
}