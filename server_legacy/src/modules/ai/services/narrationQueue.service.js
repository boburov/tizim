import prisma from "../../../config/prisma.js";
import env from "../../../config/env.js";
import logger from "../../../config/logger.js";
import {
  generateNarration,
  isNarrationConfigured,
  narrationHash,
  MIN_NARRATION_LENGTH,
} from "./gemini.service.js";
import { isAiEnabled, openBudget } from "./aiBudget.service.js";

const BATCH_SIZE = 25;

const loadCandidates = async (limit) => {
  const candidates = await prisma.insight.findMany({
    where: { status: { in: ["open", "acked"] } },
    orderBy: { priority: "desc" },
    take: limit * 4,
  });

  return candidates.sort((a, b) => {
    const aModel = a.narrationModel ? 1 : 0;
    const bModel = b.narrationModel ? 1 : 0;
    if (aModel !== bModel) return aModel - bModel;
    return b.priority - a.priority;
  });
};

export const runNarrationQueue = async ({ limit = BATCH_SIZE } = {}) => {
  if (!isNarrationConfigured()) {
    return { skipped: true, reason: "GEMINI_API_KEY yo'q" };
  }

  if (!isAiEnabled()) {
    return { skipped: true, reason: "tarifda ai_advisor yo'q" };
  }

  const budget = await openBudget();
  if (!budget.canSpend()) {
    return {
      skipped: true,
      reason: "oylik chegara tugadi",
      used: budget.used,
      cap: budget.cap,
    };
  }

  const configs = await prisma.aiConfig.findMany({
    select: { branchId: true, narrationEnabled: true },
  });
  const disabled = new Set(
    configs.filter((c) => !c.narrationEnabled).map((c) => String(c.branchId)),
  );

  const runLimit = Math.min(limit, budget.remaining);

  const candidates = await loadCandidates(runLimit);
  let written = 0;
  let skipped = 0;
  let failed = 0;

  for (const insight of candidates) {
    if (written >= runLimit) break;
    if (!budget.canSpend()) break;
    if (disabled.has(String(insight.branchId))) {
      skipped += 1;
      continue;
    }

    const hash = narrationHash(insight);
    const looksTruncated = (insight.narration || "").length < MIN_NARRATION_LENGTH;
    if (insight.narrationModel && insight.narrationHash === hash && !looksTruncated) {
      skipped += 1;
      continue;
    }

    const text = await generateNarration(insight);
    if (!text) {
      failed += 1;
      continue;
    }

    await prisma.insight.update({
      where: { id: insight.id },
      data: {
        narration: text,
        narrationHash: hash,
        narrationModel: env.GEMINI_MODEL,
      },
    });
    
    written += 1;
    budget.spend();
  }

  return {
    written,
    skipped,
    failed,
    candidates: candidates.length,
    monthKey: budget.monthKey,
    used: budget.used,
    cap: budget.cap,
    remaining: budget.remaining,
  };
};

export const runNarrationQueueLogged = async () => {
  const startedAt = Date.now();
  const result = await runNarrationQueue();
  if (result.skipped) {
    logger.debug(result, "AI narrator o'chiq");
    return result;
  }
  logger.info({ ...result, ms: Date.now() - startedAt }, "AI narrator yurishi tayyor");
  return result;
};
