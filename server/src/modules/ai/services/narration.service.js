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

    // --- Davomat naqshi ---
    case "weekdayGap":
      return `Aynan ${f.value} kunlari qoldirishi boshqa kunlardan yuqori`;
    case "weekdayAbsences":
      return `Shu kunda ${f.value} marta kelmagan`;

    // --- O'quvchi o'sishi (imkoniyat) ---
    case "gradeImprovement":
      return `O'rtacha baho ${f.value} ballga ko'tarildi`;
    case "attendanceRate":
      return `Davomat darajasi ${f.value}%`;

    // --- O'qituvchi ---
    case "missedLessons":
      return `${f.value} ta dars o'tkazilmagan`;
    case "hrAbsences":
      return `Ishga ${f.value} kun kelmagan`;
    case "absenceThisWeek":
      return `Shu hafta ${f.value} marta kelmagan`;
    case "affectedGroups":
      return `${f.value} guruh dars o'tkazmagan kundan ta'sirlangan`;
    case "loadGap":
      return `O'quvchi soni filial o'rtachasidan ${f.value}% past`;
    case "studentCount":
      return `Jami ${f.value} o'quvchi`;
    case "outcomeLift":
      return `Uning guruhlarida baho o'sishi filial o'rtachasidan ${f.value} ball yuqori`;
    case "attendanceLift":
      return `Davomat filial o'rtachasidan ${f.value}% yuqori`;

    // --- Moliya ---
    case "overdueAmount":
      return `Muddati o'tgan qarz: ${fmtMoney(f.value)} so'm`;
    case "overduePeriods":
      return `${f.value} ta to'lov davri muddati o'tgan`;
    case "overdueStudents":
      return `${f.value} o'quvchida muddati o'tgan qarz bor`;
    case "oldestDebtDays":
      return `Eng eski qarz ${f.value} kundan beri turibdi`;
    case "forecastDrop":
      return `Keyingi oy daromadi ${f.value}% pasayishi kutilmoqda`;
    case "churnLoss":
      return `Ketish xavfi tufayli xavf ostidagi summa: ${fmtMoney(f.value)} so'm`;
    case "collectionGap":
      return `Kutilgan to'lovning ${f.value}% i tarixda yig'ilmagan`;
    case "expenseZScore":
      return `Maosh xarajati odatdagidan ${f.value} standart og'ishga farq qiladi`;
    case "expenseDelta":
      return `Maosh xarajati o'rtachadan ${fmtMoney(f.value)} so'mga farq qiladi`;
    case "cashflowNet":
      return `Joriy oy qoldig'i: ${fmtMoney(f.value)} so'm`;
    case "outflowRatio":
      return `Chiqim kirimning ${f.value}% ini tashkil qiladi`;

    // --- Lidlar ---
    case "waitingDays":
      return `${f.value} kundan beri javob kutmoqda`;
    case "trialAttended":
      return "Sinov darsiga kelgan, lekin hali yozilmagan";
    case "idleDays":
      return `${f.value} kundan beri hech qanday harakat yo'q`;
    case "followUpOverdue":
      return "Belgilangan qayta bog'lanish vaqti o'tib ketgan";
    case "conversionDrop":
      return `Lid konversiyasi ${f.value}% pasaydi`;
    case "leadVolume":
      return `Taqqoslashda ${f.value} ta lid ishtirok etdi`;

    // --- Guruhlar ---
    case "sizeGap":
      return `O'quvchi soni filial medianasidan ${f.value}% past`;
    case "groupSize":
      return `Guruhda ${f.value} o'quvchi bor`;
    case "netFlow":
      return `Oxirgi 60 kunda sof oqim: ${f.value > 0 ? "+" : ""}${f.value} o'quvchi`;
    case "complaintDelta":
      return `Shikoyatlar ${f.value > 0 ? "+" : ""}${f.value} ga o'zgardi`;
    case "complaintCount":
      return `Oxirgi 4 haftada ${f.value} shikoyat`;
    case "unresolvedComplaints":
      return `${f.value} shikoyat hali yopilmagan`;
    case "quietDays":
      return `${f.value} kun band kunlarga qaraganda bo'sh`;
    case "weekendGap":
      return `Dam olish kunlarida ish kunlariga nisbatan ${f.value}% kam dars bor`;

    // --- Kurslar ---
    case "courseAttendanceDrop":
      return `Kurs davomati ${f.value}% pasaydi`;
    case "courseChurn":
      return `Kursdan ${f.value}% o'quvchi ketgan`;
    case "demandOpen":
      return `${f.value} ta lid shu yo'nalishda javob kutmoqda`;
    case "demandTotal":
      return `Oxirgi 30 kunda ${f.value} ta lid shu yo'nalishga qiziqdi`;
    case "avgGroupSize":
      return `Guruhlarning o'rtacha to'ldirilishi: ${f.value} o'quvchi`;
    case "courseConversion":
      return `Yo'nalish konversiyasi ${f.value}%`;
    case "revenuePerStudent":
      return `Bir o'quvchidan o'rtacha ${fmtMoney(f.value)} so'm`;

    default:
      return `${f.label}: ${f.value}${f.unit ? " " + f.unit : ""}`;
  }
};

/**
 * UMUMIY NARRATOR - barcha yangi detektorlar shundan foydalanadi.
 *
 * Tuzilishi ataylab qat'iy va bir xil: sarlavha → sabablar → ta'sir →
 * ishonch ogohlantirishi. Owner har kuni 20 ta kartani o'qiydi, shuning
 * uchun ular BIR XIL shaklda bo'lishi kerak - har biri o'z uslubida
 * yozilsa, ro'yxat o'qilmaydigan bo'lib qoladi.
 *
 * @param {object} p
 * @param {string} p.headline - birinchi jumla (nima bo'lgani)
 * @param {"risk"|"watch"|"opportunity"} [p.stance]
 */
export const narrate = ({
  headline,
  factors = [],
  expectedImpact,
  confidence = 1,
  stance = "risk",
  maxFactors = 4,
}) => {
  const active = factors.filter((f) => f.normalized > 0.05).slice(0, maxFactors);
  const lines = [headline];

  if (active.length) {
    // Imkoniyatda "sabablar" g'alati eshitiladi - u muammo emas.
    lines.push(stance === "opportunity" ? "Asos:" : "Sabablar:");
    for (const f of active) lines.push(`• ${factorSentence(f)}.`);
  }

  if (expectedImpact?.amount > 0) {
    lines.push(
      stance === "opportunity"
        ? `Kutilayotgan qo'shimcha daromad: ${fmtMoney(expectedImpact.amount)} so'm.`
        : `Xavf ostidagi summa: ${fmtMoney(expectedImpact.amount)} so'm.`,
    );
  }

  // Ishonch past bo'lsa buni MATNDA ham aytamiz - badge yetarli emas,
  // chunki matn ko'chirilib boshqa joyga (Telegram, hisobot) tashlanishi mumkin.
  if (confidence < 0.4) {
    lines.push("Diqqat: ma'lumot yetarli emas, bu baho taxminiy.");
  }

  return lines.join("\n");
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
