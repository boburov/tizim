import crypto from "node:crypto";
import prisma from "../../../config/prisma.js";
import logger from "../../../config/logger.js";
import { generateFinanceExplanation, isNarrationConfigured } from "../../ai/services/gemini.service.js";
import { openBudget } from "../../ai/services/aiBudget.service.js";

/**
 * ══════════════════════════════════════════════════════════════════════
 * IZOH QATLAMI — LLM IXTIYORIY, MAJBURIY EMAS
 * ══════════════════════════════════════════════════════════════════════
 *
 * ── UCH BOSQICHLI ZAXIRA ──
 *   1. keshdagi izoh          (arzon, tez)
 *   2. LLM izohi              (agar sozlangan va byudjet ochiq bo'lsa)
 *   3. DETERMINISTIK matn     (har doim ishlaydi)
 *
 * Uchinchisi ENG MUHIMI: LLM o'chirilgan, kaliti yo'q yoki limiti
 * tugagan bo'lsa ham foydalanuvchi to'liq tushunarli izoh oladi.
 * "AI ishlamayapti" degan bo'sh ekran bo'lmaydi.
 *
 * ── LLM RAQAM O'ZGARTIRA OLMAYDI ──
 * Javob faqat MATN sifatida saqlanadi. Barcha raqamlar signalning
 * o'zida (`evidence[]`) qoladi va UI ularni AYNAN o'sha yerdan
 * ko'rsatadi. Ya'ni model raqamni noto'g'ri takrorlasa ham,
 * ekrandagi son o'zgarmaydi.
 *
 * ── HAR RENDERDA LLM CHAQIRILMAYDI (talab O) ──
 * Izoh FAQAT foydalanuvchi "Nega bunday?" tugmasini bosganda
 * so'raladi va natija keshlanadi. Dashboard ochilishida birorta
 * LLM so'rovi ketmaydi.
 */

// Kesh muddati: moliyaviy davr ichida faktlar o'zgarmaydi, lekin
// yangi to'lov kelsa raqamlar siljiydi — 6 soat oraliq shu ikkisi
// o'rtasidagi murosa.
const TTL_MS = 6 * 60 * 60 * 1000;

/**
 * KESH KALITI FAKTLARDAN quriladi, signal ID sidan emas.
 *
 * Sabab: bir xil ID li signal ertasi kuni BOSHQA raqamlarga ega
 * bo'ladi. ID bo'yicha keshlansa, eski izoh yangi raqamlar ustida
 * ko'rsatilib, ular bir-biriga zid bo'lardi.
 */
const cacheKey = (signal) => {
  const facts = JSON.stringify({
    t: signal.type,
    e: signal.entityId || null,
    v: signal.currentValue,
    p: signal.previousValue,
    ev: (signal.evidence || []).map((x) => [x.label, x.current, x.previous]),
  });
  return `fin-explain:${crypto.createHash("sha1").update(facts).digest("hex").slice(0, 32)}`;
};

/**
 * DETERMINISTIK IZOH — LLM'siz ham to'liq ma'noli.
 *
 * Bu ZAXIRA EMAS, ASOS: u har doim mavjud va LLM faqat uni
 * yaxshilaydi (gemini.service.js dagi bir xil falsafa).
 */
export const deterministicExplanation = (signal) => {
  const fmt = (v, unit) => {
    if (v === null || v === undefined) return "—";
    if (unit === "%") return `${v}%`;
    if (unit === "ta" || unit === "soat") return `${v} ${unit}`;
    return `${new Intl.NumberFormat("uz-UZ").format(Math.round(v))} so'm`;
  };
  const lines = (signal.evidence || []).slice(0, 4).map((e) => {
    const base = `${e.label}: ${fmt(e.current, e.unit)}`;
    if (e.previous === null || e.previous === undefined) return base;
    const chg = e.changePercent !== null && e.changePercent !== undefined
      ? ` (${e.changePercent > 0 ? "+" : ""}${e.changePercent}%)`
      : "";
    return `${base}, oldingi davrda ${fmt(e.previous, e.unit)}${chg}`;
  });
  return `${signal.title}. ${lines.join(". ")}.`;
};

/**
 * Signal uchun izoh.
 *
 * @param {object} signal — intellekt qoidasi chiqargan tuzilmali signal
 * @param {object} opts   — { useAi: boolean }
 */
export const explainSignal = async (signal, { useAi = true } = {}) => {
  const fallback = deterministicExplanation(signal);
  const base = {
    text: fallback,
    source: "deterministic",
    // Raqamlar HAR DOIM signalning o'zidan — matndan emas.
    evidence: signal.evidence || [],
  };

  if (!useAi || !isNarrationConfigured()) return base;

  const key = cacheKey(signal);
  try {
    const cached = await prisma.cache.findUnique({ where: { key } });
    if (cached && cached.expiresAt > new Date() && cached.value?.text) {
      return { ...base, text: cached.value.text, source: "ai_cached" };
    }
  } catch { /* kesh o'qilmasa — davom etamiz */ }

  // AI BYUDJETI (oylik chaqiruv limiti) — `aiBudget.service.js`.
  //
  // NEGA MUHIM: izoh foydalanuvchi bosganda so'raladi, ya'ni chaqiruv
  // soni foydalanuvchi xatti-harakatiga bog'liq. Limitsiz bu oyning
  // o'rtasida kutilmagan hisobga aylanardi.
  let budget = null;
  try {
    budget = await openBudget();
    if (budget && !budget.canSpend()) {
      return { ...base, source: "deterministic", note: "AI oylik limiti tugagan" };
    }
  } catch { /* byudjet o'qilmasa — LLM ni bloklamaymiz */ }

  const text = await generateFinanceExplanation(signal);
  if (!text) return base;
  // Faqat MUVAFFAQIYATLI chaqiruv sanaladi.
  try { budget?.spend(1); } catch { /* e'tiborsiz */ }

  try {
    await prisma.cache.upsert({
      where: { key },
      create: { key, value: { text, signalId: signal.id }, expiresAt: new Date(Date.now() + TTL_MS) },
      update: { value: { text, signalId: signal.id }, expiresAt: new Date(Date.now() + TTL_MS) },
    });
  } catch (err) {
    logger.warn({ err: err?.message }, "Moliyaviy izohni keshlab bo'lmadi");
  }

  return { ...base, text, source: "ai" };
};

export { cacheKey };
