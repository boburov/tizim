// Ro'yxatga olingan sanadan bugungacha o'tgan vaqtni hisoblaydi.
// Har render'da "bugun"dan qayta hisoblanadi - shuning uchun vaqt o'tishi
// bilan o'zi yangilanadi (saqlanmaydi).

// Ikki sana orasidagi to'liq yil/oy/kun farqini qaytaradi (kalendar bo'yicha).
export const diffYMD = (fromLike, toLike = new Date()) => {
  if (!fromLike) return null;
  const from = new Date(fromLike);
  const to = new Date(toLike);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  if (from.getTime() > to.getTime()) return { years: 0, months: 0, days: 0 };

  let years = to.getFullYear() - from.getFullYear();
  let months = to.getMonth() - from.getMonth();
  let days = to.getDate() - from.getDate();

  if (days < 0) {
    // Oldingi oyning kunlar sonini qarzga olamiz.
    const prevMonthDays = new Date(to.getFullYear(), to.getMonth(), 0).getDate();
    days += prevMonthDays;
    months -= 1;
  }
  if (months < 0) {
    months += 12;
    years -= 1;
  }
  return { years, months, days };
};

// "3 oy, 12 kun" / "1 yil, 2 oy" ko'rinishidagi qisqa o'zbekcha matn.
// Eng katta ikkita birlikni ko'rsatadi (yil bo'lsa kun tashlanadi).
// completedAt berilsa - muddat shu sanada muzlatiladi (yakunlaganlar uchun).
export const formatEnrolledDuration = (enrolledAt, completedAt) => {
  const d = diffYMD(enrolledAt, completedAt || new Date());
  if (!d) return "-";

  const { years, months, days } = d;
  const parts = [];
  if (years > 0) parts.push(`${years} yil`);
  if (months > 0) parts.push(`${months} oy`);
  // Kun faqat yil bo'lmaganda ko'rsatiladi (chiroyliroq ko'rinish uchun).
  if (years === 0 && days > 0) parts.push(`${days} kun`);

  if (parts.length === 0) return "bugun qo'shildi";
  return parts.slice(0, 2).join(", ");
};

// Davomiylik kohortasi kaliti (server bilan bir xil chegaralar).
export const enrollmentBucketKey = (enrolledAt) => {
  const d = diffYMD(enrolledAt);
  if (!d) return null;
  const months = d.years * 12 + d.months;
  if (months < 3) return "0-3";
  if (months < 6) return "3-6";
  if (months < 12) return "6-12";
  return "12+";
};
