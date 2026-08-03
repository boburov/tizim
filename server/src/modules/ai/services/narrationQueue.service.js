import Insight from "../../../models/insight.model.js";
import AiConfig from "../../../models/aiConfig.model.js";
import env from "../../../config/env.js";
import logger from "../../../config/logger.js";
import {
  generateNarration,
  isNarrationConfigured,
  narrationHash,
} from "./gemini.service.js";
import { isAiEnabled, openBudget } from "./aiBudget.service.js";

// NARRATOR NAVBATI - LLM matnini FON REJIMIDA yozadi.
//
// ==========  NEGA FON, SO'ROV ICHIDA EMAS  ==========
//
// Eng oson yo'l "insight yaratilayotganda Gemini'ni chaqirish" bo'lardi.
// U ikki sababga ko'ra noto'g'ri:
//
//  1. Tungi qayta hisoblash 400 ta insight yozadi. Har biriga 1-2
//     soniyalik API chaqiruvi qo'shilsa, job 5 soniyadan 10 daqiqaga
//     cho'ziladi va bepul daraja limitiga bir zumda uriladi.
//  2. Agar Gemini javob bermay osilib qolsa, QAYTA HISOBLASHNING O'ZI
//     to'xtaydi. Ixtiyoriy bezak asosiy funksiyani yiqitmasligi kerak.
//
// Shuning uchun: qayta hisoblash shablon matn bilan DARHOL yozadi
// (`narration` to'ldirilgan bo'ladi), keyin bu navbat asta-sekin uni
// yaxshilangan matnga ALMASHTIRADI. Owner sahifani ochganda har doim
// matn ko'radi - faqat u vaqt o'tishi bilan sifatliroq bo'ladi.

// Bir yurishda nechta insight narrate qilinadi.
//
// 25: bepul daraja daqiqadagi limitiga urilmaslik uchun ataylab past.
// Job soatiga bir marta ishlaydi, ya'ni kuniga ~600 ta - bu 400 ta
// insightlik markaz uchun yetarlidan ortiq, chunki kesh tufayli
// ko'pchiligi qayta so'ralmaydi.
const BATCH_SIZE = 25;

/**
 * Narrate qilish kerak bo'lgan insight'lar.
 *
 * Ikki holat tanlanadi:
 *   • narrationModel: null   → hali LLM tegmagan (shablon matn turibdi)
 *   • narrationHash farq qiladi → faktorlar o'zgargan, matn eskirgan
 *
 * Ikkinchi shart Mongo so'rovida ifodalab bo'lmaydi (hash hujjatdan
 * hisoblanadi), shuning uchun nomzodlar kengroq olinadi va JS da
 * filtrlanadi. Ustuvorlik bo'yicha saralash MUHIM: cheklangan
 * budjetni eng qimmat insight'larga sarflaymiz.
 */
const loadCandidates = async (limit) =>
  Insight.find({ status: { $in: ["open", "acked"] } })
    .sort({ narrationModel: 1, priority: -1 })
    .limit(limit * 4)
    .lean();

/**
 * Bir yurish: nomzodlarni topadi, Gemini'ga yuboradi, matnni yozadi.
 *
 * KETMA-KET, parallel emas: bepul daraja daqiqadagi so'rov soniga
 * cheklov qo'yadi va 25 ta parallel so'rov darhol 429 oladi. Bu fon
 * ishi - tezlik muhim emas.
 */
export const runNarrationQueue = async ({ limit = BATCH_SIZE } = {}) => {
  if (!isNarrationConfigured()) {
    return { skipped: true, reason: "GEMINI_API_KEY yo'q" };
  }

  // TARIF TEKSHIRUVI. AI qatlami pullik - tarifida yo'q tenantda
  // narrator umuman ishlamaydi va bu HECH NARSANI buzmaydi: shablon
  // matn joyida turadi, dashboard to'liq ishlaydi.
  if (!isAiEnabled()) {
    return { skipped: true, reason: "tarifda ai_advisor yo'q" };
  }

  // BYUDJET TEKSHIRUVI. Chegara tugagan bo'lsa yurish umuman
  // boshlanmaydi - nomzodlarni yuklash ham keraksiz.
  const budget = await openBudget();
  if (!budget.canSpend()) {
    return {
      skipped: true,
      reason: "oylik chegara tugadi",
      used: budget.used,
      cap: budget.cap,
    };
  }

  // Filial darajasida o'chirilgan bo'lsa - hurmat qilinadi.
  // Konfiguratsiya insight yozilgandan KEYIN o'zgargan bo'lishi mumkin,
  // shuning uchun tekshiruv har yurishda qayta o'qiladi.
  const configs = await AiConfig.find({}).select("branchId narrationEnabled").lean();
  const disabled = new Set(
    configs.filter((c) => !c.narrationEnabled).map((c) => String(c.branchId)),
  );

  // Bu yurishda yozish mumkin bo'lgan eng katta son: navbat o'lchami va
  // oyda qolgan byudjetning kichigi. Oy oxirida navbat o'zi kichrayadi.
  const runLimit = Math.min(limit, budget.remaining);

  const candidates = await loadCandidates(runLimit);
  let written = 0;
  let skipped = 0;
  let failed = 0;

  for (const insight of candidates) {
    if (written >= runLimit) break;
    // Byudjet yurish DAVOMIDA ham tekshiriladi: bir vaqtning o'zida
    // boshqa manba (masalan qo'lda recompute) sarflagan bo'lishi mumkin.
    if (!budget.canSpend()) break;
    if (disabled.has(String(insight.branchId))) {
      skipped += 1;
      continue;
    }

    const hash = narrationHash(insight);
    // Matn allaqachon SHU faktorlar uchun yozilgan - o'tkazib yuboramiz.
    if (insight.narrationModel && insight.narrationHash === hash) {
      skipped += 1;
      continue;
    }

    const text = await generateNarration(insight);
    if (!text) {
      // Xato yoki limit. Hujjat TEGILMAYDI: shablon matn joyida qoladi
      // va keyingi yurishda qayta urinib ko'riladi.
      failed += 1;
      continue;
    }

    await Insight.updateOne(
      { _id: insight._id },
      {
        $set: {
          narration: text,
          narrationHash: hash,
          narrationModel: env.GEMINI_MODEL,
        },
      },
    );
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

/** Jurnalga yozadigan o'ram - job shuni chaqiradi. */
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
