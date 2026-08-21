import { Inject, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ConfigService } from '@nestjs/config';
import type { AppConfig } from '../../config/env.validation.js';
import { EntitlementsService, UNLIMITED } from '../../common/entitlements/entitlements.service.js';

import {
  usageMonthKey,
  estimateCostUsd,
} from "../../common/utils/ai-usage.js";

/**
 * AI BYUDJETI — `services/aiBudget.service.js` ning KO'CHIRMASI.
 *
 * ⚠ IKKI XIL YIQILISH SAQLANDI: "mijozda AI bormi" OCHIQ yiqiladi
 * (aloqa yo'q → ha), "byudjet qolganmi" esa YOPIQ (aloqa yo'q →
 * mahalliy chegara). Amaldagi chegara har doim MIN(tarif, env).
 */
export const AI_FEATURE_KEY = "ai_advisor";
const CALLS_FEATURE_KEY = "ai_calls_month";

@Injectable()
export class AiBudgetService {
  private readonly logger = new Logger('AiBudget');

  private readonly env: { AI_MONTHLY_CALL_CAP: number };

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(ConfigService) config: ConfigService<AppConfig, true>,
    private readonly entitlements: EntitlementsService,
  ) {
    this.env = {
      AI_MONTHLY_CALL_CAP: config.get('AI_MONTHLY_CALL_CAP', { infer: true }),
    };
  }

  /** Mijozning tarifida AI qatlami bormi. Aloqa yo'q bo'lsa - ha. */
  isAiEnabled() {
  return this.entitlements.isFeatureEnabled(AI_FEATURE_KEY);
}

  /**
   * Amaldagi oylik chaqiruv chegarasi.
   *
   * Tarifdan kelgan qiymat yo'q yoki "cheksiz" bo'lsa - mahalliy chegara
   * olinadi. Ikkalasi ham bor bo'lsa - kichigi.
   */
  resolveCallCap() {
  const local = Number(this.env.AI_MONTHLY_CALL_CAP);
  const localCap = Number.isFinite(local) && local >= 0 ? local : 4000;

  const plan = this.entitlements.getLimit(CALLS_FEATURE_KEY);
  if (plan === UNLIMITED || !Number.isFinite(plan) || plan < 0) return localCap;

  return Math.min(plan, localCap);
}

  /**
   * Joriy oyning sarfi.
   *
   * CHAQIRUV va NARX ATAYLAB BOSHQACHA SANALADI:
   *
   *   calls   → faqat `ok: true`. Mijoz "4000 ta izoh" sotib oldi,
   *             bizning 429 xatolarimizni emas. Chegara shu bo'yicha.
   *   costUsd → HAMMASI. Kesilgan yoki juda uzun javob token sarflagan
   *             bo'lishi mumkin: u mijozga yozilmaydi, lekin bizga
   *             tushadi. Faqat muvaffaqiyatlisini sanash real tannarxni
   *             kamaytirib ko'rsatardi.
   */
  async monthlyUsage(monthKey = usageMonthKey()) {
  // `$cond: ["$ok", 1, 0]` — SHARTLI SANOQ. Prisma `aggregate` buni
  // qila olmaydi (u faqat butun to'plamni yig'adi), shuning uchun
  // SQL `FILTER (WHERE ...)`.
  //
  // NARX MUVAFFAQIYATSIZ CHAQIRUVDA HAM SANALADI (yuqoridagi izoh):
  // token sarflangan bo'lsa provayder baribir pul oladi.
  const [row] = (await this.prisma.$queryRaw`
    SELECT
      COUNT(*) FILTER (WHERE "ok")::int            AS calls,
      COUNT(*) FILTER (WHERE NOT "ok")::int        AS failed,
      COALESCE(SUM("costUsd"), 0)::float           AS "costUsd",
      COALESCE(SUM("inputTokens"), 0)::int         AS "inputTokens",
      COALESCE(SUM("outputTokens"), 0)::int        AS "outputTokens"
    FROM "ai_usage_logs"
    WHERE "monthKey" = ${monthKey}
  `) as any[];

  const num = (v: any) => Number(v) || 0;
  return {
    monthKey,
    calls: num(row?.calls),
    failed: num(row?.failed),
    costUsd: Number(num(row?.costUsd).toFixed(4)),
    inputTokens: num(row?.inputTokens),
    outputTokens: num(row?.outputTokens),
  };
}

  /**
   * Bir yurish uchun byudjet "sessiyasi".
   *
   * Bazaga BIR MARTA murojaat qiladi, keyin hisobni xotirada yuritadi.
   * Har chaqiruvdan oldin countDocuments() qilish soatiga 100 ta ortiqcha
   * so'rov bo'lardi va hech qanday aniqlik qo'shmasdi - navbat yagona
   * yozuvchi.
   */
  async openBudget() {
  const cap = this.resolveCallCap();
  const usage = await this.monthlyUsage();

  let spent = 0;

  return {
    monthKey: usage.monthKey,
    cap,
    usedAtStart: usage.calls,
    costUsdAtStart: usage.costUsd,

    get used() {
      return usage.calls + spent;
    },
    get remaining() {
      return Math.max(0, cap - (usage.calls + spent));
    },

    /** Yana bitta chaqiruvga joy bormi. */
    canSpend() {
      return usage.calls + spent < cap;
    },

    /** Muvaffaqiyatli chaqiruvdan KEYIN chaqiriladi. */
    spend(n = 1) {
      spent += n;
    },
  };
}

  /**
   * Bitta chaqiruvni jurnalga yozadi.
   *
   * XATO YUTILADI: hisob yozuvi yozilmagani uchun narrator ishlamay
   * qolishi mumkin emas. Jurnal - kuzatuv vositasi, mahsulot mantiqi emas.
   */
  async recordUsage({
  branchId = null,
  provider,
  model,
  kind,
  inputTokens = 0,
  outputTokens = 0,
  latencyMs = 0,
  ok = true,
  errorCode = "",
}: any) {
  try {
    await this.prisma.aiUsageLog.create({
      data: {
      branchId: branchId ? String(branchId) : null,
      monthKey: usageMonthKey(),
      provider,
      model,
      kind,
      inputTokens,
      outputTokens,
      // Token sarflangan bo'lsa narx yoziladi - chaqiruv muvaffaqiyatli
      // bo'lmagan taqdirda ham. 429 va tarmoq xatosida token 0 keladi,
      // ya'ni bu shart alohida tekshiruvsiz o'zi to'g'ri ishlaydi.
      costUsd: estimateCostUsd(model, inputTokens, outputTokens),
      latencyMs,
      ok,
      errorCode,
      },
    });
  } catch (err) {
    // ⚠ JIMGINA YUTILMASIN: sarf jurnali yozilmasa byudjet hisobi
    // kam ko'rsatadi va chegara kech ishlaydi.
    this.logger.warn(`AI usage jurnaliga yozilmadi: ${(err as Error).message}`);
  }
}
}