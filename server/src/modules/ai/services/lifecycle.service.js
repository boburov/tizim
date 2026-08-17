import prisma from "../../../config/prisma.js";
import logger from "../../../config/logger.js";

const DAY_MS = 24 * 60 * 60 * 1000;

const OUTCOME_WINDOW_DAYS = 30;
const PRUNE_AFTER_DAYS = 365;

export const expireStale = async (now = new Date()) => {
  const res = await prisma.insight.updateMany({
    where: {
      status: { in: ["open", "acked"] },
      expiresAt: { not: null, lt: now },
    },
    data: {
      status: "expired",
      resolvedAt: now,
      outcome: "unknown",
      outcomeCheckedAt: now,
    },
  });
  return res.count || 0;
};

export const evaluateOutcomes = async (now = new Date()) => {
  const cutoff = new Date(now.getTime() - OUTCOME_WINDOW_DAYS * DAY_MS);

  const pending = await prisma.insight.findMany({
    where: {
      status: { in: ["done", "dismissed", "expired"] },
      outcome: "pending",
      resolvedAt: { not: null, lt: cutoff },
      kind: { in: ["student_churn_risk", "payment_risk"] },
    },
    select: { id: true, kind: true, subjectId: true, resolvedAt: true },
    take: 500,
  });

  if (!pending.length) return { checked: 0, occurred: 0, prevented: 0 };

  const churn = pending.filter((i) => i.kind === "student_churn_risk");
  const payment = pending.filter((i) => i.kind === "payment_risk");

  const occurredIds = new Set();

  if (churn.length) {
    const ids = churn.map((i) => String(i.subjectId));
    const left = await prisma.groupMembership.findMany({
      where: {
        studentId: { in: ids },
        leftReason: "removed",
        leftAt: { not: null },
        isDeleted: false,
      },
      select: { studentId: true, leftAt: true },
    });

    const leftByStudent = new Map();
    for (const m of left) {
      const sid = String(m.studentId);
      const prev = leftByStudent.get(sid);
      if (!prev || m.leftAt > prev) leftByStudent.set(sid, m.leftAt);
    }

    for (const insight of churn) {
      const leftAt = leftByStudent.get(String(insight.subjectId));
      if (leftAt && new Date(leftAt) >= new Date(insight.resolvedAt)) {
        occurredIds.add(String(insight.id));
      }
    }
  }

  if (payment.length) {
    const ids = payment.map((i) => String(i.subjectId));
    const stillOwing = await prisma.studentPayment.findMany({
      where: {
        studentId: { in: ids },
        writtenOff: false,
        status: { in: ["unpaid", "partial"] },
      },
      select: { studentId: true, expectedAmount: true, paidAmount: true },
    });

    const owing = new Set();
    for (const r of stillOwing) {
      if (r.expectedAmount > r.paidAmount) owing.add(String(r.studentId));
    }

    for (const insight of payment) {
      if (owing.has(String(insight.subjectId))) occurredIds.add(String(insight.id));
    }
  }

  const occurred = [...occurredIds];
  const prevented = pending
    .filter((i) => !occurredIds.has(String(i.id)))
    .map((i) => i.id);

  await Promise.all([
    occurred.length
      ? prisma.insight.updateMany({
          where: { id: { in: occurred } },
          data: { outcome: "occurred", outcomeCheckedAt: now },
        })
      : null,
    prevented.length
      ? prisma.insight.updateMany({
          where: { id: { in: prevented } },
          data: { outcome: "prevented", outcomeCheckedAt: now },
        })
      : null,
  ]);

  return {
    checked: pending.length,
    occurred: occurred.length,
    prevented: prevented.length,
  };
};

export const pruneOld = async (now = new Date()) => {
  const cutoff = new Date(now.getTime() - PRUNE_AFTER_DAYS * DAY_MS);
  const res = await prisma.insight.deleteMany({
    where: {
      status: { in: ["done", "expired"] },
      resolvedAt: { not: null, lt: cutoff },
      outcome: { not: "pending" },
    },
  });
  return res.count || 0;
};

export const runLifecycle = async (now = new Date()) => {
  const expired = await expireStale(now);
  const outcomes = await evaluateOutcomes(now);
  const pruned = await pruneOld(now);

  logger.info({ expired, ...outcomes, pruned }, "AI insight hayot sikli");
  return { expired, outcomes, pruned };
};

export { OUTCOME_WINDOW_DAYS, PRUNE_AFTER_DAYS };
