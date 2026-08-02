import { formatMoney } from "@/shared/utils/formatMoney";

// KO'RSATKICH POLYARLIGI - o'sish YAXSHIMI yoki YOMONMI.
//
// NEGA KERAK: "+20%" ni yashil qilib ko'rsatish faqat ba'zi
// ko'rsatkichlar uchun to'g'ri. "Yig'ilgan +20%" — yaxshi. "Kelmagan
// +20%" — YOMON, lekin ikkalasi ham musbat delta. Yo'nalishni ko'r-ko'rona
// rangga bog'lash owner'ga qarama-qarshi ma'no berardi va bu eng yomon
// turdagi xato: sahifa ishonch bilan noto'g'ri narsa aytadi.
//
// NOMA'LUM kalit RANGSIZ qoladi (neytral). Bu ataylab: kurs kesimida
// kalit kurs nomi bo'ladi (dinamik), va uni taxmin qilishdan ko'ra
// rang bermaslik xavfsizroq.

const HIGHER_IS_BETTER = new Set([
  // dashboard KPI
  "cashIn", "students",
  // brifing
  "revenue", "attendance", "studentFlow", "leads", "forecastGross",
  "collectionRate", "lessons",
  // hisobot
  "collected", "net", "cash", "rate", "joined", "graduated",
  "created", "enrolled", "conversion", "prevented", "doneByOwner",
]);

const LOWER_IS_BETTER = new Set([
  // brifing
  "atRisk", "overdue", "unmarked", "likelyAbsent", "followUps",
  // hisobot
  "absent", "left", "complaints", "lateMinutes", "missedLessons",
  "hrAbsences", "affected", "rejected", "occurred", "salaryPaid",
]);

/**
 * Delta rangi. null = rangsiz (neytral kulrang).
 *
 * `dismissed` ATAYLAB ro'yxatlarda yo'q: "to'g'ri emas" deb belgilangan
 * bahoning ko'payishi modelni kalibrlash uchun foydali signal, shuning
 * uchun uni "yomon" deb qizil qilish noto'g'ri xabar berardi.
 */
export const deltaTone = (key, delta) => {
  if (delta == null || delta === 0) return "text-muted-foreground";
  const good = HIGHER_IS_BETTER.has(key)
    ? delta > 0
    : LOWER_IS_BETTER.has(key)
      ? delta < 0
      : null;
  if (good == null) return "text-muted-foreground";
  return good
    ? "text-emerald-600 dark:text-emerald-400"
    : "text-rose-600 dark:text-rose-400";
};

/** Qiymatni birligiga qarab formatlaydi. */
export const formatMetric = (value, unit) => {
  if (value == null) return "—";
  if (unit === "so'm") return formatMoney(value);
  if (typeof value === "number") {
    return new Intl.NumberFormat("uz-UZ", { maximumFractionDigits: 0 }).format(value);
  }
  return String(value);
};

/** "+12%" / "−8%" - minus belgisi tipografik (U+2212), defis emas. */
export const formatDelta = (delta) => {
  if (delta == null) return null;
  if (delta === 0) return "0%";
  return delta > 0 ? `+${delta}%` : `−${Math.abs(delta)}%`;
};
