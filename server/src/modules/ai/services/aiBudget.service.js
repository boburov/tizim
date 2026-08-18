import prisma from "../../../config/prisma.js";
import {
  usageMonthKey,
  estimateCostUsd,
} from "../../../constants/aiUsage.js";
import { getLimit, isFeatureEnabled, UNLIMITED } from "../../../config/entitlements.js";
import env from "../../../config/env.js";
import logger from "../../../config/logger.js";

// AI BYUDJETI - pullik qatlamning tannarx tormozi.
//
// ==========  IKKI XIL TEKSHIRUV, IKKI XIL YIQILISH  ==========
//
// Bu faylda AI bilan bog'liq ikkita butunlay boshqa savol bor va
// ularning standart javobi TESKARI:
//
//   "Mijozda AI bormi?"      → aloqa yo'q bo'lsa: HA (ochiq yiqiladi)
//   "Byudjet qolganmi?"      → aloqa yo'q bo'lsa: mahalliy chegara (yopiq)
//
// Birinchisi mijozga tegishli: admin server o'chgani uchun to'lagan
// odamning sahifasini o'chirib qo'yish mumkin emas. Ikkinchisi bizning
// pulimizga tegishli: xuddi shu uzilishda chegarani "cheksiz" deb
// o'qish har oy hisobni ochiq qoldirardi.
//
// Aynan shuning uchun amaldagi chegara har doim MIN(tarif, env).

/** Entitlement kaliti - admin serverdagi feature nomi bilan bir xil. */
export const AI_FEATURE_KEY = "ai_advisor";
const CALLS_FEATURE_KEY = "ai_calls_month";

/** Mijozning tarifida AI qatlami bormi. Aloqa yo'q bo'lsa - ha. */
export const isAiEnabled = () => isFeatureEnabled(AI_FEATURE_KEY);

/**
 * Amaldagi oylik chaqiruv chegarasi.
 *
 * Tarifdan kelgan qiymat yo'q yoki "cheksiz" bo'lsa - mahalliy chegara
 * olinadi. Ikkalasi ham bor bo'lsa - kichigi.
 */
export const resolveCallCap = () => {
  const local = Number(env.AI_MONTHLY_CALL_CAP);
  const localCap = Number.isFinite(local) && local >= 0 ? local : 4000;

  const plan = getLimit(CALLS_FEATURE_KEY);
  if (plan === UNLIMITED || !Number.isFinite(plan) || plan < 0) return localCap;

  return Math.min(plan, localCap);
};

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
export const monthlyUsage = async (monthKey = usageMonthKey()) => {
  // `$cond: ["$ok", 1, 0]` — SHARTLI SANOQ. Prisma `aggregate` buni
  // qila olmaydi (u faqat butun to'plamni yig'adi), shuning uchun
  // SQL `FILTER (WHERE ...)`.
  //
  // NARX MUVAFFAQIYATSIZ CHAQIRUVDA HAM SANALADI (yuqoridagi izoh):
  // token sarflangan bo'lsa provayder baribir pul oladi.
  const [row] = await prisma.$queryRaw`
    SELECT
      COUNT(*) FILTER (WHERE "ok")::int            AS calls,
      COUNT(*) FILTER (WHERE NOT "ok")::int        AS failed,
      COALESCE(SUM("costUsd"), 0)::float           AS "costUsd",
      COALESCE(SUM("inputTokens"), 0)::int         AS "inputTokens",
      COALESCE(SUM("outputTokens"), 0)::int        AS "outputTokens"
    FROM "ai_usage_logs"
    WHERE "monthKey" = ${monthKey}
  `;

  const num = (v) => Number(v) || 0;
  return {
    monthKey,
    calls: num(row?.calls),
    failed: num(row?.failed),
    costUsd: Number(num(row?.costUsd).toFixed(4)),
    inputTokens: num(row?.inputTokens),
    outputTokens: num(row?.outputTokens),
  };
};

/**
 * Bir yurish uchun byudjet "sessiyasi".
 *
 * Bazaga BIR MARTA murojaat qiladi, keyin hisobni xotirada yuritadi.
 * Har chaqiruvdan oldin countDocuments() qilish soatiga 100 ta ortiqcha
 * so'rov bo'lardi va hech qanday aniqlik qo'shmasdi - navbat yagona
 * yozuvchi.
 */
export const openBudget = async () => {
  const cap = resolveCallCap();
  const usage = await monthlyUsage();

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
};

/**
 * Bitta chaqiruvni jurnalga yozadi.
 *
 * XATO YUTILADI: hisob yozuvi yozilmagani uchun narrator ishlamay
 * qolishi mumkin emas. Jurnal - kuzatuv vositasi, mahsulot mantiqi emas.
 */
export const recordUsage = async ({
  branchId = null,
  provider,
  model,
  kind,
  inputTokens = 0,
  outputTokens = 0,
  latencyMs = 0,
  ok = true,
  errorCode = "",
}) => {
  try {
    await prisma.aiUsageLog.create({
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
    logger.warn({ err: err.message }, "AI usage jurnaliga yozilmadi");
  }
};
