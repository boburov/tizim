// FEEDBACK MAVZULARI - haftalik klasterlash.
//
// BU ENG QIMMATLI PROMPT. Sabab: bitta shikoyat - hodisa, o'nta bir xil
// shikoyat - TIZIMLI MUAMMO. Owner 200 ta xabarni birma-bir o'qib, ular
// orasidagi naqshni ko'ra olmaydi. Qoida qatlami ham ko'ra olmaydi -
// matnlar bir-biriga so'zma-so'z o'xshamaydi.
//
// Kutilgan natija namunasi:
//   "Oxirgi 3 haftada 12 ta shikoyat bitta mavzuda: o'qituvchi kechikishi.
//    Eng ko'p — Ingliz tili B-2 va D-2 guruhlarida."
//
// RAQAMLAR HAQIDA: "12 ta" sonini LLM SANAMAYDI - u kirishda beriladi va
// LLM faqat qaysi xabarlar bir mavzuga tegishli ekanini aytadi. Sanashni
// chaqiruvchi kod bajaradi (LLM sanoqda ishonchsiz).

/**
 * @param {object} input
 * @param {Array}  input.items - tasniflangan feedbacklar:
 *        [{ id, theme, category, summary, groupName, urgency, createdAt }]
 * @param {string} input.periodLabel - "01.08 - 21.08" kabi oraliq nomi
 */
export const buildPrompt = ({ items, periodLabel }) => {
  // Xabarlar RAQAMLANGAN holda beriladi: LLM javobda aynan shu raqamlarga
  // ishora qiladi va biz uni ID ga qaytaramiz. Matnni qayta yozib
  // yubormasligi uchun - "qaysi xabarlar" savoliga aniq javob kerak.
  const list = items
    .map(
      (it, i) =>
        `${i + 1}. [${it.category}] ${it.summary || it.theme}` +
        (it.groupName ? ` (guruh: ${it.groupName})` : ""),
    )
    .join("\n");

  return `Sen o'quv markazining sifat nazorati tahlilchisisan.
Quyida ${periodLabel} oralig'idagi ${items.length} ta feedback xulosasi bor.
Vazifang - TAKRORLANUVCHI MUAMMOLARNI topish.

## XABARLAR

${list}

## VAZIFA

FAQAT JSON qaytar:

{
  "themes": [
    {
      "title": "<mavzu nomi, o'zbekcha, 3-6 so'z>",
      "itemNumbers": [<yuqoridagi ro'yxat raqamlari>],
      "category": "<eng ko'p uchragan kategoriya>",
      "severity": "<high | medium | low>",
      "affectedGroups": ["<guruh nomlari, faqat yuqorida ko'rsatilganlari>"],
      "insight": "<nima bo'layotgani, 1-2 jumla o'zbekcha>",
      "recommendation": "<markaz BUGUN qila oladigan aniq amal, 1 jumla>"
    }
  ],
  "isolated": [<hech bir mavzuga kirmagan xabar raqamlari>],
  "topConcern": "<eng jiddiy mavzu nomi yoki bo'sh string>"
}

## QOIDALAR

1. FAQAT JSON. Markdown bloki, izoh, muqaddima YO'Q.

2. MAVZU FAQAT 2 VA UNDAN ORTIQ xabardan tuziladi. Yakka xabar - mavzu
   emas, u "isolated" ga tushadi. Bitta shikoyatni "tizimli muammo" deb
   ko'rsatish - owner'ni noto'g'ri qarorga olib boradi.

3. Har bir xabar raqami FAQAT BITTA joyda bo'lsin: yo bitta mavzuda, yo
   "isolated" da. Takrorlanmasin, tushib qolmasin.

4. "affectedGroups" ga FAQAT yuqorida ko'rsatilgan guruh nomlarini yoz.
   Yangi nom qo'shma.

5. "severity" mezoni:
   - high   : 5+ xabar, YOKI ichida "high" shoshilinchlikdagi xabar bor,
              YOKI bir nechta guruhga tarqalgan
   - medium : 3-4 xabar, bitta guruh
   - low    : 2 xabar

6. "recommendation" ANIQ va BAJARILADIGAN bo'lsin.
   Yaxshi: "Ingliz tili B-2 o'qituvchisi bilan dars boshlanish vaqti
            bo'yicha suhbat o'tkazing"
   Yomon:  "Sifatni yaxshilash kerak"

7. Xabar SONI yozma ("12 ta shikoyat" kabi jumla TUZMA) - sanashni tizim
   o'zi bajaradi. Sen faqat qaysi raqamlar bir mavzuga tegishli ekanini
   ko'rsat.

8. Maqtov (praise) mavzusi ham chiqarilsin - nima YAXSHI ishlayotganini
   bilish ham qaror uchun kerak.`;
};

export const SCHEMA = {
  themes: {
    type: "array",
    max: 12,
    item: {
      title: { type: "string", max: 80, fallback: "" },
      itemNumbers: { type: "numberArray", max: 200 },
      category: { type: "string", max: 40, fallback: "other" },
      severity: { type: "enum", values: ["high", "medium", "low"], fallback: "low" },
      affectedGroups: { type: "stringArray", max: 30 },
      insight: { type: "string", max: 300, fallback: "" },
      recommendation: { type: "string", max: 300, fallback: "" },
    },
  },
  isolated: { type: "numberArray", max: 500 },
  topConcern: { type: "string", max: 80, fallback: "" },
};
