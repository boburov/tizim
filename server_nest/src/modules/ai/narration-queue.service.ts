import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/env.validation.js';
import { GeminiService } from './gemini.service.js';
import { AiBudgetService } from './ai-budget.service.js';

import { MIN_NARRATION_LENGTH } from './gemini.service.js';

/**
 * NARRATOR NAVBATI — `services/narrationQueue.service.js` ning KO'CHIRMASI.
 */
const BATCH_SIZE = 25;

@Injectable()
export class NarrationQueueService {
  private readonly logger = new Logger('AiNarrationQueue');

  private readonly env: { GEMINI_MODEL: string };

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) config: ConfigService<AppConfig, true>,
    private readonly gemini: GeminiService,
    private readonly budget: AiBudgetService,
  ) {
    this.env = { GEMINI_MODEL: config.get('GEMINI_MODEL', { infer: true }) };
  }

  private async loadCandidates(limit: any) {
  const candidates = await this.prisma.insight.findMany({
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
}

  async runNarrationQueue({ limit = BATCH_SIZE } = {}) {
  if (!this.gemini.isNarrationConfigured()) {
    return { skipped: true, reason: "GEMINI_API_KEY yo'q" };
  }

  if (!this.budget.isAiEnabled()) {
    return { skipped: true, reason: "tarifda ai_advisor yo'q" };
  }

  const budget = await this.budget.openBudget();
  if (!budget.canSpend()) {
    return {
      skipped: true,
      reason: "oylik chegara tugadi",
      used: budget.used,
      cap: budget.cap,
    };
  }

  const configs = await this.prisma.aiConfig.findMany({
    select: { branchId: true, narrationEnabled: true },
  });
  const disabled = new Set(
    configs.filter((c) => !c.narrationEnabled).map((c) => String(c.branchId)),
  );

  const runLimit = Math.min(limit, budget.remaining);

  const candidates = await this.loadCandidates(runLimit);
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

    const hash = this.gemini.narrationHash(insight);
    const looksTruncated = (insight.narration || "").length < MIN_NARRATION_LENGTH;
    if (insight.narrationModel && insight.narrationHash === hash && !looksTruncated) {
      skipped += 1;
      continue;
    }

    const text = await this.gemini.generateNarration(insight);
    if (!text) {
      failed += 1;
      continue;
    }

    await this.prisma.insight.update({
      where: { id: insight.id },
      data: {
        narration: text,
        narrationHash: hash,
        narrationModel: this.env.GEMINI_MODEL,
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
}

  async runNarrationQueueLogged() {
  const startedAt = Date.now();
  const result = await this.runNarrationQueue();
  if (result.skipped) {
    this.logger.debug(result, "AI narrator o'chiq");
    return result;
  }
  this.logger.log({ ...result, ms: Date.now() - startedAt }, "AI narrator yurishi tayyor");
  return result;
}
}