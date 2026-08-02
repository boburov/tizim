// DASHBOARD DIZAYN TILI - to'rtta daraja, bitta joyda.
//
// NEGA BITTA FAYL: sahifada rang MA'NO tashiydi ("qizil = hoziroq
// qilinsin"). Agar har komponent o'z ranglarini tanlasa, bir ekranda
// ikki xil "ogohlantirish qizili" paydo bo'ladi va rang ma'nosini
// yo'qotadi - owner esa qaysi biri jiddiyroq ekanini taxmin qilishga
// majbur bo'ladi.
//
// RANG QOIDASI (kodbazadagi mavjud naqsh - AiRiskBadge bilan bir xil):
// status ranglari semantik token EMAS, chunki ular ma'no tashiydi;
// lekin har birining `dark:` varianti bor, aks holda qorong'i rejimda
// o'qilmay qoladi.
//
// GRAFIKLARDA STATUS RANGI ISHLATILMAYDI. Diagramma ustunlari `primary`
// bilan chiziladi: qizil ustun "yomon oy" degan ma'no berardi, holbuki
// u shunchaki "kichikroq son". Status rangi faqat HOLAT uchun.

export const LEVELS = ["critical", "warning", "good", "info", "unknown"];

export const LEVEL_STYLES = {
  critical: {
    label: "Kritik",
    text: "text-rose-600 dark:text-rose-400",
    surface: "bg-rose-50 dark:bg-rose-500/10",
    border: "border-rose-200 dark:border-rose-500/30",
    chip: "bg-rose-100 text-rose-700 dark:bg-rose-500/15 dark:text-rose-300",
    solid: "bg-rose-500",
  },
  warning: {
    label: "Diqqat",
    text: "text-amber-600 dark:text-amber-400",
    surface: "bg-amber-50 dark:bg-amber-500/10",
    border: "border-amber-200 dark:border-amber-500/30",
    chip: "bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300",
    solid: "bg-amber-500",
  },
  good: {
    label: "Yaxshi",
    text: "text-emerald-600 dark:text-emerald-400",
    surface: "bg-emerald-50 dark:bg-emerald-500/10",
    border: "border-emerald-200 dark:border-emerald-500/30",
    chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300",
    solid: "bg-emerald-500",
  },
  info: {
    label: "Imkoniyat",
    text: "text-sky-600 dark:text-sky-400",
    surface: "bg-sky-50 dark:bg-sky-500/10",
    border: "border-sky-200 dark:border-sky-500/30",
    chip: "bg-sky-100 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
    solid: "bg-sky-500",
  },
  // Ma'lumot yetishmasligi - RANGSIZ. Ilgari bunday holat "yashil"
  // ko'rsatilardi va owner "hammasi joyida" deb o'qirdi, holbuki
  // hech narsa o'lchanmagan edi.
  unknown: {
    label: "Ma'lumot yo'q",
    text: "text-muted-foreground",
    surface: "bg-muted/40",
    border: "border-border",
    chip: "bg-muted text-muted-foreground",
    solid: "bg-border",
  },
};

export const levelStyle = (level) => LEVEL_STYLES[level] || LEVEL_STYLES.unknown;

/** Insight jiddiyligi → dashboard darajasi. */
export const severityLevel = (severity, stance) => {
  if (stance === "opportunity") return "info";
  if (severity === "high") return "critical";
  if (severity === "medium") return "warning";
  return "good";
};

/** "2 soat oldin" - AI qachon o'ylagani. Aniq soatdan muhimroq. */
export const relativeUz = (dateLike) => {
  if (!dateLike) return null;
  const diff = Date.now() - new Date(dateLike).getTime();
  if (Number.isNaN(diff)) return null;
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "hozirgina";
  if (mins < 60) return `${mins} daqiqa oldin`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} soat oldin`;
  const days = Math.round(hours / 24);
  return `${days} kun oldin`;
};

/**
 * TAVSIYA KALITI → EKRAN MANZILI.
 *
 * "Bir bosishda harakat" degani shu: tavsiya matni ("12 qarzdor bilan
 * bog'laning") tugmaga aylanadi va owner'ni AYNAN o'sha ish qilinadigan
 * ekranga olib boradi. Manzilsiz tavsiya - bu shunchaki maslahat, va
 * maslahat ikkinchi haftada o'qilmay qoladi.
 *
 * Kalit ro'yxatda bo'lmasa `null` qaytadi va chaqiruvchi insight'ning
 * o'z havolasiga (sourceRefs / subjectHref) tushadi. YO'Q MANZILNI
 * TAXMIN QILMAYMIZ: 404 butun sahifaga bo'lgan ishonchni yo'qotadi.
 */
const ACTION_ROUTES = {
  // Moliya
  call_debtors: "/owner/students/qarzdorlar",
  accelerate_collection: "/owner/students/qarzdorlar",
  review_writeoff: "/owner/finance/write-offs",
  review_salary_month: "/owner/teachers/maoshlar",
  // O'quvchilar
  work_churn_list: "/owner/ai/tasks",
  investigate_outflow: "/owner/students/chiqib-ketish",
  // Lidlar / sotuv
  call_lead: "/owner/leads",
  recontact_lead: "/owner/leads",
  contact_waiting_leads: "/owner/leads",
  boost_enrollment: "/owner/leads",
  fill_group: "/owner/leads",
  review_funnel: "/owner/leads/statistika",
  increase_marketing: "/owner/leads/statistika",
  review_rejection_reasons: "/owner/settings/lidlar/rad-etish",
  link_course_direction: "/owner/settings/lidlar/yonalish",
  // Guruh / kurs
  open_new_group: "/owner/groups",
  open_group_quiet_slot: "/owner/groups",
  expand_weekend: "/owner/groups",
  review_course_teachers: "/owner/teachers",
  // Sifat
  read_complaints: "/owner/feedback",
  close_complaints: "/owner/feedback",
  survey_course_students: "/owner/feedback",
};

/**
 * Tavsiya uchun bosiladigan manzil.
 * @param {object} action - {key, label}
 * @param {object} insight - manba insight (zaxira havola uchun)
 */
export const actionHref = (action, insight) =>
  ACTION_ROUTES[action?.key] ||
  insight?.sourceRefs?.[0]?.href ||
  insight?.subjectHref ||
  null;

/** Ball (0..100) → daraja. Backend'dagi healthLevel bilan BIR XIL. */
export const scoreLevel = (score) => {
  if (score == null) return "unknown";
  if (score >= 75) return "good";
  if (score >= 50) return "warning";
  return "critical";
};
