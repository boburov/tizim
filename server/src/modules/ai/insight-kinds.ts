// INSIGHT TAKSONOMIYASI - bitta manba haqiqati.
//
// Har bir insight turi uchun uchta narsa shu yerda belgilanadi:
//   domain  - qaysi modul panelida ko'rinadi ("Finance → AI Insights")
//   subject - nimaga tegishli (o'quvchi, o'qituvchi, guruh, kurs, filial)
//   stance  - owner uni QANDAY o'qishi kerak:
//               risk        → yo'qotish ehtimoli, harakat talab qiladi
//               watch       → hozir muammo emas, lekin kuzatilsin
//               opportunity → o'sish taklifi, muammo EMAS
//
// NEGA ALOHIDA FAYL: bu jadval backend (Insight yaratish, domen bo'yicha
// filtr), joblar (qaysi detektor qachon ishlaydi) va frontend (modul
// panellari) tomonidan BIR XIL o'qilishi kerak. Uni model ichida qoldirish
// modelni import qilmaydigan joylarda takrorlanishga olib kelardi va
// taksonomiya ikkiga bo'linib ketardi.

export const INSIGHT_DOMAINS = Object.freeze([
  "students",
  "attendance",
  "finance",
  "teachers",
  "leads",
  "groups",
  "courses",
]);

export const INSIGHT_STANCES = Object.freeze(["risk", "watch", "opportunity"]);

// Detektor guruhlari: qaysi insight turlari QANCHA TEZ eskiradi.
//
//   fast  - kun ichida o'zgaradi (qarz, issiq lid, bugungi davomat) →
//           kunduzi har 3 soatda qayta hisoblanadi
//   slow  - haftalik trendga tayanadi (churn, o'qituvchi ko'rsatkichi,
//           kurs foydaliligi) → faqat tungi to'liq hisoblashda
//
// Bu bo'linish "AI har necha soatda yangilanadi" talabini ARZON qiladi:
// og'ir aggregation'lar kunduzi qayta ishlamaydi.
export const REFRESH_TIERS = Object.freeze({ FAST: "fast", SLOW: "slow" });

const K = (domain: string, subject: string, stance: string, tier: string) => ({ domain, subject, stance, tier });

export const INSIGHT_KIND_META: Record<string, any> = Object.freeze({
  // --- O'QUVCHILAR ---
  student_churn_risk: K("students", "student", "risk", REFRESH_TIERS.SLOW),
  student_improving: K("students", "student", "opportunity", REFRESH_TIERS.SLOW),

  // --- DAVOMAT ---
  attendance_anomaly: K("attendance", "student", "watch", REFRESH_TIERS.SLOW),

  // --- MOLIYA ---
  payment_risk: K("finance", "student", "risk", REFRESH_TIERS.FAST),
  overdue_payments: K("finance", "branch", "risk", REFRESH_TIERS.FAST),
  revenue_forecast_drop: K("finance", "branch", "risk", REFRESH_TIERS.SLOW),
  expense_anomaly: K("finance", "branch", "watch", REFRESH_TIERS.SLOW),
  cashflow_warning: K("finance", "branch", "risk", REFRESH_TIERS.FAST),

  // --- O'QITUVCHILAR ---
  teacher_attendance_issue: K("teachers", "teacher", "risk", REFRESH_TIERS.FAST),
  teacher_low_load: K("teachers", "teacher", "watch", REFRESH_TIERS.SLOW),
  teacher_top_performer: K("teachers", "teacher", "opportunity", REFRESH_TIERS.SLOW),

  // --- LIDLAR ---
  lead_hot: K("leads", "lead", "opportunity", REFRESH_TIERS.FAST),
  lead_stale: K("leads", "lead", "risk", REFRESH_TIERS.FAST),
  lead_conversion_drop: K("leads", "branch", "risk", REFRESH_TIERS.SLOW),

  // --- GURUHLAR ---
  group_underfilled: K("groups", "group", "watch", REFRESH_TIERS.SLOW),
  group_complaints: K("groups", "group", "risk", REFRESH_TIERS.SLOW),
  slot_opportunity: K("groups", "branch", "opportunity", REFRESH_TIERS.SLOW),

  // --- KURSLAR ---
  course_attendance_drop: K("courses", "course", "risk", REFRESH_TIERS.SLOW),
  course_demand: K("courses", "course", "opportunity", REFRESH_TIERS.SLOW),
  course_marketing: K("courses", "course", "opportunity", REFRESH_TIERS.SLOW),
});

export const INSIGHT_KINDS: string[] = Object.freeze(Object.keys(INSIGHT_KIND_META)) as never;

/** Insight turi → { domain, subject, stance, tier }. Noma'lum tur → null. */
export const kindMeta = (kind: string) => INSIGHT_KIND_META[kind] || null;

/** Berilgan domenga tegishli turlar (modul panellari uchun). */
export const kindsForDomain = (domain: string) =>
  INSIGHT_KINDS.filter((k) => INSIGHT_KIND_META[k].domain === domain);

/** Berilgan yangilanish darajasidagi turlar (joblar uchun). */
export const kindsForTier = (tier: string) =>
  INSIGHT_KINDS.filter((k) => INSIGHT_KIND_META[k].tier === tier);

/** Imkoniyatmi (xavf emas) - Action Center ularni ALOHIDA ro'yxatda ko'rsatadi. */
export const isOpportunity = (kind: string) => INSIGHT_KIND_META[kind]?.stance === "opportunity";

// O'zbekcha yorliqlar - UI va hisobot matnlari shu yerdan oladi.
// Kod inglizcha, owner ko'radigan matn o'zbekcha (kodbaza qoidasi).
export const DOMAIN_LABELS: Record<string, string> = Object.freeze({
  students: "O'quvchilar",
  attendance: "Davomat",
  finance: "Moliya",
  teachers: "O'qituvchilar",
  leads: "Lidlar",
  groups: "Guruhlar",
  courses: "Kurslar",
});

export const KIND_LABELS: Record<string, string> = Object.freeze({
  student_churn_risk: "Ketish xavfi",
  student_improving: "Tez o'sayotgan o'quvchi",
  attendance_anomaly: "G'ayrioddiy davomat naqshi",
  payment_risk: "To'lov kechikishi xavfi",
  overdue_payments: "Muddati o'tgan to'lovlar",
  revenue_forecast_drop: "Daromad pasayishi bashorati",
  expense_anomaly: "G'ayrioddiy xarajat",
  cashflow_warning: "Pul oqimi ogohlantirishi",
  teacher_attendance_issue: "O'qituvchi davomati",
  teacher_low_load: "O'qituvchi yuklamasi past",
  teacher_top_performer: "Eng samarali o'qituvchi",
  lead_hot: "Issiq lid",
  lead_stale: "Sovib qolgan lid",
  lead_conversion_drop: "Konversiya pasayishi",
  group_underfilled: "Guruh to'ldirilmagan",
  group_complaints: "Guruhda shikoyatlar ko'paydi",
  slot_opportunity: "Bo'sh dars vaqti",
  course_attendance_drop: "Kursda davomat pasaydi",
  course_demand: "Kursga talab yuqori",
  course_marketing: "Marketing imkoniyati",
});

// ═══════════════════════════════════════════════════════════════════════════
// Ilgari bu uchtasi `models/insight.model.js` ichida edi va Mongoose
// sxemasining `enum` i bo'lib xizmat qilardi. Model fayllari o'chirilgach
// qiymatlar VALIDATORGA kerak bo'lib qoladi
// (`modules/ai/validators/insight.validator.js`), shuning uchun bu yerga -
// qolgan insight taksonomiyasining YONIGA - ko'chirildi.
//
// Prisma `InsightSubjectType` / `InsightSeverity` / `InsightStatus`
// enumlari bilan AYNAN bir xil bo'lishi SHART.
// ═══════════════════════════════════════════════════════════════════════════
export const INSIGHT_SUBJECT_TYPES = Object.freeze([
  "student",
  "teacher",
  "group",
  "lead",
  "course",
  "branch",
]);

export const INSIGHT_SEVERITIES = Object.freeze(["high", "medium", "low"]);

export const INSIGHT_STATUSES = Object.freeze([
  "open",
  "acked",
  "done",
  "dismissed",
  "expired",
]);
