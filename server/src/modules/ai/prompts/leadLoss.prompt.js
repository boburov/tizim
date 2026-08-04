// LID YO'QOTISH SABABI - bitta lid uchun.
//
// SAVOL: "nega markazga kelmayapti?"
//
// Tizimda `rejectionReason` bor (LeadOption ref) - lekin u QO'LDA
// tanlanadi va amalda ko'pincha bo'sh yoki "Boshqa" bo'lib qoladi.
// Haqiqiy sabab `notes` va `followUpNote` ichida erkin matnda yashiringan:
//   "narxi qimmat dedi", "uydan uzoq ekan", "boshqa markazga yozilibdi",
//   "kechqurun vaqti yo'q ekan"
//
// Qoida qatlami bu matnlarni o'qiy olmaydi. LLM esa ularni TASNIFLAYDI va
// natijada "40 ta yo'qotilgan liddan 23 tasi NARX sababli" degan xulosa
// chiqadi - bu narx siyosati qarori uchun asos.
//
// DIQQAT: statusHistory dan chiqadigan "qaysi bosqichda tushdi" ma'lumoti
// LLM ga BERILADI, lekin u KODDA hisoblanadi. LLM voronkani o'zi o'lchamaydi.

export const LOSS_REASONS = [
  "price", // qimmat, byudjet yetmadi
  "location", // uzoq, qatnov qiyin
  "schedule", // vaqt mos kelmadi
  "competitor", // boshqa markazni tanladi
  "no_response", // javob bermadi, telefon ko'tarmadi
  "postponed", // keyinroqqa qoldirdi (yo'qotilmagan!)
  "not_interested", // qiziqmadi / faqat so'rab ko'rdi
  "wrong_fit", // yosh/daraja mos emas
  "internal", // markaz aybi: javob kech, xodim e'tiborsiz
  "unknown",
];

/**
 * @param {object} input
 * @param {string} [input.rejectionNote]   - Lead.rejectionNote - ENG KUCHLI
 *        SIGNAL. Lid yopilayotganda xodimdan MAJBURIY so'raladi (kamida
 *        10 belgi) va aynan "mijoz nima dedi?" savoliga javob bo'ladi.
 *        Boshqa maydonlardan farqi: u YOPISH PAYTIDA yozilgan, ya'ni
 *        sabab hali xodim yodida turganda.
 * @param {string} [input.notes]           - Lead.notes (umumiy izohlar)
 * @param {string} [input.followUpNote]    - Lead.followUpNote
 * @param {string} [input.rejectionReason] - LeadOption.name (qo'lda tanlangan)
 * @param {string} [input.sourceName]      - qaysi kanaldan kelgan
 * @param {string} [input.directionName]   - qaysi yo'nalishga qiziqqan
 * @param {string} input.lastStage         - KODDA hisoblangan oxirgi bosqich
 * @param {number} input.daysInPipeline    - KODDA hisoblangan kun soni
 */
export const buildPrompt = (input) => {
  const {
    rejectionNote = "",
    notes = "",
    followUpNote = "",
    rejectionReason = "",
    sourceName = "",
    directionName = "",
    lastStage,
    daysInPipeline,
  } = input;

  const hasText = Boolean(
    rejectionNote.trim() || notes.trim() || followUpNote.trim(),
  );

  return `Sen o'quv markazining sotuv tahlilchisisan.
Quyidagi lid (potensial o'quvchi) markazga YOZILMADI. Sababini aniqla.

## KIRISH

Yopish izohi (ENG ISHONCHLI MANBA - yopish paytida yozilgan):
"""
${rejectionNote || "(bo'sh)"}
"""

Xodim izohi:
"""
${notes || "(bo'sh)"}
"""

Qayta bog'lanish izohi:
"""
${followUpNote || "(bo'sh)"}
"""

Tizim ma'lumoti (bular ALLAQACHON hisoblangan - qayta hisoblama):
- Qo'lda tanlangan rad sababi: ${rejectionReason || "tanlanmagan"}
- Kelgan kanal: ${sourceName || "noma'lum"}
- Qiziqqan yo'nalish: ${directionName || "noma'lum"}
- Oxirgi bosqich: ${lastStage}
- Voronkada turgan kun: ${daysInPipeline}

## VAZIFA

FAQAT JSON qaytar:

{
  "reason": "<${LOSS_REASONS.join(" | ")}>",
  "objection": "<mijozning aynan e'tirozi, o'zbekcha, 1 jumla yoki bo'sh>",
  "competitorMentioned": "<raqobatchi nomi yoki bo'sh string>",
  "priceExpectation": <mijoz aytgan summa (raqam) yoki null>,
  "recoverable": <true | false>,
  "recoveryAction": "<qaytarish uchun aniq amal yoki bo'sh string>",
  "internalFault": <true | false>,
  "confidence": <0.0 dan 1.0 gacha>
}

## QOIDALAR

1. FAQAT JSON. Markdown bloki, izoh YO'Q.

2. ${
    hasText
      ? "Izoh matni bor - sababni ASOSAN shundan chiqar. Manbalar " +
        "ziddiyatli bo'lsa YOPISH IZOHIGA ustunlik ber: u yopish paytida, " +
        "sabab hali aniq bo'lganda yozilgan."
      : "IZOH MATNI BO'SH. Bu holda \"reason\" ni faqat qo'lda tanlangan " +
        'sabab aniq bo\'lsa yoz, aks holda "unknown" qil va confidence ni ' +
        "0.3 dan past ber. Bo'sh matndan sabab TO'QIMA."
  }

3. "priceExpectation" - FAQAT matnda ANIQ summa aytilgan bo'lsa
   (masalan "400 mingga rozi edi"). Aks holda null.
   Summani taxmin qilish - eng zararli xato: u narx qaroriga ta'sir qiladi.

4. "competitorMentioned" - faqat matnda nomi aytilgan bo'lsa. Markaz nomini
   O'YLAB TOPMA.

5. "internalFault" = true FAQAT matnda markaz aybi ko'rinsa
   ("qo'ng'iroq qilmadik", "javob bermadik", "unutib qo'yibmiz").
   Bu og'ir ayblov - dalilsiz qo'yma.

6. "recoverable":
   - true  : "postponed", "no_response", "schedule" - qayta urinish mantiqli
   - false : "not_interested", "wrong_fit", "competitor" (yozilib bo'lgan)
   - "price" uchun: chegirma imkoni bo'lsa true

7. "recoveryAction" ANIQ bo'lsin.
   Yaxshi: "Sentyabr guruhida kechki vaqt ochilganda qayta qo'ng'iroq qiling"
   Yomon:  "Yana bog'laning"

8. Ishonch yetmasa "unknown" tanla va confidence ni pasaytir.`;
};

export const SCHEMA = {
  reason: { type: "enum", values: LOSS_REASONS, fallback: "unknown" },
  objection: { type: "string", max: 200, fallback: "" },
  competitorMentioned: { type: "string", max: 80, fallback: "" },
  priceExpectation: { type: "number", min: 0, max: 100_000_000, nullable: true },
  recoverable: { type: "boolean", fallback: false },
  recoveryAction: { type: "string", max: 200, fallback: "" },
  internalFault: { type: "boolean", fallback: false },
  confidence: { type: "number", min: 0, max: 1, fallback: 0.4 },
};
