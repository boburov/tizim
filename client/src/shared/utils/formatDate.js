// O'zbekcha oy nomlari (kichik harf) - butun ilovadagi yagona sana formati uchun
const UZ_MONTHS = [
  "yanvar", "fevral", "mart", "aprel", "may", "iyun",
  "iyul", "avgust", "sentabr", "oktabr", "noyabr", "dekabr",
];

const UZ_WEEKDAYS = [
  "Yakshanba", "Dushanba", "Seshanba", "Chorshanba",
  "Payshanba", "Juma", "Shanba",
];

const toDate = (dateLike) => {
  if (!dateLike) return null;
  const d = new Date(dateLike);
  return Number.isNaN(d.getTime()) ? null : d;
};

// Yagona sana formati: "21-may, 2026"
export const formatDateUz = (dateLike) => {
  const d = toDate(dateLike);
  if (!d) return "-";
  return `${d.getDate()}-${UZ_MONTHS[d.getMonth()]}, ${d.getFullYear()}`;
};

// Eski nomlar bilan moslik - barchasi yagona "21-may, 2026" formatini beradi
export const formatDateUzLong = formatDateUz;
export const formatDateShort = formatDateUz;

// Hafta kuni bilan: "Dushanba, 21-may, 2026"
export const formatDateWithWeekday = (dateLike) => {
  const d = toDate(dateLike);
  if (!d) return "-";
  return `${UZ_WEEKDAYS[d.getDay()]}, ${formatDateUz(d)}`;
};

// Sana + vaqt: "21-may, 2026, 14:30" (withSeconds bilan: "21-may, 2026, 14:30:45")
export const formatDateTimeUz = (dateLike, { withSeconds = false } = {}) => {
  const d = toDate(dateLike);
  if (!d) return "-";
  const hh = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  let time = `${hh}:${min}`;
  if (withSeconds) time += `:${String(d.getSeconds()).padStart(2, "0")}`;
  return `${formatDateUz(d)}, ${time}`;
};

// HTML <input type="date"> uchun YYYY-MM-DD (mashina formati - o'zgartirilmaydi)
export const toDateInput = (dateLike) => {
  if (!dateLike) return "";
  const d = new Date(dateLike);
  if (Number.isNaN(d.getTime())) return "";
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
};

// Markaz vaqt zonasi (Asia/Tashkent) bo'yicha "bugun" - YYYY-MM-DD.
// Davomat sahifalarida default sana va max chegarasi server bilan mos bo'lishi
// uchun (brauzer boshqa TZ da bo'lsa ham). Server localTodayMidnight (+5) ishlatadi.
export const todayInput = () => {
  try {
    // en-CA → YYYY-MM-DD formati
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Tashkent",
    }).format(new Date());
  } catch {
    return toDateInput(new Date());
  }
};
