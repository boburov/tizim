// FEEDBACK TASNIFI - bitta xabar uchun.
//
// NEGA LLM: Feedback.message 5-2000 belgilik ERKIN MATN. Qoida qatlami
// bu yerda umuman ishlamaydi - 12 kishi bir xil muammoni 12 xil so'z
// bilan yozadi ("kech keldi", "20 daqiqa kutdik", "dars vaqtida
// boshlanmadi"). Ularni bir mavzuga yig'ish uchun matnni TUSHUNISH kerak.
//
// CHIQISH TIZIMDA QAYERGA KETADI:
//   subject + subjectHint → feedback qaysi obyektga tegishli (o'qituvchi/xona/narx)
//   urgency               → owner inbox'ida tartiblash
//   theme                 → feedbackThemes.prompt.js klasterlash uchun kirish
//
// DIQQAT: `urgency` LLM dan chiqadi va u BALL EMAS - u tartiblash uchun
// sifat belgisi. Moliyaviy yoki xavfsizlik qarori unga TAYANMAYDI.

export const FEEDBACK_CATEGORIES = [
  "teaching_quality", // dars sifati, tushuntirish, metodika
  "teacher_behavior", // munosabat, kechikish, e'tiborsizlik
  "schedule", // vaqt, jadval, dars bekor qilinishi
  "facility", // xona, jihoz, issiq/sovuq, internet
  "price_payment", // narx, to'lov, chegirma, qarz
  "administration", // qabul, hujjat, aloqa, javob bermaslik
  "content_material", // darslik, uy vazifasi, materiallar
  "praise", // maqtov (muammo emas)
  "other",
];

export const FEEDBACK_SENTIMENTS = ["negative", "neutral", "positive"];
export const FEEDBACK_URGENCIES = ["high", "medium", "low"];
export const FEEDBACK_SUBJECTS = ["teacher", "group", "branch", "center", "unknown"];

/**
 * @param {object} input
 * @param {string} input.message      - feedback matni (xom)
 * @param {string} [input.typeName]   - FeedbackType.name (owner sozlagan tur)
 * @param {string} [input.groupName]  - qaysi guruhga tegishli
 * @param {string} [input.authorRole] - "student" | "teacher" | "" (anonim)
 * @param {string[]} [input.groupTeachers] - shu guruhda O'SHA SANADA dars
 *        bergan o'qituvchilar ismi. Feedback modeli o'qituvchiga bog'lanmaydi
 *        (faqat guruhga), shuning uchun nomzodlar ro'yxati tashqaridan
 *        beriladi - LLM ularning ichidan tanlaydi, o'zi ism O'YLAB TOPMAYDI.
 */
export const buildPrompt = (input) => {
  const {
    message,
    typeName = "",
    groupName = "",
    authorRole = "",
    groupTeachers = [],
  } = input;

  return `Sen o'quv markazining sifat nazorati bo'yicha tahlilchisisan.
Quyidagi feedback xabarini tasniflaysan.

## KIRISH

Xabar matni:
"""
${message}
"""

Qo'shimcha kontekst:
- Feedback turi (owner sozlagan): ${typeName || "ko'rsatilmagan"}
- Guruh: ${groupName || "ko'rsatilmagan"}
- Muallif roli: ${authorRole || "anonim"}
- Shu guruhda dars bergan o'qituvchilar: ${
    groupTeachers.length ? groupTeachers.join(", ") : "ma'lum emas"
  }

## VAZIFA

Xabarni tahlil qilib, FAQAT JSON qaytar. Boshqa hech narsa yozma.

{
  "category": "<${FEEDBACK_CATEGORIES.join(" | ")}>",
  "sentiment": "<${FEEDBACK_SENTIMENTS.join(" | ")}>",
  "urgency": "<${FEEDBACK_URGENCIES.join(" | ")}>",
  "subject": "<${FEEDBACK_SUBJECTS.join(" | ")}>",
  "subjectHint": "<o'qituvchi ismi yoki bo'sh string>",
  "theme": "<3-6 so'zli qisqa mavzu nomi, o'zbekcha>",
  "summary": "<bir jumlada mohiyati, o'zbekcha, 120 belgidan kam>",
  "actionable": <true | false>,
  "confidence": <0.0 dan 1.0 gacha son>
}

## QOIDALAR

1. FAQAT JSON. Markdown bloki (\`\`\`), izoh, muqaddima YO'Q.

2. "subjectHint" ga ism YOZISH SHARTLARI:
   - xabarda ochiq aytilgan BO'LSA, VA
   - u yuqoridagi o'qituvchilar ro'yxatida BO'LSA.
   Ikkalasi ham bajarilmasa - bo'sh string. Ism O'YLAB TOPMA.
   Ro'yxatda yo'q ism yozish - eng og'ir xato: noto'g'ri odam ayblanadi.

3. "urgency" mezoni (matndagi dalilga tayan, his-tuyg'uga emas):
   - high   : bola xavfsizligi, haqorat, bir nechta o'quvchi ta'sirlangan,
              yoki "ketaman/pul qaytaring" deb ochiq aytilgan
   - medium : takrorlanadigan muammo, lekin ketish tahdidi yo'q
   - low    : bir martalik noqulaylik, taklif, maqtov

4. "theme" - KLASTERLASH uchun. Shuning uchun UMUMIY va TAKRORLANADIGAN
   bo'lsin: "o'qituvchi kechikishi" (yaxshi), "Aziz aka 20 daqiqa kech
   keldi" (yomon - bu bir martalik hodisa, boshqa xabar bilan birlashmaydi).

5. "actionable" - markaz BUGUN biror amal qila oladimi. Maqtov va umumiy
   fikr uchun false.

6. "confidence" - matn qisqa, tushunarsiz yoki ikki ma'noli bo'lsa PASAYTIR.
   0.5 dan past bo'lsa "category" ni "other" qil.

7. Ishonch yetmasa "unknown"/"other"/bo'sh string tanla. TAXMIN QILMA -
   noto'g'ri tasnif bo'sh tasnifdan yomonroq, chunki u qarorga asos bo'ladi.`;
};

// Javobni tekshirish sxemasi (zod emas - LLM javobi uchun sodda validator).
export const SCHEMA = {
  category: { type: "enum", values: FEEDBACK_CATEGORIES, fallback: "other" },
  sentiment: { type: "enum", values: FEEDBACK_SENTIMENTS, fallback: "neutral" },
  urgency: { type: "enum", values: FEEDBACK_URGENCIES, fallback: "low" },
  subject: { type: "enum", values: FEEDBACK_SUBJECTS, fallback: "unknown" },
  subjectHint: { type: "string", max: 100, fallback: "" },
  theme: { type: "string", max: 80, fallback: "" },
  summary: { type: "string", max: 200, fallback: "" },
  actionable: { type: "boolean", fallback: false },
  confidence: { type: "number", min: 0, max: 1, fallback: 0.5 },
};
