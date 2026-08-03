import crypto from "node:crypto";
import env from "../../../config/env.js";
import logger from "../../../config/logger.js";
import { recordUsage } from "./aiBudget.service.js";

// GEMINI NARRATOR - deterministik shablonning USTIGA qo'yiladigan qatlam.
//
// ==========  LLM QAYERDA TURADI (VA QAYERDA TURMAYDI)  ==========
//
//   signals → scoring → factors[] → [GEMINI] → o'zbekcha matn
//                        ▲                       │
//                        └── raqamlar shu yerda  └── faqat SO'ZLAR
//
// LLM TAHLIL QILMAYDI. U ball hisoblamaydi, xavf baholamaydi, tavsiya
// o'ylab topmaydi. Uning yagona ishi - tayyor raqamlarni yaxshi
// o'zbekchaga aylantirish.
//
// Nega chegara aynan shu yerda:
//
//  1. TEKSHIRIB BO'LADI. Kirish faktorlari bazadagi hujjatlardan chiqadi
//     va har birining ortida "Ishingni ko'rsat" havolasi turadi. LLM
//     tahlil qilsa, uning xulosasini hech narsa bilan tekshirib
//     bo'lmasdi.
//  2. TAKRORLANADI. Bir xil ma'lumot → bir xil ball. LLM ball bersa,
//     bir xil o'quvchi ertalab 72%, kechqurun 68% chiqardi va owner
//     raqamga ishonishni to'xtatardi.
//  3. ARZON. Faqat matn generatsiyasi - qisqa prompt, qisqa javob.
//  4. YIQILSA HECH NARSA BUZILMAYDI. LLM ishlamasa shablon matn qoladi
//     va tizim to'liq funksional bo'lib turaveradi.
//
// Aynan shuning uchun narration.service.js dagi `narrate()` O'CHIRILMAYDI:
// u zaxira emas, ASOS. Gemini uni bezaydi.

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// Bepul darajada so'rov soni cheklangan, shuning uchun timeout qisqa:
// javob kechiksa - shablonga qaytamiz, kutib turmaymiz. Bu fon job
// bo'lgani uchun hech kim ekranda kutmaydi, lekin osilib qolgan so'rov
// navbatni to'xtatib qo'yardi.
const TIMEOUT_MS = 15000;

/**
 * QABUL QILINADIGAN ENG QISQA IZOH.
 *
 * Avval 10 edi va bu JIMGINA NUQSON keltirib chiqardi: kesilgan javob
 * ("Umida G'aniyevning ke") 10 dan uzun bo'lgani uchun tekshiruvdan
 * o'tib, to'liq shablon matnni ALMASHTIRIB yuborardi. Natijada LLM
 * yoqilgan filialda matn shablondagidan YOMONROQ bo'lardi.
 *
 * 40 - eng qisqa haqiqiy jumladan ham past, lekin har qanday kesilgan
 * bo'lakdan yuqori. Chegara "to'g'ri" tomonga xato qiladi: shubhali
 * matnni rad etib, shablonni qoldirish har doim xavfsizroq.
 */
const MIN_NARRATION_LENGTH = 40;
const MAX_NARRATION_LENGTH = 600;

export { MIN_NARRATION_LENGTH };

export const isNarrationConfigured = () => Boolean(env.GEMINI_API_KEY);

/**
 * FAKTOR BARMOQ IZI - keshning kaliti.
 *
 * Faqat MA'NOGA ta'sir qiladigan maydonlar kiritiladi (tur, subyekt,
 * faktor kaliti va qiymati, ta'sir summasi). generatedAt yoki score kabi
 * har hisoblashda mikro-o'zgaradigan maydonlar KIRITILMAYDI - aks holda
 * kesh hech qachon tegmasdi va tungi job har kuni 400 ta so'rov yuborardi.
 */
export const narrationHash = (insight) => {
  const seed = JSON.stringify({
    kind: insight.kind,
    subject: String(insight.subjectId),
    // Qiymat yaxlitlanadi: 12.3 → 12. Bir baravar farq matnni
    // o'zgartirmaydi, lekin keshni buzardi.
    factors: (insight.factors || [])
      .filter((f) => f.normalized > 0.05)
      .map((f) => [f.key, Math.round(f.value)]),
    impact: Math.round((insight.expectedImpact?.amount || 0) / 10000),
  });
  return crypto.createHash("sha1").update(seed).digest("hex");
};

/**
 * PROMPT - qat'iy va tor.
 *
 * Uchta qoida promptda ochiq aytiladi, chunki ularsiz model tipik
 * xatolarni qiladi:
 *
 *   • RAQAM O'YLAB TOPMA - LLM "taxminan 15 ta dars" deb yumaloqlashga
 *     moyil, bu esa kartadagi aniq son bilan ZIDDIYAT beradi va owner
 *     qaysi biriga ishonishni bilmay qoladi.
 *   • QISQA - model uzun, xushmuomala paragraf yozishga moyil. Owner
 *     har kuni 20 ta karta o'qiydi.
 *   • MASLAHAT BERMA - tavsiyalar deterministik ravishda scoring
 *     qatlamida yaratilgan va kartada alohida ro'yxatda turadi. LLM
 *     qo'shsa, ikki xil (va ba'zan qarama-qarshi) maslahat chiqardi.
 */
const buildPrompt = (insight) => {
  const factors = (insight.factors || [])
    .filter((f) => f.normalized > 0.05)
    .slice(0, 5)
    .map((f) => `- ${f.label}: ${f.value}${f.unit ? " " + f.unit : ""}`)
    .join("\n");

  const stanceHint =
    insight.stance === "opportunity"
      ? "Bu IMKONIYAT (muammo emas) - ohang ijobiy bo'lsin."
      : "Bu XAVF - ohang xotirjam va aniq bo'lsin, vahimasiz.";

  return `Sen o'quv markazi rahbari uchun qisqa xulosa yozadigan yordamchisan.

QOIDALAR:
1. FAQAT quyida berilgan raqamlardan foydalan. Yangi raqam, foiz yoki sana O'YLAB TOPMA.
2. Eng ko'pi 2 ta jumla. Qisqa bo'lsin.
3. Maslahat yoki tavsiya BERMA - u alohida ko'rsatiladi.
4. O'zbek tilida, lotin yozuvida yoz. Rasmiy, lekin sodda.
5. Raqamlarni shunchaki sanab chiqma - ular NIMANI anglatishini ayt.

${stanceHint}

MAVZU: ${insight.title || insight.subjectLabel}
SUBYEKT: ${insight.subjectLabel}
MA'LUMOTLAR:
${factors || "- qo'shimcha ma'lumot yo'q"}

Xulosa:`;
};

/**
 * Gemini'ga bitta so'rov. Xato → null (chaqiruvchi shablonga qaytadi).
 *
 * XATO YUTILADI, TASHLANMAYDI: narrator ixtiyoriy bezak. Uning xatosi
 * tungi qayta hisoblashni to'xtatsa, bitta API uzilishi butun AI
 * markazini bir kunga o'chirib qo'yardi.
 *
 * HAR BIR CHIQISH JURNALGA YOZILADI - muvaffaqiyatlisi ham, xatosi ham.
 * Sabab: AI qatlami pullik sotiladi va tannarxi o'lchanmasa, oyning
 * oxirida faqat Google hisobidagi umumiy raqam qoladi. Xato yozuvlari
 * esa chegarani to'g'ri tanlash uchun kerak - 429 naqshi ko'rinmasa,
 * limit past qo'yilganini bilib bo'lmaydi.
 */
export const generateNarration = async (insight, model = env.GEMINI_MODEL) => {
  if (!isNarrationConfigured()) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  const startedAt = Date.now();

  // Har chiqish yo'lida bir xil yoziladi, shuning uchun bitta joyda.
  const log = (ok, errorCode, usage = {}) =>
    recordUsage({
      branchId: insight?.branchId || null,
      provider: "gemini",
      model,
      kind: "narration",
      inputTokens: usage.promptTokenCount || 0,
      outputTokens: usage.candidatesTokenCount || 0,
      latencyMs: Date.now() - startedAt,
      ok,
      errorCode,
    });

  try {
    const res = await fetch(
      `${API_BASE}/${model}:generateContent?key=${env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: buildPrompt(insight) }] }],
          generationConfig: {
            // Past harorat: bu ijodiy vazifa emas. Yuqori haroratda model
            // "chiroyli" jumla uchun raqamni bo'rttirishga moyil bo'ladi.
            temperature: 0.3,

            // MULOHAZA O'CHIRILGAN - eng muhim sozlama shu yerda.
            //
            // gemini-2.5-flash standart holatda "thinking" rejimida
            // ishlaydi va MULOHAZA TOKENLARI ham maxOutputTokens ichidan
            // sanaladi. 200 limit bilan model butun byudjetni mulohazaga
            // sarflab, ko'rinadigan javobga 5-10 token qoldirardi -
            // matn so'z o'rtasida kesilardi ("Umida G'aniyevning ke").
            //
            // Bu vazifa uchun mulohaza umuman kerak emas: raqamlar
            // allaqachon hisoblangan, model faqat ularni jumlaga
            // aylantiradi. Byudjetni 0 qilish ham tezroq, ham arzonroq.
            thinkingConfig: { thinkingBudget: 0 },

            // 2 jumla ≈ 60-80 token. 300 - zaxira bilan, chunki o'zbek
            // tili tokenizatsiyada inglizchadan zichroq chiqadi.
            maxOutputTokens: 300,
          },
        }),
        signal: controller.signal,
      },
    );

    if (!res.ok) {
      // 429 (limit) alohida darajada: bu kutilgan holat, xato emas -
      // bepul darajada kunlik limit tugashi normal.
      const level = res.status === 429 ? "debug" : "warn";
      logger[level]({ status: res.status }, "Gemini narrator javob bermadi");
      await log(false, String(res.status));
      return null;
    }

    const data = await res.json();
    const usage = data?.usageMetadata || {};
    const candidate = data?.candidates?.[0];

    // TUGASH SABABINI TEKSHIRAMIZ, matnni emas.
    //
    // "MAX_TOKENS" - javob kesilgan degani. Uzunlik tekshiruvi buni
    // ba'zan tutadi, lekin har doim emas: model 39 ta belgi yozib
    // kesilsa, matn "yetarli uzun" ko'rinardi. Provayder o'zi aytgan
    // haqiqatga ishonish taxmin qilishdan aniqroq.
    const finishReason = candidate?.finishReason;
    if (finishReason && finishReason !== "STOP") {
      logger.debug({ finishReason }, "Gemini javobi to'liq tugamadi");
      await log(false, `finish_${String(finishReason).toLowerCase()}`, usage);
      return null;
    }

    const text = candidate?.content?.parts?.[0]?.text;
    if (!text) {
      // Bo'sh javob TOKEN SARFLAGAN bo'lishi mumkin (masalan xavfsizlik
      // filtri kesib tashlagan), shuning uchun ok: false bo'lsa ham
      // usage yoziladi - aks holda tannarx kam ko'rinardi.
      await log(false, "empty", usage);
      return null;
    }

    const clean = text.trim();
    // Juda qisqa yoki g'ayritabiiy uzun javob ishlatilmaydi: shablon
    // matn undan har doim yaxshiroq.
    if (clean.length < MIN_NARRATION_LENGTH || clean.length > MAX_NARRATION_LENGTH) {
      logger.debug({ length: clean.length }, "Gemini izohi rad etildi (uzunlik)");
      await log(false, "invalid_length", usage);
      return null;
    }

    await log(true, "", usage);
    return clean;
  } catch (err) {
    const aborted = err?.name === "AbortError";
    if (!aborted) {
      logger.warn({ err: err.message }, "Gemini narrator xatosi");
    }
    await log(false, aborted ? "timeout" : "network");
    return null;
  } finally {
    clearTimeout(timer);
  }
};
