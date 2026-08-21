// SOTUV VORONKASI DIAGNOZI - oylik sintez.
//
// SAVOL: "sotuv qaysi qismda pasaymoqda va nega?"
//
// ==========  QAT'IY MEHNAT TAQSIMOTI  ==========
//
//   QOIDA (kod)                          LLM
//   ─────────────────────────────         ─────────────────────────
//   bosqichma-bosqich konversiya %        NEGA tushayotgani
//   kanal bo'yicha samaradorlik           qaysi gipoteza kuchli
//   yo'nalish bo'yicha talab              qanday amal qilish kerak
//   yo'qotish sabablari sanog'i           qaysi sabab hal qilinadi
//
// LLM voronkani O'LCHAMAYDI - raqamlar lead.signal.js dan tayyor keladi.
// U faqat "63% dan 21% ga tushdi" faktini SABAB bilan bog'laydi.
//
// Nega bu chegara: LLM foizni o'zi hisoblasa, ikki xil oyda bir xil
// ma'lumotdan ikki xil raqam chiqarardi va owner hisobotga ishonmasdi.

/**
 * @param {object} input - HAMMASI kodda hisoblangan
 * @param {string} input.periodLabel
 * @param {Array}  input.stages   - [{ stage, count, conversionFromPrev }]
 * @param {Array}  input.sources  - [{ name, leads, enrolled, rate }]
 * @param {Array}  input.directions - [{ name, leads, enrolled, rate }]
 * @param {Array}  input.lossReasons - [{ reason, count, share }]
 * @param {object} [input.prevPeriod] - { enrolled, rate } taqqoslash uchun
 */
export const buildPrompt = (input) => {
  const {
    periodLabel,
    stages = [],
    sources = [],
    directions = [],
    lossReasons = [],
    prevPeriod = null,
  } = input;

  const stageLines = stages
    .map(
      (s) =>
        `  ${s.stage}: ${s.count} ta` +
        (s.conversionFromPrev != null
          ? ` (oldingi bosqichdan ${s.conversionFromPrev}%)`
          : ""),
    )
    .join("\n");

  const sourceLines = sources
    .map((s) => `  ${s.name}: ${s.leads} lid → ${s.enrolled} yozildi (${s.rate}%)`)
    .join("\n");

  const directionLines = directions
    .map((d) => `  ${d.name}: ${d.leads} lid → ${d.enrolled} yozildi (${d.rate}%)`)
    .join("\n");

  const lossLines = lossReasons
    .map((l) => `  ${l.reason}: ${l.count} ta (${l.share}%)`)
    .join("\n");

  return `Sen o'quv markazining sotuv bo'yicha maslahatchisisan.
Quyidagi raqamlar TIZIM TOMONIDAN HISOBLANGAN. Ularni qayta hisoblama,
o'zgartirma - faqat SHARHLA va nima qilish kerakligini ayt.

## DAVR: ${periodLabel}

### Voronka bosqichlari
${stageLines || "  (ma'lumot yo'q)"}

### Kanallar bo'yicha
${sourceLines || "  (ma'lumot yo'q)"}

### Yo'nalishlar bo'yicha
${directionLines || "  (ma'lumot yo'q)"}

### Yo'qotish sabablari
${lossLines || "  (ma'lumot yo'q)"}
${
  prevPeriod
    ? `\n### Oldingi davr\n  ${prevPeriod.enrolled} yozilgan, umumiy konversiya ${prevPeriod.rate}%`
    : ""
}

## VAZIFA

FAQAT JSON qaytar:

{
  "biggestLeak": {
    "stage": "<eng ko'p yo'qotilayotgan bosqich nomi>",
    "why": "<nega aynan shu yerda tushayotgani, 1-2 jumla>"
  },
  "rootCauses": [
    {
      "cause": "<sabab, 1 jumla>",
      "evidence": "<yuqoridagi QAYSI raqamga tayanyapsan>",
      "confidence": "<high | medium | low>"
    }
  ],
  "actions": [
    {
      "action": "<aniq amal, 1 jumla>",
      "target": "<qaysi bosqich/kanal/yo'nalishga>",
      "effort": "<low | medium | high>",
      "expectedEffect": "<kutilayotgan natija, raqamsiz>"
    }
  ],
  "wasteAlert": "<pul behuda ketayotgan kanal yoki bo'sh string>",
  "summary": "<owner uchun 2 jumlalik xulosa, o'zbekcha>"
}

## QOIDALAR

1. FAQAT JSON. Markdown bloki, izoh YO'Q.

2. YANGI RAQAM CHIQARMA. "20% ga oshadi" kabi bashorat YOZMA - sen
   bashorat qila olmaysan. "expectedEffect" ni SIFAT tilida yoz:
   "trial'ga kelish oshadi" (yaxshi), "konversiya 15% oshadi" (YOMON).

3. Har bir "rootCause" da "evidence" MAJBURIY va u yuqoridagi ANIQ raqamga
   ishora qilsin: "Instagram: 40 lid → 2 yozildi (5%)". Dalilsiz sabab -
   taxmin, va u owner'ni noto'g'ri qarorga olib boradi.

4. "confidence" mezoni:
   - high   : bitta raqam ochiq ko'rsatib turibdi
   - medium : ikki raqamni bog'lash kerak
   - low    : mantiqiy taxmin, dalil kuchsiz
   low bo'lsa ham yoz - lekin ochiq "low" deb belgila.

5. "actions" 2 tadan 4 tagacha. Ko'p bo'lsa hech biri bajarilmaydi.
   Eng arzon va eng ta'sirlisi BIRINCHI tursin.

6. "wasteAlert" - lid ko'p beradigan, lekin deyarli yozdirmaydigan kanal
   bo'lsa. Yo'q bo'lsa bo'sh string.

7. Ma'lumot yetarli bo'lmasa (bosqichlar bo'sh, lid soni juda kam) buni
   OCHIQ ayt: "summary" da "xulosa uchun ma'lumot yetarli emas" deb yoz va
   "rootCauses" ni bo'sh massiv qaytar. Kam ma'lumotdan qat'iy xulosa
   chiqarish - eng zararli xato.

8. Barcha matn o'zbekcha.`;
};

export const SCHEMA = {
  biggestLeak: {
    type: "object",
    fields: {
      stage: { type: "string", max: 60, fallback: "" },
      why: { type: "string", max: 300, fallback: "" },
    },
  },
  rootCauses: {
    type: "array",
    max: 6,
    item: {
      cause: { type: "string", max: 200, fallback: "" },
      evidence: { type: "string", max: 200, fallback: "" },
      confidence: { type: "enum", values: ["high", "medium", "low"], fallback: "low" },
    },
  },
  actions: {
    type: "array",
    max: 4,
    item: {
      action: { type: "string", max: 200, fallback: "" },
      target: { type: "string", max: 80, fallback: "" },
      effort: { type: "enum", values: ["low", "medium", "high"], fallback: "medium" },
      expectedEffect: { type: "string", max: 160, fallback: "" },
    },
  },
  wasteAlert: { type: "string", max: 200, fallback: "" },
  summary: { type: "string", max: 400, fallback: "" },
};
