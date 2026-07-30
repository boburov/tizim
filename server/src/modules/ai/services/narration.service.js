// DETERMINISTIK NARRATOR - LLMsiz o'zbekcha matn.
//
// Faza 1 da AI matni ATAYLAB shablondan chiqadi. Sabab: agar deterministik
// qatlam o'zi qiymat bermasa, LLM uni qutqarmaydi. Shablon matn "yetarli
// darajada yaxshi" bo'lishi kerak - LLM keyin uni SIFATLI qiladi, MAVJUD
// qilmaydi.
//
// Faza 3 da gemini.service.js shu funksiyaning chiqishini almashtiradi,
// lekin kirish (factors[]) o'zgarmaydi - shuning uchun LLM ishlamay qolsa
// tizim shablonga qaytadi va hech narsa buzilmaydi.

const SEVERITY_LABEL = {
  high: "Yuqori",
  medium: "O'rta",
  low: "Past",
};

const fmtMoney = (n) =>
  new Intl.NumberFormat("uz-UZ", { maximumFractionDigits: 0 }).format(
    Math.round(n || 0),
  );

/** Bitta faktorni o'qiladigan jumlaga aylantiradi. */
const factorSentence = (f) => {
  switch (f.key) {
    case "attendanceDrop":
      return `Davomat ${f.value}% ga pasaydi`;
    case "absenceStreak":
      return `Ketma-ket ${f.value} ta darsni qoldirdi`;
    case "debtDays":
      return `To'lov ${f.value} kun kechikkan`;
    case "gradeTrend":
      return `O'rtacha baho ${f.value} ballga tushdi`;
    case "groupChurn":
      return `Guruhdan ${f.value}% o'quvchi ketgan`;
    case "freezeHistory":
      return `Ilgari ${f.value} marta muzlatgan`;
    // DIQQAT: bu yerdagi matn faktorning BIRLIGIGA mos bo'lishi shart.
    // latePaymentHistory foizda ("%"), unpaidPeriods esa donada ("ta") -
    // ularni almashtirib yuborish owner ko'radigan raqamni yolg'on qiladi.
    case "latePaymentHistory":
      return `To'lovlarning ${f.value}% i kechikib amalga oshirilgan`;
    case "unpaidPeriods":
      return `${f.value} ta oylik to'lov to'liq yopilmagan`;
    case "currentDebtDays":
      return `Joriy qarz ${f.value} kundan beri turibdi`;
    default:
      return `${f.label}: ${f.value}${f.unit ? " " + f.unit : ""}`;
  }
};

/**
 * Ochiq faktorlardan o'zbekcha xulosa yozadi.
 * Faqat HAQIQIY hissa qo'shgan faktorlar kiritiladi (normalized > 0.05) -
 * "davomat 0% ga pasaydi" kabi bo'sh jumlalar chiqmaydi.
 */
export const narrateChurn = ({ subjectLabel, score, confidence, severity, factors, expectedImpact }) => {
  const active = factors.filter((f) => f.normalized > 0.05).slice(0, 4);
  const pct = Math.round(score * 100);

  const lines = [];
  lines.push(
    `${subjectLabel} — ketish xavfi ${SEVERITY_LABEL[severity]} (${pct}%).`,
  );

  if (active.length) {
    lines.push("Sabablar:");
    for (const f of active) lines.push(`• ${factorSentence(f)}.`);
  } else {
    lines.push("Aniq xavf signali topilmadi.");
  }

  if (expectedImpact?.amount > 0) {
    lines.push(
      `Xavf ostidagi oylik daromad: ${fmtMoney(expectedImpact.amount)} so'm.`,
    );
  }

  // Ishonch past bo'lsa buni MATNDA ham aytamiz - badge yetarli emas,
  // chunki matn ko'chirilib boshqa joyga tashlanishi mumkin.
  if (confidence < 0.4) {
    lines.push(
      "Diqqat: ma'lumot yetarli emas, bu baho taxminiy (yangi o'quvchi yoki kam dars).",
    );
  }

  return lines.join("\n");
};

export const narratePaymentRisk = ({ subjectLabel, score, factors, expectedImpact }) => {
  const active = factors.filter((f) => f.normalized > 0.05).slice(0, 3);
  const pct = Math.round(score * 100);
  const lines = [`${subjectLabel} — kechikib to'lash ehtimoli ${pct}%.`];
  if (active.length) {
    lines.push("Sabablar:");
    for (const f of active) lines.push(`• ${factorSentence(f)}.`);
  }
  if (expectedImpact?.amount > 0) {
    lines.push(`Kutilayotgan qarz: ${fmtMoney(expectedImpact.amount)} so'm.`);
  }
  return lines.join("\n");
};
