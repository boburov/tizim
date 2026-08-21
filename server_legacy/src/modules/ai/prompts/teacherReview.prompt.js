// O'QITUVCHI 360 - chorak/oylik sintez.
//
// ==========  ENG XAVFLI PROMPT - DIQQAT BILAN O'QING  ==========
//
// teacher.signal.js dagi ogohlantirish shu yerda ham amal qiladi:
//
//   "Qiyin guruh olgan o'qituvchi xom o'rtachada har doim yomon chiqadi.
//    Bunday insight bir marta ko'rsatilsa, owner butun tizimga
//    ishonishni to'xtatadi."
//
// Shuning uchun LLM ga XOM O'RTACHA BERILMAYDI. Unga BASELINE'GA
// NISBATAN FARQ beriladi - ya'ni "uning o'quvchilari qanchalik
// YAXSHILANDI", "uning o'quvchilari qanchalik yaxshi" emas.
//
// Bu insonning ish faoliyati haqidagi baho - noto'g'ri xulosa odamning
// ishiga va daromadiga ta'sir qiladi. Shuning uchun quyidagi qoidalar
// boshqa promptlardagidan qattiqroq.

/**
 * @param {object} input - HAMMASI kodda hisoblangan (teacher.signal.js)
 * @param {string} input.teacherName
 * @param {string} input.periodLabel
 * @param {object} input.metrics
 *   @param {number} metrics.groups          - guruhlar soni
 *   @param {number} metrics.students        - o'quvchilar soni
 *   @param {number} metrics.attendanceRate  - guruhlaridagi davomat %
 *   @param {number} metrics.attendanceVsBaseline - markaz o'rtachasidan farq (%)
 *   @param {number} metrics.gradeLift       - baho o'sishi (ball)
 *   @param {number} metrics.gradeLiftVsBaseline
 *   @param {number} metrics.churnCount      - davrda ketgan o'quvchi
 *   @param {number} metrics.churnVsBaseline
 *   @param {number} metrics.collectionRate  - guruhlarida to'lov yig'ilishi %
 *   @param {number} metrics.collectionVsBaseline
 *   @param {number} metrics.missedLessons   - o'tkazilmagan darslar
 *   @param {number} metrics.hrAbsences      - ishga kelmagan kunlar
 * @param {Array} [input.feedbackThemes] - shu o'qituvchi guruhlaridagi
 *        takrorlanuvchi feedback mavzulari [{ title, count, severity }]
 */
export const buildPrompt = (input) => {
  const { teacherName, periodLabel, metrics: m, feedbackThemes = [] } = input;

  const cmp = (v) => (v > 0 ? `+${v}` : String(v));

  const themeLines = feedbackThemes.length
    ? feedbackThemes
        .map((t) => `  - ${t.title} (${t.count} ta, ${t.severity})`)
        .join("\n")
    : "  (feedback yo'q)";

  return `Sen o'quv markazi rahbariga o'qituvchi faoliyati bo'yicha
maslahat beruvchi HR tahlilchisisan.

Quyidagi raqamlar TIZIM TOMONIDAN hisoblangan. Ularni qayta hisoblama.

## O'QITUVCHI: ${teacherName}
## DAVR: ${periodLabel}

### Yuklama
  Guruhlar: ${m.groups} ta
  O'quvchilar: ${m.students} ta

### Natijalar (markaz o'rtachasiga NISBATAN)
  Davomat: ${m.attendanceRate}% (o'rtachadan ${cmp(m.attendanceVsBaseline)}%)
  Baho o'sishi: ${m.gradeLift} ball (o'rtachadan ${cmp(m.gradeLiftVsBaseline)})
  Ketgan o'quvchi: ${m.churnCount} ta (o'rtachadan ${cmp(m.churnVsBaseline)})
  To'lov yig'ilishi: ${m.collectionRate}% (o'rtachadan ${cmp(m.collectionVsBaseline)}%)

### Intizom
  O'tkazilmagan darslar: ${m.missedLessons} ta
  Ishga kelmagan kunlar: ${m.hrAbsences} ta

### Guruhlaridagi feedback mavzulari
${themeLines}

## VAZIFA

FAQAT JSON qaytar:

{
  "verdict": "<strong | solid | mixed | needs_support>",
  "summary": "<2 jumlalik xulosa, o'zbekcha, HURMATLI ohangda>",
  "strengths": ["<kuchli tomon, har biri raqamga tayansin>"],
  "concerns": [
    {
      "issue": "<muammo, 1 jumla>",
      "evidence": "<yuqoridagi QAYSI raqam>",
      "severity": "<high | medium | low>"
    }
  ],
  "coachingActions": [
    {
      "action": "<rahbar qiladigan ANIQ amal, 1 jumla>",
      "why": "<nega, 1 jumla>"
    }
  ],
  "recognitionSuggested": <true | false>,
  "confidence": "<high | medium | low>"
}

## QOIDALAR (qattiq)

1. FAQAT JSON. Markdown bloki, izoh YO'Q.

2. XOM RAQAMGA EMAS, FARQGA QARA. "Davomat 78%" o'z-o'zicha yomon emas -
   agar markaz o'rtachasi 74% bo'lsa, bu YAXSHI natija. Har doim
   "o'rtachadan ${"${farq}"}" qismiga tayan.

3. YUKLAMANI HISOBGA OL. 6 guruh × 30 o'quvchi olgan o'qituvchida
   1 guruhlik o'qituvchiga qaraganda ko'proq ketish bo'lishi TABIIY.
   Buni "yomon ishlayapti" deb talqin qilma.

4. HAR BIR "concern" da "evidence" MAJBURIY va u yuqoridagi ANIQ raqamga
   ishora qilsin. Dalilsiz ayblov YOZMA - bu odamning ishi haqida.

5. MA'LUMOT KAM BO'LSA XULOSA CHIQARMA:
   - o'quvchi soni 5 dan kam, YOKI
   - davr 1 oydan qisqa
   bo'lsa: "confidence" = "low", "concerns" = bo'sh massiv, va "summary"
   da "baho berish uchun ma'lumot yetarli emas" deb yoz.

6. SHAXSIYATGA O'TMA. Faqat ISH natijasi haqida yoz.
   Yaxshi: "Oxirgi 3 oyda 4 marta dars o'tkazilmagan"
   Yomon:  "Mas'uliyatsiz", "e'tiborsiz", "dangasa"

7. "verdict" mezoni:
   - strong       : 2+ ko'rsatkich o'rtachadan yuqori, intizom toza
   - solid        : o'rtacha atrofida, jiddiy muammo yo'q
   - mixed        : ba'zi ko'rsatkich yaxshi, ba'zisi yomon
   - needs_support : 2+ ko'rsatkich o'rtachadan past YOKI intizom muammosi
   Diqqat: "needs_support" - JAZO EMAS, yordam kerakligi belgisi.

8. "coachingActions" - rahbar qiladigan amal, o'qituvchiga tanbeh emas.
   Yaxshi: "Ingliz tili B-2 guruhida davomat pastligi sababini
            o'qituvchi bilan birga aniqlang"
   Yomon:  "Davomatni yaxshilashini ayting"

9. "recognitionSuggested" = true faqat "strong" bo'lganda - va bu
   mukofot MIQDORINI bildirmaydi, faqat "e'tirof qilishga arziydi".

10. Barcha matn o'zbekcha, hurmatli ohangda.`;
};

export const SCHEMA = {
  verdict: {
    type: "enum",
    values: ["strong", "solid", "mixed", "needs_support"],
    fallback: "solid",
  },
  summary: { type: "string", max: 400, fallback: "" },
  strengths: { type: "stringArray", max: 5 },
  concerns: {
    type: "array",
    max: 5,
    item: {
      issue: { type: "string", max: 200, fallback: "" },
      evidence: { type: "string", max: 160, fallback: "" },
      severity: { type: "enum", values: ["high", "medium", "low"], fallback: "low" },
    },
  },
  coachingActions: {
    type: "array",
    max: 4,
    item: {
      action: { type: "string", max: 200, fallback: "" },
      why: { type: "string", max: 200, fallback: "" },
    },
  },
  recognitionSuggested: { type: "boolean", fallback: false },
  confidence: { type: "enum", values: ["high", "medium", "low"], fallback: "low" },
};
